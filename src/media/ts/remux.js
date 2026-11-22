import { box, concat, setU32 } from "../mp4/boxes.js";
import { createMuxer } from "../mp4/mux.js";
import { createDemuxer, demuxPacked, isTs, isPacked, unwrap } from "./demux.js";
import { nalUnits, createH264 } from "./h264.js";
import { createHevc } from "./hevc.js";
import { createAudio } from "./aac.js";

const CLOCK = 90000;
const JUMP = 10 * CLOCK;
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

function words(list) {
  const b = new Uint8Array(list.length * 4);
  list.forEach((v, i) => setU32(b, i * 4, v >>> 0));
  return b;
}

function full(type, version, flags, ...payloads) {
  return box(type, Uint8Array.of(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...payloads);
}

function ascii(s) {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function videoEntry(config) {
  const b = new Uint8Array(78);
  b[7] = 1;
  b[24] = (config.width >> 8) & 255;
  b[25] = config.width & 255;
  b[26] = (config.height >> 8) & 255;
  b[27] = config.height & 255;
  setU32(b, 28, 0x480000);
  setU32(b, 32, 0x480000);
  b[41] = 1;
  b[74] = 0;
  b[75] = 0x18;
  b[76] = 0xff;
  b[77] = 0xff;
  return box(config.codec, b, config.box);
}

export function initSegment(kind, config, delay = 0) {
  const videoKind = kind === "video";
  const timescale = videoKind ? CLOCK : config.rate;
  const ftyp = box("ftyp", ascii("isom"), Uint8Array.of(0, 0, 2, 0), ascii("isom"), ascii("iso6"), ascii("mp41"));
  const mvhd = full("mvhd", 0, 0, words([0, 0, 1000, 0, 0x10000]), Uint8Array.of(1, 0), new Uint8Array(10), words(MATRIX), new Uint8Array(24), words([2]));
  const tkhd = full("tkhd", 0, 3, words([0, 0, 1, 0, 0, 0, 0]), Uint8Array.of(0, 0, 0, 0, videoKind ? 0 : 1, 0, 0, 0), words(MATRIX), words([videoKind ? config.width * 65536 : 0, videoKind ? config.height * 65536 : 0]));
  const mdhd = full("mdhd", 0, 0, words([0, 0, timescale, 0]), Uint8Array.of(0x55, 0xc4, 0, 0));
  const hdlr = full("hdlr", 0, 0, words([0]), ascii(videoKind ? "vide" : "soun"), new Uint8Array(12), ascii(videoKind ? "VideoHandler" : "SoundHandler"), Uint8Array.of(0));
  const head = videoKind ? full("vmhd", 0, 1, new Uint8Array(8)) : full("smhd", 0, 0, new Uint8Array(4));
  const dinf = box("dinf", full("dref", 0, 0, words([1]), full("url ", 0, 1)));
  const entry = videoKind ? videoEntry(config) : config.box;
  const stbl = box("stbl", full("stsd", 0, 0, words([1]), entry), full("stts", 0, 0, words([0])), full("stsc", 0, 0, words([0])), full("stsz", 0, 0, words([0, 0])), full("stco", 0, 0, words([0])));
  const edts = delay > 0 ? [box("edts", full("elst", 0, 0, words([1, 0, delay, 0x10000])))] : [];
  const trak = box("trak", tkhd, ...edts, box("mdia", mdhd, hdlr, box("minf", head, dinf, stbl)));
  const mvex = box("mvex", full("trex", 0, 0, words([1, 1, 0, 0, 0])));
  return concat([ftyp, box("moov", mvhd, trak, mvex)]);
}

export function fragment(seq, start, samples) {
  const time = Math.max(0, Math.round(start));
  const signed = samples.some((s) => s.cts < 0);
  const entries = new Uint8Array(samples.length * 16);
  samples.forEach((s, i) => {
    setU32(entries, i * 16, s.duration);
    setU32(entries, i * 16 + 4, s.size);
    setU32(entries, i * 16 + 8, s.key ? 0x02000000 : 0x01010000);
    setU32(entries, i * 16 + 12, s.cts >>> 0);
  });
  const hi = Math.floor(time / 4294967296);
  const build = (offset) =>
    box(
      "moof",
      full("mfhd", 0, 0, words([seq])),
      box("traf", full("tfhd", 0, 0x020000, words([1])), full("tfdt", 1, 0, words([hi, time - hi * 4294967296])), full("trun", signed ? 1 : 0, 0xf01, words([samples.length, offset]), entries)),
    );
  const size = build(0).length;
  const data = concat(samples.flatMap((s) => s.parts));
  return concat([build(size + 8), box("mdat", data)]);
}

function avccParts(nals) {
  const parts = [];
  let size = 0;
  nals.forEach((n) => {
    parts.push(words([n.length]), n);
    size += 4 + n.length;
  });
  return { parts, size };
}

export function createRemuxer({ video: wantVideo = true, audio: wantAudio = true } = {}) {
  const demuxer = createDemuxer();
  let format = null;
  let unsupported = null;
  let kinds = null;
  let ref = null;
  let offset = 0;
  let expected = null;
  const tracks = {};

  function track(kind, codec) {
    const t = { kind, seq: 0, emitted: null, config: null, needKey: true, lastDur: 0, next: null, waiting: [], delay: null };
    t.parser = kind === "video" ? (codec === "hevc" ? createHevc() : createH264()) : createAudio(codec);
    tracks[kind] = t;
    return t;
  }

  function setup(streams) {
    const list = [];
    if (wantVideo && streams.unsupported && streams.unsupported.kind === "video" && !streams.video) unsupported = streams.unsupported.codec;
    if (wantAudio && streams.unsupported && streams.unsupported.kind === "audio" && !streams.audio) unsupported = streams.unsupported.codec;
    if (unsupported) return;
    if (wantVideo && streams.video) list.push(track("video", streams.video.codec).kind);
    if (wantAudio && streams.audio) list.push(track("audio", streams.audio.codec).kind);
    kinds = list;
  }

  function read(bytes, discontinuity) {
    if (!format) {
      format = isTs(bytes) ? "ts" : isPacked(bytes) ? "packed" : null;
      if (!format) {
        unsupported = "format";
        return [];
      }
    }
    if (format === "ts") {
      const list = demuxer.push(bytes, { discontinuity });
      if (!kinds && demuxer.streams) setup(demuxer.streams);
      return kinds ? list.filter((p) => tracks[p.kind]) : [];
    }
    const p = demuxPacked(bytes);
    if (!kinds) {
      if (!p.codec) return [];
      kinds = wantAudio ? [track("audio", p.codec).kind] : [];
    }
    return wantAudio ? p.pes : [];
  }

  function videoSamples(t, list) {
    const out = [];
    list.forEach((p) => {
      if (p.dts === null) return;
      const nals = t.waiting.concat(nalUnits(p.data));
      const r = t.parser.sample(nals);
      if (!r.vcl) {
        t.waiting = r.nals;
        return;
      }
      t.waiting = [];
      const config = t.parser.config;
      if (!config) return;
      if (config !== t.config) {
        t.config = config;
        t.needKey = true;
      }
      if (t.needKey && !r.key) return;
      t.needKey = false;
      const { parts, size } = avccParts(r.nals);
      if (t.delay === null) t.delay = Math.max(0, p.pts - p.dts);
      out.push({ time: p.dts + offset + t.delay, cts: p.pts - p.dts, key: r.key, parts, size, config });
    });
    out.forEach((s, i) => {
      const next = out[i + 1];
      const d = next && next.config === s.config ? next.time - s.time : 0;
      if (d > 0) t.lastDur = d;
      s.duration = d > 0 ? d : t.lastDur || 3000;
    });
    return out;
  }

  function audioSamples(t, list) {
    const out = [];
    list.forEach((p) => {
      const frames = t.parser.frames(p.data);
      let anchored = false;
      frames.forEach((f) => {
        if (f.config !== t.config) {
          t.config = f.config;
          t.next = null;
        }
        if (!f.carried && !anchored && p.pts !== null) {
          anchored = true;
          const at = Math.round(((p.pts + offset) * f.rate) / CLOCK);
          if (t.next === null || Math.abs(at - t.next) > f.samples / 2) t.next = at;
        }
        if (t.next === null) return;
        out.push({ time: t.next, cts: 0, key: true, parts: [f.data], size: f.data.length, config: f.config, rate: f.rate, frame: f.samples });
        t.next += f.samples;
      });
    });
    out.forEach((s, i) => {
      const next = out[i + 1];
      const d = next && next.config === s.config ? next.time - s.time : 0;
      s.duration = d > 0 ? d : s.frame;
    });
    return out;
  }

  function emit(t, samples, out) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const config = run[0].config;
      if (config !== t.emitted) {
        t.emitted = config;
        out.push({ kind: t.kind, bytes: initSegment(t.kind, config, t.delay || 0) });
      }
      out.push({ kind: t.kind, bytes: fragment(++t.seq, run[0].time, run) });
      run = [];
    };
    samples.forEach((s) => {
      if (run.length && s.config !== run[0].config) flush();
      run.push(s);
    });
    flush();
  }

  function push(bytes, { discontinuity = false } = {}) {
    if (unsupported) return [];
    if (discontinuity) {
      ref = null;
      Object.values(tracks).forEach((t) => {
        if (t.parser.reset) t.parser.reset();
        t.waiting = [];
      });
    }
    const list = read(bytes, discontinuity);
    if (unsupported || !list.length) return [];
    let earliest = Infinity;
    list.forEach((p) => {
      if (p.dts === null) return;
      p.dts = unwrap(p.dts, ref);
      p.pts = unwrap(p.pts, p.dts);
      ref = p.dts;
      earliest = Math.min(earliest, p.pts);
    });
    if (earliest === Infinity) {
      earliest = expected === null ? 0 : expected - offset;
      list.forEach((p) => (p.pts = p.dts = earliest));
    }
    if (expected !== null && (discontinuity || Math.abs(earliest + offset - expected) > JUMP)) offset = expected - earliest;
    const out = [];
    ["video", "audio"].forEach((kind) => {
      const t = tracks[kind];
      if (!t) return;
      const mine = list.filter((p) => p.kind === kind);
      const samples = kind === "video" ? videoSamples(t, mine) : audioSamples(t, mine);
      if (!samples.length) return;
      const last = samples[samples.length - 1];
      const end = kind === "video" ? last.time + last.duration : ((last.time + last.duration) * CLOCK) / last.rate;
      expected = expected === null ? end : Math.max(expected, end);
      emit(t, samples, out);
    });
    return out;
  }

  return {
    push,
    get kinds() {
      return kinds;
    },
    get unsupported() {
      return unsupported;
    },
  };
}

