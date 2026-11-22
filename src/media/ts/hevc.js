import { box, concat } from "../mp4/boxes.js";
import { unescape, bitReader, same } from "./h264.js";

export function parseHevcSps(nal) {
  const b = unescape(nal);
  const r = bitReader(b, 2);
  r.u(4);
  const maxSub = r.u(3);
  const nested = r.u(1);
  const ptl = b.subarray(3, 15);
  r.skip(96);
  const subProfile = [];
  const subLevel = [];
  for (let i = 0; i < maxSub; i++) {
    subProfile.push(r.u(1));
    subLevel.push(r.u(1));
  }
  if (maxSub > 0) for (let i = maxSub; i < 8; i++) r.u(2);
  for (let i = 0; i < maxSub; i++) {
    if (subProfile[i]) r.skip(88);
    if (subLevel[i]) r.skip(8);
  }
  const id = r.ue();
  const chroma = r.ue();
  if (chroma === 3) r.u(1);
  let width = r.ue();
  let height = r.ue();
  if (r.u(1)) {
    const sw = chroma === 1 || chroma === 2 ? 2 : 1;
    const sh = chroma === 1 ? 2 : 1;
    const [l, rr, t, bb] = [r.ue(), r.ue(), r.ue(), r.ue()];
    width -= sw * (l + rr);
    height -= sh * (t + bb);
  }
  const depthLuma = r.ue() + 8;
  const depthChroma = r.ue() + 8;
  return { id, ptl, chroma, depthLuma, depthChroma, width, height, layers: maxSub + 1, nested };
}

function u16(n) {
  return Uint8Array.of((n >> 8) & 255, n & 255);
}

export function hvcC(vps, sps, pps, info) {
  const head = new Uint8Array(23);
  head[0] = 1;
  head.set(info.ptl, 1);
  head[13] = 0xf0;
  head[14] = 0;
  head[15] = 0xfc;
  head[16] = 0xfc | info.chroma;
  head[17] = 0xf8 | (info.depthLuma - 8);
  head[18] = 0xf8 | (info.depthChroma - 8);
  head[19] = 0;
  head[20] = 0;
  head[21] = (info.layers << 3) | (info.nested << 2) | 3;
  const arrays = [
    [32, vps],
    [33, sps],
    [34, pps],
  ].filter((a) => a[1].length);
  head[22] = arrays.length;
  const parts = [head];
  arrays.forEach(([type, list]) => {
    parts.push(Uint8Array.of(0x80 | type), u16(list.length));
    list.forEach((n) => parts.push(u16(n.length), n));
  });
  return box("hvcC", concat(parts));
}

export function createHevc() {
  const sets = { 32: new Map(), 33: new Map(), 34: new Map() };
  let info = null;
  let config = null;
  return {
    codec: "hvc1",
    sample(nals) {
      const keep = [];
      let key = false;
      let vcl = false;
      let changed = false;
      nals.forEach((n) => {
        const type = (n[0] >> 1) & 63;
        if (type === 32 || type === 33 || type === 34) {
          // Each set by its own id; the first four bits of an SPS are its VPS.
          const map = sets[type];
          const sps = type === 33 ? parseHevcSps(n) : null;
          const id = sps ? sps.id : type === 34 ? bitReader(unescape(n), 2).ue() : (n[2] >> 4) & 15;
          if (!map.has(id) || !same(map.get(id), n)) {
            map.set(id, n.slice());
            if (sps) info = sps;
            changed = true;
          }
        } else if (type !== 35 && type !== 38) {
          if (type < 32) vcl = true;
          if (type >= 16 && type <= 23) key = true;
          keep.push(n);
        }
      });
      if (changed && info && sets[33].size && sets[34].size) config = { width: info.width, height: info.height, box: hvcC([...sets[32].values()], [...sets[33].values()], [...sets[34].values()], info), codec: "hvc1" };
      return { nals: keep, key, vcl };
    },
    get config() {
      return config;
    },
  };
}
