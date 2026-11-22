import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureFixtures, media } from "../fixtures/ensure.js";
import { parseHls, hlsEncrypted } from "../../src/media/manifest/hls.js";
import { parseMpd, isoDuration, fillTemplate, dashEncrypted } from "../../src/media/manifest/dash.js";
import { readBoxes, bytes } from "../../src/media/mp4/boxes.js";
import { createMuxer, parseInit, parseFragment } from "../../src/media/mp4/mux.js";

before(() => ensureFixtures());

const read = (f) => new Uint8Array(fs.readFileSync(path.join(media, f)));
const withoutIndex = (b) => Buffer.from(b.subarray(0, readBoxes(b).boxes.find((x) => x.type === "mfra")?.start ?? b.length));
const pages = path.join(import.meta.dirname, "..", "e2e", "pages", "streams");

function probe(buf) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-mux-")), "out.mp4");
  fs.writeFileSync(file, buf);
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_name,codec_type,width,height,nb_read_frames,start_time:format=duration,start_time", "-of", "json", file]));
  fs.rmSync(path.dirname(file), { recursive: true });
  return out;
}

function collect(opts = {}) {
  const chunks = [];
  const parts = [];
  const m = createMuxer({ ...opts, onData: (b) => chunks.push(b.slice()), onPart: (n) => parts.push(n) });
  return { m, chunks, parts, out: () => Buffer.concat(chunks.map((c) => Buffer.from(c))) };
}

function split(b) {
  const top = readBoxes(b).boxes;
  const init = Buffer.concat(top.filter((x) => x.type === "ftyp" || x.type === "moov").map((x) => bytes(b, x)));
  const frags = [];
  top.forEach((x, i) => {
    if (x.type === "moof") frags.push(Buffer.concat([bytes(b, x), bytes(b, top[i + 1])]));
  });
  return { init: new Uint8Array(init), frags: frags.map((f) => new Uint8Array(f)) };
}

test("parseHls reads a master playlist with an audio rendition", () => {
  const text = fs.readFileSync(path.join(media, "hls-fmp4/master.m3u8"), "utf8");
  const p = parseHls(text, "https://x.test/a/master.m3u8");
  assert.equal(p.master, true);
  assert.equal(p.variants.length, 2);
  assert.deepEqual([p.variants[0].height, p.variants[0].audio, p.variants[0].uri], [720, "aud", "https://x.test/a/720/index.m3u8"]);
  assert.equal(p.renditions[0].uri, "https://x.test/a/audio/index.m3u8");
  assert.equal(p.encrypted, false);
});

test("parseHls reads media playlists, the init map and the format", () => {
  const p = parseHls(fs.readFileSync(path.join(media, "hls-fmp4/720/index.m3u8"), "utf8"), "https://x.test/720/index.m3u8");
  assert.equal(p.master, false);
  assert.equal(p.live, false);
  assert.equal(p.format, "fmp4");
  assert.equal(p.segments.length, 15);
  assert.equal(p.segments[0].map.uri, "https://x.test/720/init.mp4");
  assert.equal(p.segments[2].start, 8);
  assert.equal(p.duration, 60);
  const ts = parseHls(fs.readFileSync(path.join(media, "hls/720/index.m3u8"), "utf8"), "https://x.test/");
  assert.equal(ts.format, "ts");
  const live = parseHls("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\na.m4s\n", "https://x.test/");
  assert.equal(live.live, true);
});

test("parseHls handles byte ranges and encryption", () => {
  const p = parseHls("#EXTM3U\n#EXT-X-MAP:URI=\"f.mp4\",BYTERANGE=\"700@0\"\n#EXTINF:4,\n#EXT-X-BYTERANGE:1000@700\nf.mp4\n#EXTINF:4,\n#EXT-X-BYTERANGE:500\nf.mp4\n#EXT-X-ENDLIST\n", "https://x.test/");
  assert.deepEqual(p.segments[0].map.range, { offset: 0, length: 700 });
  assert.deepEqual(p.segments[1].range, { offset: 1700, length: 500 });
  assert.equal(hlsEncrypted(fs.readFileSync(path.join(pages, "encrypted.m3u8"), "utf8")), true);
  assert.equal(hlsEncrypted("#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n"), false);
  assert.equal(hlsEncrypted("#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,URI=\"skd://x\"\n"), true);
});

