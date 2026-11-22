import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureFixtures, media } from "../fixtures/ensure.js";
import { parseHls } from "../../src/media/manifest/hls.js";
import { createTsMuxer } from "../../src/media/ts/remux.js";

before(() => ensureFixtures());

const ts = path.join(media, "ts");

function probe(file) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-show_entries", "stream=codec_name,codec_type,codec_tag_string,width,height,nb_read_packets,sample_rate,channels:format=duration,start_time", "-of", "json", file]));
  out.streams.sort((a, b) => a.codec_type.localeCompare(b.codec_type));
  return out;
}

function probeBuffer(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-ts-"));
  const file = path.join(dir, "out.mp4");
  fs.writeFileSync(file, buf);
  try {
    const p = probe(file);
    const errors = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return { ...p, errors };
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

function segments(name) {
  const dir = path.join(ts, name);
  const p = parseHls(fs.readFileSync(path.join(dir, "index.m3u8"), "utf8"), "file:///");
  return p.segments.map((s) => ({ bytes: new Uint8Array(fs.readFileSync(path.join(dir, s.uri.replace("file:///", "")))), discontinuity: s.discontinuity }));
}

function run(sources, { separateAudio = false } = {}) {
  const chunks = [];
  const parts = [];
  let unsupported = null;
  const m = createTsMuxer({ keys: Object.keys(sources), separateAudio, onData: (b) => chunks.push(Buffer.from(b)), onPart: (n) => parts.push(n), onUnsupported: (r) => (unsupported = r) });
  const lists = Object.entries(sources);
  const longest = Math.max(...lists.map(([, l]) => l.length));
  for (let i = 0; i < longest; i++) lists.forEach(([key, list]) => list[i] && m.push(key, list[i].bytes, { discontinuity: list[i].discontinuity }));
  m.end();
  return { out: Buffer.concat(chunks), parts, unsupported };
}

function same(out, srcFiles, { duration } = {}) {
  const got = probeBuffer(out);
  const want = srcFiles.map((f) => probe(path.join(ts, f)));
  assert.equal(got.errors, "", "decoding gives no errors");
  assert.deepEqual(
    got.streams.map((s) => [s.codec_type, s.codec_name]),
    want[0].streams.map((s) => [s.codec_type, s.codec_name]),
  );
  got.streams.forEach((s, i) => {
    const w = want[0].streams[i];
    if (s.codec_type === "video") assert.deepEqual([s.width, s.height], [w.width, w.height], "resolution");
    else assert.deepEqual([s.sample_rate, s.channels], [w.sample_rate, w.channels], "audio format");
    const frames = want.reduce((n, p) => n + +p.streams[i].nb_read_packets, 0);
    assert.equal(+s.nb_read_packets, frames, s.codec_type + " frames");
  });
  const total = duration ?? want.reduce((n, p) => n + +p.format.duration, 0);
  assert.ok(Math.abs(+got.format.duration - total) < 0.1, "duration " + got.format.duration + " vs " + total);
  assert.ok(+got.format.start_time < 0.1, "start_time " + got.format.start_time);
  return got;
}

test("ts: H.264 with B-frames and AAC becomes one MP4 with the same frames and duration", () => {
  const r = run({ v: segments("h264-aac") });
  assert.equal(r.unsupported, null);
  const p = same(r.out, ["h264-aac.mp4"]);
  assert.equal(p.streams.find((s) => s.codec_type === "video").codec_tag_string, "avc1");
});

test("ts: HEVC and AAC become hvc1 with the same frames", () => {
  const r = run({ v: segments("hevc-aac") });
  const p = same(r.out, ["hevc-aac.mp4"]);
  assert.equal(p.streams.find((s) => s.codec_type === "video").codec_tag_string, "hvc1");
});

test("ts: audio only", () => {
  same(run({ v: segments("audio-only") }).out, ["audio-only.mp4"]);
});

for (const [name, tag] of [
  ["mp3", "mp4a"],
  ["ac3", "ac-3"],
  ["eac3", "ec-3"],
]) {
  test("ts: " + name + " is copied as " + tag, () => {
    const p = same(run({ v: segments(name) }).out, [name + ".mp4"]);
    assert.equal(p.streams[0].codec_tag_string, tag);
  });
}

test("ts: a wrap of the 33-bit PTS keeps the timeline continuous", () => {
  same(run({ v: segments("wrap") }).out, ["h264-aac.mp4"]);
});

test("ts: a discontinuity continues the timeline without a gap or a new part", () => {
  const r = run({ v: segments("discontinuity") });
  assert.deepEqual(r.parts, []);
  same(r.out, ["h264-aac.mp4", "second.mp4"]);
});

function id3(timestamp) {
  const owner = Buffer.from("com.apple.streaming.transportStreamTimestamp\0", "latin1");
  const ts = Buffer.alloc(8);
  ts.writeUInt32BE(Math.floor(timestamp / 4294967296), 0);
  ts.writeUInt32BE(timestamp % 4294967296, 4);
  const body = Buffer.concat([owner, ts]);
  const frame = Buffer.concat([Buffer.from("PRIV"), Buffer.from([0, 0, 0, body.length]), Buffer.from([0, 0]), body]);
  return Buffer.concat([Buffer.from("ID3"), Buffer.from([4, 0, 0, 0, 0, 0, frame.length]), frame]);
}

function packed(base) {
  return fs
    .readFileSync(path.join(ts, "packed", "list.csv"), "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split(","))
    .map(([file, start]) => ({ bytes: new Uint8Array(Buffer.concat([id3(Math.round((+start + base) * 90000)), fs.readFileSync(path.join(ts, "packed", file))])), discontinuity: false }));
}

test("ts: packed audio (ADTS with an ID3 timestamp) on its own", () => {
  same(run({ v: packed(5) }).out, ["audio-only.mp4"]);
});

test("ts: TS video with a separate packed audio rendition gives one file with both", () => {
  const r = run({ v: segments("h264-aac"), a: packed(1.4) }, { separateAudio: true });
  const p = probeBuffer(r.out);
  assert.equal(p.errors, "");
  const video = probe(path.join(ts, "h264-aac.mp4")).streams.find((s) => s.codec_type === "video");
  const audio = probe(path.join(ts, "audio-only.mp4")).streams[0];
  assert.deepEqual(
    p.streams.map((s) => [s.codec_type, s.codec_name, +s.nb_read_packets]),
    [
      ["audio", "aac", +audio.nb_read_packets],
      ["video", "h264", +video.nb_read_packets],
    ],
  );
});

test("ts: another video codec gives a message instead of a file", () => {
  const r = run({ v: [{ bytes: new Uint8Array(fs.readFileSync(path.join(ts, "mpeg2.ts"))), discontinuity: false }] });
  assert.equal(r.unsupported, "codec:mpeg2video");
  assert.equal(r.out.length, 0);
});

test("ts: chunks that are neither TS nor packed audio are refused", () => {
  const r = run({ v: [{ bytes: new Uint8Array(400).fill(7), discontinuity: false }] });
  assert.equal(r.unsupported, "format");
});

test("hevc: two SPS of one VPS are kept by their own id", async () => {
  const { createHevc } = await import("../../src/media/ts/hevc.js");
  // A minimal SPS: header, VPS 0, no sub-layers, a general profile, then the
  // SPS id, 4:2:0 and the size.
  const sps = (id, width) => {
    const bits = [];
    const u = (n, v) => {
      for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
    };
    const ue = (v) => {
      const x = v + 1;
      const n = Math.floor(Math.log2(x));
      u(n, 0);
      u(n + 1, x);
    };
    u(4, 0);
    u(3, 0);
    u(1, 1);
    for (let i = 0; i < 12; i++) u(8, i === 0 ? 0x01 : 0x60);
    ue(id);
    ue(1);
    ue(width);
    ue(720);
    u(1, 0);
    ue(0);
    ue(0);
    u(1, 1);
    while (bits.length % 8) bits.push(0);
    const body = [];
    for (let i = 0; i < bits.length; i += 8) body.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    return Uint8Array.from([0x42, 0x01].concat(body));
  };
  const vps = Uint8Array.of(0x40, 0x01, 0x0c, 0x01);
  const pps = Uint8Array.of(0x44, 0x01, 0xc0);
  const h = createHevc();
  h.sample([vps, sps(0, 1280), sps(1, 640), pps]);
  const box = h.config.box;
  // The arrays of the hvcC: type, count, then each set with its length.
  let o = 8 + 23;
  const counts = {};
  for (let k = 0; k < box[8 + 22]; k++) {
    const type = box[o] & 63;
    const n = (box[o + 1] << 8) | box[o + 2];
    counts[type] = n;
    o += 3;
    for (let j = 0; j < n; j++) o += 2 + ((box[o] << 8) | box[o + 1]);
  }
  assert.equal(counts[33], 2);
  assert.equal(h.config.width, 640);
});
