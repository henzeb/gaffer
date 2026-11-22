import { short, shortIn } from "../../shared/address.js";

export { short, shortIn };

export function uniq(a) {
  const seen = {};
  const out = [];
  a.forEach((x) => {
    const k = short(x);
    if (!seen[k]) {
      seen[k] = 1;
      out.push(x);
    }
  });
  return out;
}

export function typeOf(x) {
  if (x === null) return "null";
  if (Array.isArray(x)) return "array[" + x.length + "]";
  if (typeof x === "object") return "object{" + Object.keys(x).slice(0, 6).join(",") + "}";
  if (typeof x === "string") return 'string "' + shortIn(x).slice(0, 60) + '"';
  return typeof x;
}

export function collectVideoUrls(o, depth, acc, seen) {
  if (!o || depth > 3 || acc.length > 40) return;
  if (typeof o === "string") {
    if (/\.(mp4|m3u8|mpd|webm)([?#]|$)/i.test(o) && acc.indexOf(o) < 0) acc.push(o);
    return;
  }
  if (typeof o !== "object") return;
  if (seen.indexOf(o) >= 0) return;
  seen.push(o);
  if (o.nodeType || o === window) return;
  let ks;
  try {
    ks = Object.keys(o).slice(0, 60);
  } catch (e) {
    return;
  }
  ks.forEach((k) => {
    let x;
    try {
      x = o[k];
    } catch (e) {
      return;
    }
    collectVideoUrls(x, depth + 1, acc, seen);
  });
}

export const INTERESTING = /hls|dash|shaka|player|qualit|level|bitrate|resolution|source|stream|manifest|m3u8|mpd|variant|rendition/i;

export function fiberKey(el) {
  return Object.keys(el).filter((x) => x.indexOf("__reactFiber") === 0)[0];
}

export function componentName(t) {
  return t && typeof t !== "string" ? t.displayName || t.name || "" : "";
}
