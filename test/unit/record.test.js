import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ensureFixtures, media } from "../fixtures/ensure.js";
import { box } from "../../src/media/mp4/boxes.js";
import { closest, runDownload, planDownload } from "../../src/direct/record/manifest-download.js";
import { createManifests, sameLength } from "../../src/direct/record/manifests.js";
import { startMse, startRaw, rawWriters } from "../../src/direct/record/mse-capture.js";

before(() => ensureFixtures());

const read = (f) => new Uint8Array(fs.readFileSync(path.join(media, f)));
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
});

// A stand-in for capture (src/capture/index.js) with the given buffers.
function fakeCapture(list) {
  const listeners = new Set();
  globalThis.window = {
    __gafferCapture: {
      buffers: () => list,
      listen(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },
  };
  return (e, bytes) => listeners.forEach((fn) => fn(e, bytes));
}

const video = { currentSrc: "blob:https://example.test/1" };

test("closest: at equal height the highest bitrate wins when the bitrate is not known", () => {
  const list = [
    { height: 720, bandwidth: 1000 },
    { height: 1080, bandwidth: 3000 },
    { height: 1080, bandwidth: 6000 },
    { height: 1080, bandwidth: 4000 },
  ];
  assert.equal(closest(list, 1080, Infinity).bandwidth, 6000);
  assert.equal(closest(list, 1080, 3900).bandwidth, 4000);
  assert.equal(closest(list, 700, Infinity).bandwidth, 1000);
});

test("download: a chunk the muxer cannot read ends the download with an error instead of hanging", async () => {
  // A moov whose track has no tkhd: reading it throws.
  const bad = box("moov", box("trak", new Uint8Array(0)));
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bad.buffer.slice(bad.byteOffset, bad.byteOffset + bad.length) });
  const plan = { jobs: [{ key: "v", uri: "https://example.test/init.mp4", init: true, start: 0 }, { key: "v", uri: "https://example.test/1.m4s", init: false, start: 0 }], sources: 1 };
  let timer;
  const late = new Promise((_, no) => (timer = setTimeout(() => no(new Error("the download never ended")), 2000)));
  const run = runDownload(plan, { write: () => {}, part: () => {}, progress: () => {} });
  await assert.rejects(Promise.race([run, late]), (e) => e.message !== "the download never ended");
  clearTimeout(timer);
});

test("MSE: buffers the muxer cannot combine are reported after startMse returned, so it can be stopped", async () => {
  const list = [
    { mime: "video/mp4", init: read("dash/init-stream1.m4s") },
    { mime: "audio/mp4", init: read("dash/init-stream3.m4s") },
    { mime: "audio/mp4", init: read("dash/init-stream3.m4s") },
  ];
  fakeCapture(list);
  const seen = [];
  let m = null;
  await new Promise((resolve) => {
    m = startMse(video, null, {
      write: () => {},
      part: () => {},
      unsupported: (r) => {
        seen.push(r);
        m.stop();
        resolve();
      },
      noInit: () => {},
      requestInit: async () => false,
    });
    assert.deepEqual(seen, [], "not reported during startMse");
  });
  assert.deepEqual(seen, ["structure"]);
});

test("raw WebM: an init that arrives late still starts its own file, whatever the other file holds", () => {
  const ebml = (n) => Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, n);
  const cluster = (n) => Uint8Array.of(0x1f, 0x43, 0xb6, 0x75, n);
  const v = { mime: "video/webm", init: null };
  const a = { mime: "audio/webm", init: ebml(2) };
  const send = fakeCapture([v, a]);
  const files = [[], []];
  const r = startRaw(video, null, rawWriters(files.map((f) => ({ write: (x) => f.push(x[4]) }))));
  send(a, cluster(20));
  send(v, cluster(10));
  send(v, ebml(1));
  send(v, cluster(11));
  r.stop();
  assert.deepEqual(files[0], [1, 11], "the video file starts with its init");
  assert.deepEqual(files[1], [2, 20]);
});

test("download: picture and sound that can't be combined give a translated reason", async () => {
  const init = read("dash/init-stream1.m4s");
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => init.slice().buffer });
  const plan = { jobs: [{ key: "v", uri: "https://example.test/v.mp4", init: true, start: 0 }, { key: "a", uri: "https://example.test/a.mp4", init: true, start: 0 }], sources: 2 };
  await assert.rejects(runDownload(plan, { write: () => {}, part: () => {}, progress: () => {} }), { message: "the stream's picture and sound can't be combined into one file" });
});

