// Chapters of a video per player (SPEC §11.14): pure lookups that take the
// video. A source is { name, list() } with { start (seconds), title }, sorted.
import { call, each, holds } from "./tracks/common.js";
import { youtubePlayer } from "./tracks/youtube.js";
import { jwPlayer, videojsPlayer, plyrInstance, vidstackPlayer, listOf } from "./tracks/players.js";
import { candidates } from "./tracks/index.js";
import { allVideos } from "./deep.js";

function text(t) {
  if (!t) return "";
  if (typeof t === "string") return t;
  if (t.simpleText) return t.simpleText;
  return Array.isArray(t.runs) ? t.runs.map((r) => r.text || "").join("") : "";
}

// Two or more usable chapters, in order; otherwise nothing.
export function clean(list) {
  const ok = (list || [])
    .map((c) => ({ start: Number(c.start), title: text(c.title).trim() }))
    .filter((c) => isFinite(c.start) && c.start >= 0)
    .sort((a, b) => a.start - b.start);
  return ok.length > 1 ? ok : [];
}

export function chaptersFromResponse(r) {
  const overlay = r && r.playerOverlays && r.playerOverlays.playerOverlayRenderer;
  const decorated = overlay && overlay.decoratedPlayerBarRenderer && overlay.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer;
  const bar = decorated && decorated.playerBar && decorated.playerBar.multiMarkersPlayerBarRenderer;
  const maps = ((bar && bar.markersMap) || []).filter((m) => m && m.value && Array.isArray(m.value.chapters));
  // The chapters of the maker go before the automatic ones.
  const map = maps.filter((m) => m.key === "DESCRIPTION_CHAPTERS")[0] || maps[0];
  if (!map) return [];
  return map.value.chapters.map((c) => {
    const x = (c && c.chapterRenderer) || {};
    return { start: Number(x.timeRangeStartMillis) / 1000, title: x.title };
  });
}

function youtube(video) {
  const yt = youtubePlayer(video);
  if (!yt || typeof yt.getWatchNextResponse !== "function") return null;
  return () => {
    const r = yt.getWatchNextResponse();
    const now = call(() => yt.getVideoData().video_id);
    const of = call(() => r.currentVideoEndpoint.watchEndpoint.videoId);
    return now && of && now !== of ? [] : chaptersFromResponse(r);
  };
}

function jw(video) {
  const p = jwPlayer(video);
  if (!p || typeof p.getCues !== "function") return null;
  return () => each(p.getCues()).filter((c) => c.cueType === "chapters").map((c) => ({ start: c.begin, title: c.text }));
}

function plyr(video) {
  const p = plyrInstance(video);
  const points = () => call(() => p.config.markers.enabled && p.config.markers.points);
  return points() ? () => each(points()).map((m) => ({ start: m.time, title: m.label })) : null;
}

function cueList(tracks) {
  const tr = tracks.filter((x) => x.kind === "chapters" && x.cues && x.cues.length)[0];
  return tr ? each(tr.cues).map((c) => ({ start: c.startTime, title: c.text || c.content })) : [];
}

function videojs(video) {
  const p = videojsPlayer(video);
  return p && typeof p.textTracks === "function" ? () => cueList(each(p.textTracks())) : null;
}

function vidstack(video) {
  const p = vidstackPlayer(video);
  return p ? () => cueList(each(call(() => listOf(p.textTracks)))) : null;
}

const loaded = new WeakMap();

function shaka(sp, video) {
  if (typeof sp.getMediaElement !== "function" || typeof sp.getChaptersTracks !== "function" || call(() => sp.getMediaElement()) !== video) return null;
  return () => {
    const tr = each(sp.getChaptersTracks())[0];
    if (!tr) return [];
    if (typeof sp.getChapters === "function") return each(sp.getChapters(tr.language)).map((c) => ({ start: c.startTime, title: c.title }));
    // Shaka 5 only has the asynchronous version.
    const key = call(() => sp.getAssetUri()) + " " + tr.language;
    let e = loaded.get(sp);
    if (!e || e.key !== key) {
      e = { key, list: [] };
      loaded.set(sp, e);
      const own = e;
      Promise.resolve(call(() => sp.getChaptersAsync(tr.language))).then((l) => (own.list = each(l)), () => {});
    }
    return e.list.map((c) => ({ start: c.startTime, title: c.title }));
  };
}

function bitmovin(p, video) {
  if (typeof p.getSource !== "function") return null;
  if (!holds(call(() => p.getVideoElement && p.getVideoElement()), video) && !holds(call(() => p.getContainer && p.getContainer()), video)) return null;
  return () => each(call(() => p.getSource().metadata.markers) || call(() => p.getConfig().ui.metadata.markers)).map((m) => ({ start: m.time, title: m.title }));
}

function theo(p, video) {
  return p.textTracks && holds(p.element, video) ? () => cueList(each(p.textTracks)) : null;
}

function native(video) {
  return () => cueList(each(video.textTracks));
}

// What the page tells the system about the playing video. It belongs to the
// page, so it only counts when there is one video.
function session() {
  return () => {
    if (allVideos().length !== 1) return [];
    return each(navigator.mediaSession.metadata.chapterInfo).map((c) => ({ start: c.startTime, title: c.title }));
  };
}

function* sources(video, extra) {
  const own = [["YouTube", youtube], ["JW Player", jw], ["video.js", videojs], ["Plyr", plyr], ["Vidstack", vidstack]];
  for (const [name, make] of own) yield [name, call(() => make(video))];
  const libs = [["Shaka Player", shaka], ["Bitmovin", bitmovin], ["THEOplayer", theo]];
  for (const c of candidates(video, extra)) for (const [name, make] of libs) yield [name, call(() => make(c, video))];
  yield ["<video>", native(video)];
  yield ["media session", session()];
}

export function findChapters(video, extra) {
  if (!video) return null;
  for (const [name, get] of sources(video, extra)) {
    if (!get) continue;
    const list = () => clean(call(get));
    if (list().length) return { name, list };
  }
  return null;
}

// Chapter tracks the browser or the player has not loaded, because they are off.
export function unloadedChapters(video, extra) {
  const lists = [video.textTracks, call(() => videojsPlayer(video).textTracks()), call(() => listOf(vidstackPlayer(video).textTracks))];
  // A frame of another domain is an object on the window too, and throws on
  // every access.
  for (const c of candidates(video, extra)) lists.push(call(() => (holds(c.element, video) ? c.textTracks : null)));
  const out = [];
  lists.forEach((l) => each(l).forEach((t) => {
    if (t.kind === "chapters" && t.mode === "disabled" && !out.includes(t)) out.push(t);
  }));
  return out;
}
