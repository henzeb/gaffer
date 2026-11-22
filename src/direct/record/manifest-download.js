import { isHls, parseHls } from "../../media/manifest/hls.js";
import { parseMpd } from "../../media/manifest/dash.js";
import { createMuxer } from "../../media/mp4/mux.js";
import { createTsMuxer } from "../../media/ts/remux.js";
import { t } from "../../shared/i18n.js";

const PARALLEL = 4;
const AHEAD = 8;
const RETRIES = 3;
const READABLE = ["fmp4", "ts", "packed"];

export async function fetchText(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

// The variant closest to the height; at equal height the one closest to the
// bitrate, or the highest bitrate when that is not known (rate Infinity).
export function closest(list, height, rate) {
  let best = null;
  const off = (x) => (rate === Infinity ? -(x.bandwidth || 0) : Math.abs((x.bandwidth || 0) - rate));
  list.forEach((x) => {
    if (!best) return (best = x);
    const d = Math.abs((x.height || 0) - height) - Math.abs((best.height || 0) - height);
    if (d < 0 || (d === 0 && off(x) < off(best))) best = x;
  });
  return best;
}

function hlsLevel(hls, url) {
  try {
    if (!hls || hls.url !== url || !hls.levels) return null;
    const i = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel;
    return hls.levels[i] || null;
  } catch (e) {
    return null;
  }
}

function hlsJobs(p, key) {
  const jobs = [];
  let map = "";
  p.segments.forEach((s) => {
    const m = s.map ? s.map.uri + "|" + (s.map.range ? s.map.range.offset : "") : "";
    if (m && m !== map) jobs.push({ key, uri: s.map.uri, range: s.map.range, start: s.start, init: true });
    map = m;
    jobs.push({ key, uri: s.uri, range: s.range, start: s.start, init: false, discontinuity: s.discontinuity });
  });
  return jobs;
}

export async function planDownload(url, text, v, hls, signal) {
  const height = (v && v.videoHeight) || 0;
  if (isHls(text)) {
    let p = parseHls(text, url);
    let mediaUrl = url;
    let audioUrl = null;
    if (p.master) {
      const level = hlsLevel(hls, url);
      const variants = p.variants.filter((x) => x.uri);
      const pick = (level && variants.find((x) => x.height === level.height && x.bandwidth === level.bitrate)) || closest(variants, level ? level.height : height, level ? level.bitrate : Infinity);
      if (!pick) return null;
      mediaUrl = pick.uri;
      if (pick.audio) {
        const r = p.renditions.filter((x) => x.type === "AUDIO" && x.group === pick.audio && x.uri);
        const a = r.find((x) => x.default) || r[0];
        if (a) audioUrl = a.uri;
      }
      p = parseHls(await fetchText(mediaUrl, signal), mediaUrl);
    }
    if (p.live || !READABLE.includes(p.format) || p.encrypted || !p.segments.length) return null;
    const jobs = hlsJobs(p, "v");
    let sources = 1;
    let ts = p.format !== "fmp4";
    if (audioUrl) {
      const a = parseHls(await fetchText(audioUrl, signal), audioUrl);
      if (a.live || !READABLE.includes(a.format) || a.encrypted || (a.format !== "fmp4") !== ts) return null;
      jobs.push(...hlsJobs(a, "a"));
      sources = 2;
    }
    return { jobs: sortJobs(jobs), sources, duration: p.duration, ts };
  }
  if (/<(\w+:)?MPD[\s>]/.test(text)) {
    const p = parseMpd(text, url);
    if (!p || p.live || p.encrypted) return null;
    const video = p.representations.filter((r) => r.kind === "video" && r.segments.length);
    const audio = p.representations.filter((r) => r.kind === "audio" && r.segments.length);
    const tracks = [];
    if (video.length) tracks.push(closest(video, height, Infinity));
    if (audio.length) tracks.push(audio.reduce((a, b) => (b.bandwidth > a.bandwidth ? b : a)));
    if (!tracks.length) return null;
    const jobs = [];
    tracks.forEach((r, i) => {
      const key = i ? "a" : "v";
      let last = "";
      r.segments.forEach((s) => {
        const init = s.init === undefined ? r.init : s.init;
        const id = init ? init.uri + "|" + (init.range ? init.range.offset : "") : "";
        if (init && id !== last) jobs.push({ key, uri: init.uri, range: init.range, start: s.start, init: true });
        last = id;
        jobs.push({ key, uri: s.uri, range: s.range, start: s.start, init: false });
      });
    });
    return { jobs: sortJobs(jobs), sources: tracks.length, duration: p.duration };
  }
  return null;
}

function sortJobs(jobs) {
  return jobs
    .map((j, i) => ({ j, i }))
    .sort((x, y) => x.j.start - y.j.start || (x.j.init === y.j.init ? 0 : x.j.init ? -1 : 1) || x.i - y.i)
    .map((x) => x.j);
}

function reason(r) {
  if (/^codec:/.test(r)) return t("direct.download.codec", { codec: r.slice(6) });
  if (r === "format") return t("direct.download.format");
  return t("direct.download.structure");
}

const wait = (n) => new Promise((r) => setTimeout(r, n));

async function fetchBytes(job, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      const headers = job.range ? { Range: "bytes=" + job.range.offset + "-" + (job.range.offset + job.range.length - 1) } : undefined;
      const r = await fetch(job.uri, { signal, headers });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      if ((signal && signal.aborted) || attempt >= RETRIES) throw e;
      await wait(300 * (attempt + 1));
    }
  }
}

export function runDownload(plan, { write, part, signal, progress }) {
  const jobs = plan.jobs;
  const total = jobs.filter((j) => !j.init).length;
  return new Promise((resolve, reject) => {
    let failed = false;
    const fail = (e) => {
      if (failed) return;
      failed = true;
      reject(e);
    };
    const onUnsupported = (r) => fail(new Error(reason(r)));
    const muxer = plan.ts ? createTsMuxer({ keys: plan.sources > 1 ? ["v", "a"] : ["v"], separateAudio: plan.sources > 1, onData: write, onPart: part, onUnsupported }) : createMuxer({ sources: plan.sources, onData: write, onPart: part, onUnsupported });
    const results = new Map();
    let next = 0;
    let deliver = 0;
    let active = 0;
    let done = 0;
    function flush() {
      while (!failed && results.has(deliver)) {
        const b = results.get(deliver);
        results.delete(deliver);
        muxer.push(jobs[deliver].key, b, { discontinuity: !!jobs[deliver].discontinuity });
        if (!jobs[deliver].init) progress(++done, total);
        deliver++;
      }
    }
    function pump() {
      if (failed) return;
      while (active < PARALLEL && next < jobs.length && next < deliver + AHEAD) {
        const i = next++;
        active++;
        fetchBytes(jobs[i], signal).then(
          (b) => {
            active--;
            results.set(i, b);
            step(() => {
              flush();
              pump();
            });
          },
          fail,
        );
      }
      if (deliver === jobs.length && !failed) {
        muxer.end();
        if (failed) return;
        failed = true;
        resolve();
      }
    }
    // A chunk the muxer cannot read throws; that ends the download with a message.
    const step = (fn) => {
      try {
        fn();
      } catch (e) {
        fail(e);
      }
    };
    step(pump);
  });
}
