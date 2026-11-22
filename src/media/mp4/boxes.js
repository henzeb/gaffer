const CONTAINERS = { moov: 0, trak: 0, mdia: 0, minf: 0, stbl: 0, mvex: 0, moof: 0, traf: 0, edts: 0, dinf: 0, udta: 0, stsd: 8, meta: 4 };

export function u32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

export function u64(b, o) {
  return u32(b, o) * 4294967296 + u32(b, o + 4);
}

export function setU32(b, o, v) {
  b[o] = (v >>> 24) & 255;
  b[o + 1] = (v >>> 16) & 255;
  b[o + 2] = (v >>> 8) & 255;
  b[o + 3] = v & 255;
}

export function setU64(b, o, v) {
  setU32(b, o, Math.floor(v / 4294967296));
  setU32(b, o + 4, v - Math.floor(v / 4294967296) * 4294967296);
}

export function fourcc(b, o) {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

export function readBoxes(b, start = 0, end = b.length) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) break;
      size = u64(b, o + 8);
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header || o + size > end) break;
    out.push({ type: fourcc(b, o + 4), start: o, header, end: o + size, size });
    o += size;
  }
  return { boxes: out, rest: o };
}

export function children(b, box) {
  const skip = CONTAINERS[box.type] || 0;
  return readBoxes(b, box.start + box.header + skip, box.end).boxes;
}

export function child(b, box, type) {
  return children(b, box).find((c) => c.type === type) || null;
}

export function find(b, path, boxes = readBoxes(b).boxes) {
  let list = boxes;
  let hit = null;
  for (const type of path) {
    hit = list.find((x) => x.type === type) || null;
    if (!hit) return null;
    list = children(b, hit);
  }
  return hit;
}

export function bytes(b, box) {
  return b.subarray(box.start, box.end);
}

export function body(b, box) {
  return b.subarray(box.start + box.header, box.end);
}

export function concat(parts) {
  let n = 0;
  parts.forEach((p) => (n += p.length));
  const out = new Uint8Array(n);
  let o = 0;
  parts.forEach((p) => {
    out.set(p, o);
    o += p.length;
  });
  return out;
}

export function box(type, ...payloads) {
  const inner = concat(payloads);
  const out = new Uint8Array(8 + inner.length);
  setU32(out, 0, out.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(inner, 8);
  return out;
}

export function startsWithBox(b, types) {
  return b.length >= 8 && types.includes(fourcc(b, 4));
}

export function isWebm(b) {
  return b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}
