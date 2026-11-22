import { concat } from "../mp4/boxes.js";
import { audioKind } from "./aac.js";

const PACKET = 188;
const WRAP = 8589934592;

const VIDEO = { 0x1b: "h264", 0x24: "hevc", 0x01: "mpeg1video", 0x02: "mpeg2video", 0x10: "mpeg4", 0x42: "avs", 0xea: "vc1", 0xd1: "dirac", 0x33: "vvc" };
const AUDIO = { 0x0f: "aac", 0x03: "mp3", 0x04: "mp3", 0x81: "ac3", 0x87: "eac3", 0x11: "latm", 0x80: "pcm", 0x82: "dts", 0x83: "truehd" };
const SUPPORTED = ["h264", "hevc", "aac", "mp3", "ac3", "eac3"];

export function isTs(b) {
  if (b.length < PACKET) return b.length > 0 && b[0] === 0x47;
  for (let o = 0; o < Math.min(PACKET, b.length - PACKET); o++) if (b[o] === 0x47 && b[o + PACKET] === 0x47) return true;
  return false;
}

function timestamp(b, o) {
  return ((b[o] >> 1) & 7) * 1073741824 + ((b[o + 1] << 22) | ((b[o + 2] >> 1) << 15) | (b[o + 3] << 7) | (b[o + 4] >> 1));
}

function privateCodec(b, o, end) {
  while (o + 2 <= end) {
    const tag = b[o];
    const len = b[o + 1];
    if (tag === 0x6a) return "ac3";
    if (tag === 0x7a) return "eac3";
    if (tag === 0x05 && len >= 4) {
      const id = String.fromCharCode(b[o + 2], b[o + 3], b[o + 4], b[o + 5]);
      if (id === "AC-3") return "ac3";
      if (id === "EAC3") return "eac3";
      if (id === "HEVC") return "hevc";
    }
    o += 2 + len;
  }
  return null;
}

function parsePes(b) {
  if (b.length < 9 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1) return null;
  const flags = b[7] >> 6;
  const start = 9 + b[8];
  if (start > b.length) return null;
  let pts = null;
  let dts = null;
  if (flags & 2) pts = timestamp(b, 9);
  if (flags === 3) dts = timestamp(b, 14);
  return { pts, dts: dts === null ? pts : dts, data: b.subarray(start) };
}