test("parseMpd builds segment lists from templates", () => {
  const p = parseMpd(fs.readFileSync(path.join(media, "dash/manifest.mpd"), "utf8"), "https://x.test/d/manifest.mpd");
  assert.equal(p.live, false);
  assert.equal(p.duration, 60);
  const video = p.representations.filter((r) => r.kind === "video");
  const audio = p.representations.filter((r) => r.kind === "audio");
  assert.deepEqual(video.map((r) => r.height), [360, 720, 1080]);
  assert.equal(audio.length, 1);
  assert.equal(video[1].init.uri, "https://x.test/d/init-stream1.m4s");
  assert.equal(video[1].segments.length, 15);
  assert.equal(video[1].segments[0].uri, "https://x.test/d/chunk-stream1-00001.m4s");
  assert.equal(video[1].segments[14].start, 56);
  assert.equal(p.encrypted, false);
});

test("parseMpd reads timelines, base URLs and protection", () => {
  const mpd = `<?xml version="1.0"?><MPD type="static" mediaPresentationDuration="PT10S"><BaseURL>https://cdn.test/v/</BaseURL><Period><AdaptationSet contentType="video"><SegmentTemplate timescale="10" initialization="$RepresentationID$/i.mp4" media="$RepresentationID$/$Time$.m4s"><SegmentTimeline><S t="0" d="40" r="1"/><S d="20"/></SegmentTimeline></SegmentTemplate><Representation id="hd" bandwidth="1" width="1280" height="720"/></AdaptationSet></Period></MPD>`;
  const p = parseMpd(mpd, "https://site.test/m.mpd");
  const r = p.representations[0];
  assert.equal(r.init.uri, "https://cdn.test/v/hd/i.mp4");
  assert.deepEqual(r.segments.map((s) => [s.uri, s.start, s.duration]), [["https://cdn.test/v/hd/0.m4s", 0, 4], ["https://cdn.test/v/hd/40.m4s", 4, 4], ["https://cdn.test/v/hd/80.m4s", 8, 2]]);
  assert.equal(parseMpd(fs.readFileSync(path.join(pages, "protected.mpd"), "utf8"), "https://x.test/").encrypted, true);
  assert.equal(dashEncrypted("<MPD><Period><AdaptationSet><ContentProtection/></AdaptationSet></Period></MPD>"), true);
  assert.equal(isoDuration("PT1H2M3.5S"), 3723.5);
  assert.equal(fillTemplate("a-$Number" + String.fromCharCode(37) + "05d$-$$.m4s", { Number: 7 }), "a-00007-$.m4s");
});

test("parseInit and parseFragment read tracks, times and keyframes", () => {
  const init = parseInit(read("dash/init-stream1.m4s"));
  assert.equal(init.tracks.length, 1);
  assert.equal(init.tracks[0].kind, "video");
  assert.equal(init.tracks[0].codec, "avc1");
  const b = read("dash/chunk-stream1-00002.m4s");
  const moof = readBoxes(b).boxes.find((x) => x.type === "moof");
  const f = parseFragment(b, moof, init);
  assert.equal(f.trafs[0].kind, "video");
  assert.ok(Math.abs(f.trafs[0].time - 4) < 0.1, "time " + f.trafs[0].time);
  assert.equal(f.trafs[0].sync, true);
});

test("the muxer combines separate video and audio buffers into one file", () => {
  const { m, out, parts } = collect({ sources: 2 });
  m.push("v", read("dash/init-stream1.m4s"));
  m.push("a", read("dash/init-stream3.m4s"));
  for (let i = 1; i <= 15; i++) {
    const n = String(i).padStart(5, "0");
    m.push("v", read(`dash/chunk-stream1-${n}.m4s`));
    m.push("a", read(`dash/chunk-stream3-${n}.m4s`));
  }
  m.end();
  assert.equal(m.mode, "mux");
  assert.deepEqual(parts, []);
  const p = probe(out());
  const kinds = p.streams.map((s) => s.codec_type + ":" + s.codec_name).sort();
  assert.deepEqual(kinds, ["audio:aac", "video:h264"]);
  assert.ok(Math.abs(+p.format.duration - 60) < 0.5, "duration " + p.format.duration);
  const src = probe(read("v720.mp4"));
  const vs = p.streams.find((s) => s.codec_type === "video");
  assert.equal(vs.nb_read_frames, src.streams.find((s) => s.codec_type === "video").nb_read_frames);
  assert.equal(vs.height, 720);
});

