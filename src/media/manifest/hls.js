export function isHls(text) {
  return /^\s*#EXTM3U/.test(text || "");
}

export function attrs(s) {
  const out = {};
  const re = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

function resolve(u, base) {
  try {
    return new URL(u, base).href;
  } catch (e) {
    return u;
  }
}

function range(s, next) {
  const m = /^(\d+)(?:@(\d+))?/.exec(s || "");
  if (!m) return null;
  const length = +m[1];
  const offset = m[2] !== undefined ? +m[2] : next;
  return { offset, length };
}

const ENCRYPTED = /#EXT-X-(SESSION-)?KEY:([^\n]*)/g;

export function hlsEncrypted(text) {
  let m;
  ENCRYPTED.lastIndex = 0;
  while ((m = ENCRYPTED.exec(text || ""))) {
    const method = (attrs(m[2]).METHOD || "").toUpperCase();
    if (method && method !== "NONE") return true;
  }
  return false;
}

export function parseHls(text, base) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim());
  const variants = [];
  const renditions = [];
  const segments = [];
  let pendingVariant = null;
  let duration = 0;
  let byterange = null;
  let nextOffset = 0;
  let map = null;
  let key = null;
  let discontinuity = false;
  let endList = false;
  let type = "";
  let time = 0;
  for (const line of lines) {
    if (!line) continue;
    if (line[0] === "#") {
      const i = line.indexOf(":");
      const tag = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? "" : line.slice(i + 1);
      if (tag === "#EXT-X-STREAM-INF") {
        const a = attrs(value);
        const res = /^(\d+)x(\d+)$/.exec(a.RESOLUTION || "");
        pendingVariant = { bandwidth: +a.BANDWIDTH || 0, width: res ? +res[1] : 0, height: res ? +res[2] : 0, codecs: a.CODECS || "", audio: a.AUDIO || null };
      } else if (tag === "#EXT-X-MEDIA") {
        const a = attrs(value);
        renditions.push({ type: a.TYPE || "", group: a["GROUP-ID"] || "", name: a.NAME || "", language: a.LANGUAGE || "", default: a.DEFAULT === "YES", uri: a.URI ? resolve(a.URI, base) : null });
      } else if (tag === "#EXTINF") duration = parseFloat(value) || 0;
      else if (tag === "#EXT-X-BYTERANGE") byterange = range(value, nextOffset);
      else if (tag === "#EXT-X-MAP") {
        const a = attrs(value);
        map = { uri: resolve(a.URI || "", base), range: a.BYTERANGE ? range(a.BYTERANGE, 0) : null };
      } else if (tag === "#EXT-X-KEY") {
        const a = attrs(value);
        key = (a.METHOD || "NONE").toUpperCase() === "NONE" ? null : a.METHOD;
      } else if (tag === "#EXT-X-DISCONTINUITY") discontinuity = true;
      else if (tag === "#EXT-X-ENDLIST") endList = true;
      else if (tag === "#EXT-X-PLAYLIST-TYPE") type = value.toUpperCase();
      continue;
    }
    if (pendingVariant) {
      pendingVariant.uri = resolve(line, base);
      variants.push(pendingVariant);
      pendingVariant = null;
      continue;
    }
    segments.push({ uri: resolve(line, base), start: time, duration, range: byterange, map, key, discontinuity });
    if (byterange) nextOffset = byterange.offset + byterange.length;
    time += duration;
    duration = 0;
    byterange = null;
    discontinuity = false;
  }
  const first = segments[0];
  let format = null;
  if (first) format = first.map ? "fmp4" : /\.(m4s|mp4|m4v|m4a|cmfv|cmfa)([?#]|$)/i.test(first.uri) ? "fmp4" : /\.(aac|mp3|ac3|ec3)([?#]|$)/i.test(first.uri) ? "packed" : /\.(vtt|webvtt)([?#]|$)/i.test(first.uri) ? "other" : "ts";
  return {
    kind: "hls",
    master: variants.length > 0,
    variants,
    renditions,
    segments,
    endList,
    live: !variants.length && !endList && type !== "VOD",
    duration: time,
    format,
    encrypted: hlsEncrypted(text),
  };
}