export function createTsMuxer({ keys, separateAudio = false, onData, onPart = () => {}, onUnsupported = () => {} }) {
  const remuxers = new Map(keys.map((k) => [k, createRemuxer({ video: k !== "a", audio: k === "a" || !separateAudio })]));
  const pending = [];
  let muxer = null;
  let failed = false;

  function fail(reason) {
    if (failed) return;
    failed = true;
    onUnsupported(reason);
  }

  function start() {
    const kinds = new Set();
    remuxers.forEach((r) => (r.kinds || []).forEach((k) => kinds.add(k)));
    if (!kinds.size) return;
    muxer = createMuxer({ sources: kinds.size, onData, onPart, onUnsupported: fail });
    pending.splice(0).forEach((o) => muxer.push(o.kind, o.bytes));
  }

  function push(key, bytes, opts) {
    if (failed) return;
    const r = remuxers.get(key);
    if (!r) return;
    const out = r.push(bytes, opts);
    if (r.unsupported) return fail(r.unsupported === "format" ? "format" : "codec:" + r.unsupported);
    if (muxer) out.forEach((o) => muxer.push(o.kind, o.bytes));
    else {
      pending.push(...out);
      if ([...remuxers.values()].every((x) => x.kinds)) start();
    }
  }

  function end() {
    if (failed) return;
    if (!muxer) start();
    if (muxer) muxer.end();
  }

  return { push, end };
}