test("the muxer interleaves by time when audio arrives far ahead", () => {
  const { m, out } = collect({ sources: 2 });
  m.push("a", read("dash/init-stream3.m4s"));
  for (let i = 1; i <= 15; i++) m.push("a", read(`dash/chunk-stream3-${String(i).padStart(5, "0")}.m4s`));
  m.push("v", read("dash/init-stream0.m4s"));
  for (let i = 1; i <= 15; i++) m.push("v", read(`dash/chunk-stream0-${String(i).padStart(5, "0")}.m4s`));
  m.end();
  const b = new Uint8Array(out());
  const init = parseInit(b);
  assert.deepEqual(init.tracks.map((t) => [t.id, t.kind]), [[1, "video"], [2, "audio"]]);
  const order = readBoxes(b).boxes.filter((x) => x.type === "moof").map((x) => parseFragment(b, x, init).trafs[0]);
  for (let i = 1; i < order.length; i++) assert.ok(order[i].time >= order[i - 1].time - 4.01, "out of order at " + i);
  assert.deepEqual(new Set(order.map((t) => t.id)), new Set([1, 2]));
});

test("one combined buffer is written through byte for byte", () => {
  const src = read("frag.mp4");
  const { init, frags } = split(src);
  const { m, out } = collect({ sources: 1 });
  m.push("x", init);
  frags.forEach((f) => m.push("x", f));
  m.end();
  assert.equal(m.mode, "pass");
  assert.ok(withoutIndex(src).equals(out()));
});

test("data split across appends gives the same output", () => {
  const src = read("frag.mp4");
  const { m, out } = collect({ sources: 1 });
  for (let o = 0; o < src.length; o += 777) m.push("x", src.subarray(o, o + 777));
  m.end();
  assert.ok(withoutIndex(src).equals(out()));
});

test("a recording that starts halfway begins with a keyframe", () => {
  const src = read("frag-mid.mp4");
  const { init, frags } = split(src);
  const info = parseInit(init);
  const sync = frags.map((f) => parseFragment(f, readBoxes(f).boxes[0], info).trafs.find((t) => t.kind === "video")?.key ?? true);
  const from = sync.findIndex((s, i) => i > 2 && !s);
  assert.ok(from > 0, "the fixture has fragments without a keyframe");
  const { m, out } = collect({ sources: 1 });
  m.push("x", init);
  frags.slice(from).forEach((f) => m.push("x", f));
  m.end();
  const b = new Uint8Array(out());
  const first = readBoxes(b).boxes.find((x) => x.type === "moof");
  assert.equal(parseFragment(b, first, info).trafs.find((t) => t.kind === "video").key, true);
  assert.ok(Math.min(...parseFragment(b, first, info).trafs.map((t) => t.time)) < 0.01, "the recording starts at 0");
  assert.ok(b.length < src.length);
  const p = probe(b);
  assert.equal(p.streams.length, 2);
});

test("separate buffers that start halfway get their own timeline from 0", () => {
  const { m, out } = collect({ sources: 2 });
  m.push("v", read("dash/init-stream1.m4s"));
  m.push("a", read("dash/init-stream3.m4s"));
  for (let i = 6; i <= 15; i++) {
    const n = String(i).padStart(5, "0");
    m.push("v", read(`dash/chunk-stream1-${n}.m4s`));
    m.push("a", read(`dash/chunk-stream3-${n}.m4s`));
  }
  m.end();
  const b = new Uint8Array(out());
  const init = parseInit(b);
  const times = readBoxes(b).boxes.filter((x) => x.type === "moof").map((x) => parseFragment(b, x, init).trafs[0].time);
  assert.ok(Math.min(...times) < 0.01, "first fragment at " + Math.min(...times));
  const p = probe(b);
  assert.ok(+p.format.start_time < 0.1, "start_time " + p.format.start_time);
  assert.ok(Math.abs(+p.format.duration - 40) < 0.5, "duration " + p.format.duration);
});

test("a new init segment with other codec settings starts a new part", () => {
  const { m, parts, chunks } = collect({ sources: 2 });
  m.push("v", read("dash/init-stream0.m4s"));
  m.push("a", read("dash/init-stream3.m4s"));
  m.push("v", read("dash/chunk-stream0-00001.m4s"));
  m.push("a", read("dash/chunk-stream3-00001.m4s"));
  m.push("v", read("dash/init-stream0.m4s"));
  assert.deepEqual(parts, []);
  m.push("v", read("dash/init-stream1.m4s"));
  assert.deepEqual(parts, [2]);
  assert.ok(chunks.length >= 2);
});

test("WebM and unknown structures are reported", () => {
  const reasons = [];
  const m = createMuxer({ sources: 1, onData() {}, onUnsupported: (r) => reasons.push(r) });
  m.push("x", Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0));
  const m2 = createMuxer({ sources: 2, onData() {}, onUnsupported: (r) => reasons.push(r) });
  m2.push("a", read("dash/init-stream0.m4s"));
  m2.push("b", read("dash/init-stream1.m4s"));
  assert.deepEqual(reasons, ["webm", "structure"]);
});
