import { state as s, quality as q, freshPortal } from "../state.js";
import { showOsd } from "../ui/osd.js";
import { place } from "../ui/bar.js";
import { toggleTools } from "../ui/panel.js";
import { renderQuality } from "./render.js";
import { maybeMax } from "./max.js";
import { watchCodec } from "./codec-check.js";
import { markOwnSwitch } from "../video/stream.js";
import { findRadiant, radiantAdapter } from "./adapters/radiant.js";
import { youtubeAdapter } from "./adapters/youtube.js";
import { jwplayerAdapter } from "./adapters/jwplayer.js";
import { videojsAdapter } from "./adapters/videojs.js";
import { findPortal, readPortalNow } from "./adapters/portal.js";
import { domMenuAdapter } from "./adapters/dom-menu.js";
import { hookHls, seenHls, hlsAdapterFor } from "./adapters/hls.js";
import { shakaAdapterFor } from "./adapters/shaka.js";
import { sourcesAdapter } from "./adapters/sources.js";
import { dashAdapterFor } from "./adapters/dashjs.js";
import { bitmovinAdapterFor } from "./adapters/bitmovin.js";
import { theoAdapterFor } from "./adapters/theoplayer.js";
import { plyrAdapter } from "./adapters/plyr.js";
import { flowplayerAdapter } from "./adapters/flowplayer.js";
import { clapprAdapterFor } from "./adapters/clappr.js";
import { kalturaAdapter } from "./adapters/kaltura.js";
import { vimeoAdapter } from "./adapters/vimeo.js";
import { vidstackAdapter } from "./adapters/vidstack.js";
import { renditionsAdapter } from "./adapters/renditions.js";
import { ms } from "../../shared/timing.js";
import { t } from "../../shared/i18n.js";
import { blockedByAd } from "../video/ad.js";
import { tell } from "../tell.js";
import { windowObjects } from "../../shared/globals.js";

function firstAdapter(cands, makers) {
  for (let j = 0; j < cands.length; j++) {
    const c = cands[j];
    if (!c) continue;
    for (let k = 0; k < makers.length; k++) {
      try {
        const a = makers[k](c);
        if (a) return a;
      } catch (e) {}
    }
  }
  return null;
}

function named(name, a) {
  if (a && !a.name) a.name = name;
  return a;
}

function playerApiAdapter() {
  const v = s.v;
  const own = named("Plyr", plyrAdapter()) || named("Kaltura", kalturaAdapter()) || named("Flowplayer", flowplayerAdapter()) || named("Vidstack", vidstackAdapter()) || named("media-tracks", renditionsAdapter());
  if (own) return own;
  const cands = [v.dash, v.player, v.bitmovinPlayer, v.theoplayer, window.player].concat(windowObjects());
  return firstAdapter(cands, [(c) => named("dash.js", dashAdapterFor(c)), (c) => named("Bitmovin", bitmovinAdapterFor(c)), (c) => named("THEOplayer", theoAdapterFor(c)), (c) => named("Clappr", clapprAdapterFor(c))]);
}

function streamPlayerAdapter() {
  hookHls();
  const v = s.v;
  return firstAdapter(seenHls().concat([v.hls, v.player, v._hls, v.shaka]).concat(windowObjects()), [(c) => named("hls.js", hlsAdapterFor(c)), (c) => named("Shaka Player", shakaAdapterFor(c))]);
}

export function findAdapter() {
  if (!s.v) return null;
  const rp = findRadiant();
  if (rp) {
    const ra = radiantAdapter(rp.p, rp.props);
    if (ra.list().length > 1) return named("Radiant", ra);
  }
  return named("YouTube", youtubeAdapter()) || named("JW Player", jwplayerAdapter()) || named("video.js", videojsAdapter()) || playerApiAdapter() || named("site menu", findPortal()) || named("player menu", domMenuAdapter()) || streamPlayerAdapter() || named("Vimeo", vimeoAdapter()) || named("<source>", sourcesAdapter());
}

// For Inspect (SPEC §12.1): beyond the source, Max, the user's choice, the
// unplayable options and the site menu's attempts.
export function qualityState() {
  const a = q.adapter;
  let bad = [];
  try {
    if (a) bad = a.list().filter((it) => q.bad[it.id]).map((it) => it.label);
  } catch (e) {}
  return { max: q.maxOn, user: q.user, bad, menu: q.pq.has ? { tries: q.pq.tries, found: !!q.pq.items } : null };
}

export function qualityInfo() {
  const a = q.adapter;
  if (!a) return null;
  let list = [];
  let cur = null;
  try {
    list = a.list().map((it) => (it.br ? it.label + " (" + Math.round(it.br / 1000) + "k)" : it.label));
  } catch (e) {}
  try {
    cur = qualityLabel(a.cur()) || null;
  } catch (e) {}
  return { name: a.name || "?", list, cur };
}

export function qualityLabel(id) {
  if (!q.adapter) return "";
  const l = q.adapter.list();
  for (let i = 0; i < l.length; i++) if (String(l[i].id) === String(id)) return l[i].label;
  return id === "auto" ? "Auto" : "";
}

export function pickQuality(it, auto) {
  if (s.recording || blockedByAd()) return;
  if (!auto) q.user = true;
  tell(auto ? t("direct.tell.qualityMax", { label: it.label }) : t("direct.tell.quality", { label: it.label }));
  let prev = null;
  try {
    prev = q.adapter.cur();
  } catch (e) {}
  if (String(prev) === String(it.id)) {
    q.open = false;
    renderQuality();
    return;
  }
  markOwnSwitch();
  try {
    q.adapter.set(it.id);
  } catch (e) {}
  q.sel = it.id;
  q.open = false;
  showOsd(it.label);
  renderQuality();
  setTimeout(renderQuality, ms(800));
  watchCodec(it, prev, auto);
}

export function toggleQuality() {
  if (blockedByAd()) return;
  if (s.recording) {
    showOsd(t("direct.quality.locked"));
    return;
  }
  if (!q.adapter) {
    if (!q.pq.has) return;
    q.open = !q.open;
    if (q.open) {
      toggleTools(false);
      readPortalNow();
    }
    renderQuality();
    place();
    return;
  }
  q.open = !q.open;
  if (q.open) toggleTools(false);
  if (q.open && q.adapter.refresh && q.adapter.stale && q.adapter.stale()) q.adapter.refresh(() => renderQuality());
  renderQuality();
  place();
}

export function closeQuality() {
  if (!q.open) return;
  q.open = false;
  renderQuality();
}

export function updateQuality() {
  if (!s.v) return;
  q.tick++;
  const k = location.href;
  if (k !== q.key) {
    q.maxDone = false;
    q.user = false;
    if (q.key) {
      q.adapter = null;
      q.sel = null;
      q.bad = {};
      q.sig = "";
      q.pq = freshPortal(q.pq.has);
    }
    q.key = k;
  }
  if (!q.adapter && !q.pq.items && q.pq.has && Date.now() >= q.pq.next) q.adapter = findAdapter();
  if (q.adapter && q.adapter.refresh && q.adapter.stale && q.adapter.stale() && !q.open && !q.pq.busy && !q.pq.pend) q.adapter.refresh(() => renderQuality());
  if (!q.adapter && (q.tick < 5 || q.tick - Math.floor(q.tick / 3) * 3 === 0)) q.adapter = findAdapter();
  maybeMax();
  renderQuality();
}
