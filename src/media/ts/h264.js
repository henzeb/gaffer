import { box, concat } from "../mp4/boxes.js";

export function nalUnits(b) {
  const out = [];
  const n = b.length;
  let i = 0;
  let start = -1;
  while (i + 2 < n) {
    if (b[i + 2] > 1) {
      i += 3;
      continue;
    }
    if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1) {
      if (start >= 0) out.push(trim(b, start, i));
      start = i + 3;
      i += 3;
      continue;
    }
    i++;
  }
  if (start >= 0 && start < n) out.push(trim(b, start, n));
  return out.filter((x) => x.length);
}

function trim(b, s, e) {
  while (e > s && b[e - 1] === 0) e--;
  return b.subarray(s, e);
}

export function unescape(b) {
  const out = new Uint8Array(b.length);
  let o = 0;
  let zeros = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    if (zeros >= 2 && x === 3) {
      zeros = 0;
      continue;
    }
    out[o++] = x;
    zeros = x === 0 ? zeros + 1 : 0;
  }
  return out.subarray(0, o);
}

export function bitReader(b, start = 0) {
  let pos = start * 8;
  const bit = () => {
    const v = pos >> 3 < b.length ? (b[pos >> 3] >> (7 - (pos & 7))) & 1 : 0;
    pos++;
    return v;
  };
  const u = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = v * 2 + bit();
    return v;
  };
  const ue = () => {
    let zeros = 0;
    while (!bit() && zeros < 32) zeros++;
    return u(zeros) + Math.pow(2, zeros) - 1;
  };
  const se = () => {
    const k = ue();
    return k & 1 ? (k + 1) / 2 : -(k / 2);
  };
  return { u, ue, se, skip: (n) => (pos += n) };
}

const HIGH = [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135];

export function parseSps(nal) {
  const b = unescape(nal);
  const r = bitReader(b, 1);
  const profile = r.u(8);
  const compat = r.u(8);
  const level = r.u(8);
  r.ue();
  let chroma = 1;
  let depthLuma = 8;
  let depthChroma = 8;
  if (HIGH.includes(profile)) {
    chroma = r.ue();
    if (chroma === 3) r.u(1);
    depthLuma = r.ue() + 8;
    depthChroma = r.ue() + 8;
    r.u(1);
    if (r.u(1)) {
      for (let i = 0; i < (chroma !== 3 ? 8 : 12); i++) {
        if (!r.u(1)) continue;
        const size = i < 6 ? 16 : 64;
        let last = 8;
        let next = 8;
        for (let j = 0; j < size; j++) {
          if (next !== 0) next = (last + r.se() + 256) & 255;
          last = next === 0 ? last : next;
        }
      }
    }
  }
  r.ue();
  const pocType = r.ue();
  if (pocType === 0) r.ue();
  else if (pocType === 1) {
    r.u(1);
    r.se();
    r.se();
    const n = r.ue();
    for (let i = 0; i < n; i++) r.se();
  }
  r.ue();
  r.u(1);
  const wMbs = r.ue() + 1;
  const hMaps = r.ue() + 1;
  const frameMbsOnly = r.u(1);
  if (!frameMbsOnly) r.u(1);
  r.u(1);
  let crop = [0, 0, 0, 0];
  if (r.u(1)) crop = [r.ue(), r.ue(), r.ue(), r.ue()];
  const cx = chroma === 0 ? 1 : chroma === 3 ? 1 : 2;
  const cy = (chroma === 1 ? 2 : 1) * (2 - frameMbsOnly);
  return {
    profile,
    compat,
    level,
    chroma,
    depthLuma,
    depthChroma,
    width: wMbs * 16 - cx * (crop[0] + crop[1]),
    height: (2 - frameMbsOnly) * hMaps * 16 - cy * (crop[2] + crop[3]),
  };
}

export function ppsId(nal) {
  return bitReader(unescape(nal), 1).ue();
}

function u16(n) {
  return Uint8Array.of((n >> 8) & 255, n & 255);
}

export function avcC(sps, pps, info) {
  const parts = [Uint8Array.of(1, info.profile, info.compat, info.level, 0xff, 0xe0 | sps.length)];
  sps.forEach((s) => parts.push(u16(s.length), s));
  parts.push(Uint8Array.of(pps.length));
  pps.forEach((p) => parts.push(u16(p.length), p));
  if (HIGH.includes(info.profile) && info.profile !== 44) parts.push(Uint8Array.of(0xfc | info.chroma, 0xf8 | (info.depthLuma - 8), 0xf8 | (info.depthChroma - 8), 0));
  return box("avcC", concat(parts));
}

export function createH264() {
  let sps = null;
  let info = null;
  const pps = new Map();
  let config = null;
  return {
    codec: "avc1",
    sample(nals) {
      const keep = [];
      let key = false;
      let vcl = false;
      let changed = false;
      nals.forEach((n) => {
        const type = n[0] & 31;
        if (type === 7) {
          if (!sps || !same(sps, n)) {
            sps = n.slice();
            info = parseSps(sps);
            changed = true;
          }
        } else if (type === 8) {
          const id = ppsId(n);
          if (!pps.has(id) || !same(pps.get(id), n)) {
            pps.set(id, n.slice());
            changed = true;
          }
        } else if (type !== 9 && type !== 12) {
          if (type >= 1 && type <= 5) vcl = true;
          if (type === 5) key = true;
          keep.push(n);
        }
      });
      if (changed && sps && pps.size) config = { width: info.width, height: info.height, box: avcC([sps], [...pps.values()], info), codec: "avc1" };
      return { nals: keep, key, vcl };
    },
    get config() {
      return config;
    },
  };
}

export function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