test("download: a DASH stream with several periods gets the init of each period", async () => {
  const mpd = `<MPD type="static" mediaPresentationDuration="PT8S">
    <Period id="1" duration="PT4S"><AdaptationSet contentType="video"><Representation id="v" bandwidth="1000" height="720">
      <SegmentTemplate initialization="p1/init.mp4" media="p1/$Number$.m4s" duration="2" timescale="1"/></Representation></AdaptationSet></Period>
    <Period id="2" duration="PT4S"><AdaptationSet contentType="video"><Representation id="v" bandwidth="1000" height="720">
      <SegmentTemplate initialization="p2/init.mp4" media="p2/$Number$.m4s" duration="2" timescale="1"/></Representation></AdaptationSet></Period>
  </MPD>`;
  const plan = await planDownload("https://cdn.test/a.mpd", mpd, { videoHeight: 720 }, null);
  const names = plan.jobs.map((j) => j.uri.replace("https://cdn.test/", ""));
  assert.deepEqual(names, ["p1/init.mp4", "p1/1.m4s", "p1/2.m4s", "p2/init.mp4", "p2/1.m4s", "p2/2.m4s"]);
});

const hls = (seconds, end = true) => "#EXTM3U\n#EXT-X-TARGETDURATION:10\n" + "#EXTINF:10,\nseg.ts\n".repeat(seconds / 10) + (end ? "#EXT-X-ENDLIST\n" : "");

test("manifests: only a manifest as long as the video counts, the player's own first", async () => {
  const pages = { "https://cdn.test/movie.m3u8": hls(600), "https://cdn.test/ad.m3u8": hls(30) };
  const m = createManifests({ fetch: async (u) => pages[u] });
  m.add("https://cdn.test/movie.m3u8");
  m.add("https://cdn.test/ad.m3u8");
  await m.refresh();
  assert.equal(m.current(null, 600).url, "https://cdn.test/movie.m3u8");
  assert.equal(m.current(null, 30).url, "https://cdn.test/ad.m3u8");
  assert.equal(m.current("https://cdn.test/ad.m3u8", 600).url, "https://cdn.test/movie.m3u8");
  assert.equal(m.current(null, 300), null);
  assert.equal(m.current(null, Infinity).url, "https://cdn.test/ad.m3u8");
  assert.equal(sameLength(600, 609), true);
  assert.equal(sameLength(600, 620), false);
});

test("manifests: a live manifest is read again and can end; one pushed out is forgotten", async () => {
  let time = 0;
  let ended = false;
  const reads = [];
  const m = createManifests({ now: () => time, fetch: async (u) => (reads.push(u), u.includes("live") ? hls(60, ended) : hls(60)) });
  m.add("https://cdn.test/live.m3u8");
  await m.refresh();
  assert.equal(m.current(null, NaN).live, true);
  ended = true;
  time = 5000;
  await m.refresh();
  assert.equal(m.current(null, NaN).live, true, "not yet read again");
  time = 10000;
  await m.refresh();
  assert.equal(m.current(null, NaN).live, false);
  assert.equal(reads.length, 2);
  for (let i = 0; i < 40; i++) m.add("https://cdn.test/other" + i + ".m3u8");
  m.add("https://cdn.test/live.m3u8");
  await m.refresh();
  assert.ok(reads.lastIndexOf("https://cdn.test/live.m3u8") > 1, "read again after it was forgotten");
});

test("capture: a buffer in use keeps its init, however many buffers come after it", async () => {
  class SB {
    appendBuffer() {}
  }
  class MS {
    constructor() {
      this.sourceBuffers = [];
      this.readyState = "open";
    }
    addSourceBuffer() {
      const sb = new SB();
      this.sourceBuffers.push(sb);
      return sb;
    }
  }
  globalThis.window = { SourceBuffer: SB, MediaSource: MS };
  await import("../../src/capture/index.js");
  const c = window.__gafferCapture;
  try {
    const ms = new MS();
    ms.addSourceBuffer("video/mp4").appendBuffer(read("dash/init-stream1.m4s"));
    for (let i = 0; i < 40; i++) {
      const old = new MS();
      old.addSourceBuffer("video/mp4").appendBuffer(read("dash/init-stream1.m4s"));
      old.readyState = "closed";
    }
    const list = c.buffers({ currentSrc: "" }, ms);
    assert.equal(list.length, 1);
    assert.ok(list[0].init, "the init is still known");
  } finally {
    c.close();
  }
});

test("raw MP4: a buffer without an init at the start waits for one", () => {
  const init = read("dash/init-stream1.m4s");
  const chunk = read("dash/chunk-stream1-00001.m4s");
  const v = { mime: "video/mp4", init: null };
  const send = fakeCapture([v]);
  const file = [];
  const r = startRaw(video, null, rawWriters([{ write: (x) => file.push(x.length) }]));
  send(v, chunk);
  send(v, init);
  send(v, chunk);
  r.stop();
  assert.deepEqual(file, [init.length, chunk.length]);
});

test("policy: an encrypted manifest of another length (an ad) does not block this video", async () => {
  const plain = hls(600);
  const locked = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n" + hls(30).slice(8);
  const m = createManifests({ fetch: async (u) => (u.includes("ad") ? locked : plain) });
  m.add("https://cdn.test/movie.m3u8");
  m.add("https://cdn.test/ad.m3u8");
  await m.refresh();
  assert.deepEqual(m.all(600), [plain]);
  assert.deepEqual(m.all(30), [locked], "for the ad itself it counts");
  assert.equal(m.all(NaN).length, 2, "without a length everything counts");
});