export function createDemuxer() {
  let pmtPid = -1;
  let streams = null;
  let carry = new Uint8Array(0);
  const pes = new Map();

  function parsePat(b, p) {
    const len = ((b[p + 1] & 15) << 8) | b[p + 2];
    for (let o = p + 8; o + 4 <= p + 3 + len - 4; o += 4) {
      const program = (b[o] << 8) | b[o + 1];
      if (program) {
        pmtPid = ((b[o + 2] & 31) << 8) | b[o + 3];
        return;
      }
    }
  }

  function parsePmt(b, p) {
    if (b[p] !== 2) return;
    const len = ((b[p + 1] & 15) << 8) | b[p + 2];
    const end = Math.min(b.length, p + 3 + len - 4);
    const info = ((b[p + 10] & 15) << 8) | b[p + 11];
    const found = { video: null, audio: null, unsupported: null };
    for (let o = p + 12 + info; o + 5 <= end; ) {
      const type = b[o];
      const pid = ((b[o + 1] & 31) << 8) | b[o + 2];
      const esLen = ((b[o + 3] & 15) << 8) | b[o + 4];
      let codec = VIDEO[type] || AUDIO[type] || null;
      if (type === 0x06) codec = privateCodec(b, o + 5, o + 5 + esLen);
      const kind = VIDEO[type] || codec === "hevc" ? "video" : codec ? "audio" : null;
      if (kind && !found[kind]) {
        if (SUPPORTED.includes(codec)) found[kind] = { pid, codec, kind };
        else if (!found.unsupported) found.unsupported = { kind, codec };
      }
      o += 5 + esLen;
    }
    if (!streams) streams = found;
  }

  function flushPid(pid, out) {
    const parts = pes.get(pid);
    if (!parts || !parts.length) return;
    pes.set(pid, []);
    const p = parsePes(concat(parts));
    if (p) out.push({ pid, ...p });
  }

  function push(data, { discontinuity = false } = {}) {
    if (discontinuity) {
      carry = new Uint8Array(0);
      pes.clear();
    }
    const b = carry.length ? concat([carry, data]) : data;
    const out = [];
    let o = 0;
    while (o + PACKET <= b.length) {
      if (b[o] !== 0x47) {
        o++;
        continue;
      }
      const pusi = b[o + 1] & 0x40;
      const pid = ((b[o + 1] & 31) << 8) | b[o + 2];
      const afc = (b[o + 3] >> 4) & 3;
      let p = o + 4;
      if (afc & 2) p += 1 + b[o + 4];
      const end = o + PACKET;
      o = end;
      if (!(afc & 1) || p >= end) continue;
      if (pid === 0) {
        if (pusi) parsePat(b, p + 1 + b[p]);
      } else if (pid === pmtPid) {
        if (pusi) parsePmt(b, p + 1 + b[p]);
      } else if (streams && ((streams.video && pid === streams.video.pid) || (streams.audio && pid === streams.audio.pid))) {
        if (pusi) flushPid(pid, out);
        if (!pes.has(pid)) pes.set(pid, []);
        if (pusi || pes.get(pid).length) pes.get(pid).push(b.subarray(p, end));
      }
    }
    carry = o < b.length ? b.slice(o) : new Uint8Array(0);
    [...pes.keys()].forEach((pid) => flushPid(pid, out));
    return out.map((x) => ({ kind: streams.video && x.pid === streams.video.pid ? "video" : "audio", pts: x.pts, dts: x.dts, data: x.data }));
  }

  return {
    push,
    get streams() {
      return streams;
    },
  };
}

function syncsafe(b, o) {
  return ((b[o] & 127) << 21) | ((b[o + 1] & 127) << 14) | ((b[o + 2] & 127) << 7) | (b[o + 3] & 127);
}

const OWNER = "com.apple.streaming.transportStreamTimestamp";

function id3Timestamp(b, o, end, version) {
  let p = o + 10;
  let ts = null;
  while (p + 10 <= end) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = version >= 4 ? syncsafe(b, p + 4) : ((b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]) >>> 0;
    const body = p + 10;
    if (id === "PRIV" && body + size <= end) {
      let z = body;
      while (z < body + size && b[z]) z++;
      const owner = String.fromCharCode.apply(null, b.subarray(body, z));
      if (owner === OWNER && z + 9 <= body + size) {
        const q = z + 1;
        ts = (b[q + 3] & 1) * 4294967296 + (((b[q + 4] << 24) | (b[q + 5] << 16) | (b[q + 6] << 8) | b[q + 7]) >>> 0);
      }
    }
    p = body + size;
  }
  return ts;
}

export function isPacked(b) {
  return (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || !!audioKind(b);
}

export function demuxPacked(b) {
  let o = 0;
  let pts = null;
  while (o + 10 <= b.length && b[o] === 0x49 && b[o + 1] === 0x44 && b[o + 2] === 0x33) {
    const size = syncsafe(b, o + 6);
    const end = o + 10 + size + (b[o + 5] & 0x10 ? 10 : 0);
    const ts = id3Timestamp(b, o, Math.min(end, b.length), b[o + 3]);
    if (ts !== null) pts = ts;
    o = end;
  }
  const codec = audioKind(b, o);
  return { codec, pes: codec ? [{ kind: "audio", pts, dts: pts, data: b.subarray(o) }] : [] };
}

export function unwrap(value, ref) {
  if (ref === null || value === null) return value;
  return value + Math.round((ref - value) / WRAP) * WRAP;
}
