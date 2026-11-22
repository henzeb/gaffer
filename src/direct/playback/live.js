import { state as s } from "../state.js";
import { showOsd } from "../ui/osd.js";
import { updateBar } from "../ui/bar.js";
import { t } from "../../shared/i18n.js";
import { blockedByAd } from "../video/ad.js";
import { ms } from "../../shared/timing.js";

// Players that say a stream is live, also one with a window to rewind in (DVR)
// whose duration is finite (SPEC §11.5).
const LIVE_FLAGS = ".vjs-live,.jw-flag-live";
// A duration that grows this often while the source stays the same is live.
const GROWS = 2;
// Further behind than this, past the delay the player itself keeps, is not live.
export const BEHIND = 10;
// The delay the player keeps is measured once it plays steadily.
const STEADY = 2000;

const grown = new WeakMap();
const lags = new WeakMap();

function flagged(v) {
  try {
    return !!v.closest(LIVE_FLAGS);
  } catch (e) {
    return false;
  }
}

function growing(v) {
  const d = v.duration;
  if (!isFinite(d) || d <= 0) return false;
  let g = grown.get(v);
  if (!g || g.src !== v.currentSrc) {
    grown.set(v, { src: v.currentSrc, dur: d, n: 0 });
    return false;
  }
  // Small steps add up: the last counted duration stays the reference.
  if (d > g.dur + 0.5) {
    g.n = d - g.dur < 60 ? g.n + 1 : 0;
    g.dur = d;
  } else if (d < g.dur - 0.5) {
    g.n = 0;
    g.dur = d;
  }
  return g.n >= GROWS;
}

export function isLive() {
  const v = s.v;
  if (!v) return false;
  return v.duration === Infinity || flagged(v) || growing(v);
}

// For Inspect (SPEC §12.1): why it counts as live, the window that can be
// played, the player's own delay and how far behind live.
export function liveInfo() {
  const v = s.v;
  if (!v) return null;
  const why = v.duration === Infinity ? "infinity" : flagged(v) ? "flag" : growing(v) ? "growing" : "";
  const se = v.seekable;
  const range = se && se.length ? [se.start(0), se.end(se.length - 1)] : null;
  if (!why) return { live: false, why, range };
  const l = lags.get(v);
  return { live: true, why, range, delay: l && l.min !== Infinity ? l.min : null, behind: behindLive() };
}

export function liveEdge() {
  const se = s.v.seekable;
  if (se && se.length) return se.end(se.length - 1);
  const b = s.v.buffered;
  return b && b.length ? b.end(b.length - 1) : 0;
}

function lagNow() {
  const e = liveEdge();
  return e ? Math.max(0, e - s.v.currentTime) : 0;
}

// The delay the player keeps by itself while it plays live: the smallest
// distance to the edge while it plays steadily, from the start or from LIVE.
// After a pause the distance grows, the smallest stays.
function ownLag() {
  const v = s.v;
  let l = lags.get(v);
  if (!l) lags.set(v, (l = { min: Infinity, steady: Date.now() }));
  const now = Date.now();
  if (v.paused || v.seeking || v.readyState < v.HAVE_FUTURE_DATA || v.playbackRate !== 1) l.steady = now;
  else if (now - l.steady >= ms(STEADY)) l.min = Math.min(l.min, lagNow());
  // Not measured yet: whatever the distance is, it is the player's.
  return l.min === Infinity ? lagNow() : l.min;
}

// How far behind live, past the player's own delay.
export function behindLive() {
  if (!s.v) return 0;
  const own = ownLag();
  return Math.max(0, lagNow() - own);
}

// Whether the moment the video stands at is still in the window that can be played.
export function inWindow() {
  const v = s.v;
  const se = v && v.seekable;
  if (!se || !se.length) return true;
  return v.currentTime >= se.start(0) - 0.5;
}

export function goLive(quiet) {
  const v = s.v;
  if (!v || blockedByAd()) return;
  s.autoP = false;
  s.hold = false;
  const e = liveEdge();
  if (e && e - v.currentTime > 3) {
    try {
      v.currentTime = Math.max(0, e - 2);
    } catch (x) {}
  }
  lags.delete(v);
  v.playbackRate = 1;
  const pr = v.play();
  if (pr && pr.catch) pr.catch(() => {});
  if (!quiet) showOsd(t("direct.osd.live"));
  updateBar();
}
