import { isManifestUrl } from "../../shared/net-hook.js";
import { isHls, parseHls } from "../../media/manifest/hls.js";
import { parseMpd } from "../../media/manifest/dash.js";
import { fetchText } from "./manifest-download.js";

const MAX_URLS = 40;
const PER_ROUND = 6;
// A live manifest is read again after this long: it may have ended meanwhile.
const LIVE_MS = 10000;

// Whether a manifest of this length can belong to a video of that length.
export function sameLength(a, b) {
  if (!(a > 0) || !(b > 0) || !isFinite(a) || !isFinite(b)) return true;
  return Math.abs(a - b) <= Math.max(2, 0.02 * b);
}

export function createManifests({ fetch: get = fetchText, now = () => Date.now() } = {}) {
  const urls = [];
  const texts = new Map();
  const fetched = new Map();
  const formats = new Map();
  const variants = new Map();
  let busy = false;
  let obs = null;

  function forget(u) {
    texts.delete(u);
    fetched.delete(u);
    formats.delete(u);
    variants.delete(u);
  }

  function add(u) {
    if (!u || !isManifestUrl(u) || /^(blob|data):/.test(u)) return;
    const i = urls.indexOf(u);
    if (i >= 0) urls.splice(i, 1);
    urls.push(u);
    if (urls.length > MAX_URLS) forget(urls.shift());
  }

  function watch() {
    try {
      performance.getEntriesByType("resource").forEach((e) => add(e.name));
    } catch (e) {}
    try {
      obs = new PerformanceObserver((list) => list.getEntries().forEach((e) => add(e.name)));
      obs.observe({ type: "resource", buffered: true });
    } catch (e) {}
    return () => {
      if (obs) obs.disconnect();
      obs = null;
    };
  }

  // Format, live and length of a manifest; for an HLS master those of its first
  // variant.
  async function formatOf(url, text) {
    if (!isHls(text)) {
      const d = /<(\w+:)?MPD[\s>]/.test(text) ? parseMpd(text, url) : null;
      if (!d) return null;
      const video = d.representations.filter((r) => r.kind === "video");
      const webm = video.length > 0 && video.every((r) => /webm/i.test(r.mime));
      return { format: webm ? "webm" : "dash", live: d.live, duration: d.duration };
    }
    const p = parseHls(text, url);
    if (!p.master) return { format: p.format, live: p.live, duration: p.duration };
    const first = p.variants.find((x) => x.uri);
    if (!first) return null;
    if (!variants.has(url)) variants.set(url, await get(first.uri).catch(() => ""));
    const m = variants.get(url) ? parseHls(variants.get(url), first.uri) : null;
    return m ? { format: m.format, live: m.live, duration: m.duration } : null;
  }

  function stale(u) {
    const f = formats.get(u);
    return !!f && f.live && now() - (fetched.get(u) || 0) >= LIVE_MS;
  }

  async function refresh(extra = []) {
    if (busy) return;
    busy = true;
    extra.forEach(add);
    try {
      const todo = urls.filter((u) => !texts.has(u) || stale(u)).slice(-PER_ROUND);
      for (const u of todo) {
        const again = texts.has(u);
        texts.set(u, await get(u).catch(() => ""));
        fetched.set(u, now());
        if (again) {
          formats.delete(u);
          variants.delete(u);
        }
      }
      for (const u of urls) {
        const t = texts.get(u);
        if (t && !formats.has(u)) formats.set(u, await formatOf(u, t).catch(() => null));
      }
    } finally {
      busy = false;
    }
  }

  // The texts of the manifests that can belong to a video of this length; an ad
  // or a preview on the page does not count.
  function all(duration) {
    return urls.filter((u) => texts.get(u) && sameLength((formats.get(u) || {}).duration, duration)).map((u) => texts.get(u));
  }

  function top(text) {
    return /#EXT-X-STREAM-INF/.test(text) || /<(\w+:)?MPD[\s>]/.test(text);
  }

  // The manifest of the video: the player's own, otherwise the last one seen
  // (a master before a media playlist). Only one whose length matches the
  // video's counts: the page may also have loaded an ad or a preview.
  function current(prefer, duration) {
    const fits = (u) => texts.get(u) && sameLength((formats.get(u) || {}).duration, duration);
    const known = urls.filter(fits);
    let url = prefer && fits(prefer) ? prefer : null;
    if (!url) url = known.filter((u) => top(texts.get(u))).pop() || known.pop() || null;
    const f = formats.get(url) || {};
    return url ? { url, text: texts.get(url), format: f.format || null, live: !!f.live, duration: f.duration } : null;
  }

  return { watch, refresh, all, current, add };
}
