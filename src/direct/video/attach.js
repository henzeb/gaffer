import { state as s, quality as q, freshPortal, resetView, resetTracks } from "../state.js";
import { render } from "../view/transform.js";
import { setFull } from "../view/fullscreen.js";
import { setPitch } from "../playback/speed.js";
import { hideEmbedControls, hideSiteControls, showSiteControls } from "./site-controls.js";
import { updateBar } from "../ui/bar.js";
import { freeCursor } from "../ui/cursor.js";
import { onResize } from "../quality/adapters/portal.js";
import { guardPlay } from "../playback/hold.js";
import { onEmptied, onMetadata } from "./stream.js";
import { watchCast, stopCast } from "../playback/cast.js";
import { stopRecording } from "../record/index.js";
import { updateLayer } from "../view/layer.js";
import { followAds, noteRate } from "./ad.js";
import { applyChoice } from "../playback/volume.js";
import { levelAttach, levelDetach, levelNewSource, levelRecapture } from "../level/index.js";
import { resetChapters, updateChapters } from "../playback/chapters.js";
import { safe } from "../safe.js";

const videoEvents = [
  ["timeupdate", updateBar],
  ["play", updateBar],
  ["play", hideEmbedControls],
  ["playing", applyChoice],
  ["pause", updateBar],
  ["durationchange", updateBar],
  ["loadedmetadata", updateBar],
  ["seeked", updateBar],
  ["playing", updateChapters],
  ["durationchange", updateChapters],
  ["ratechange", updateBar],
  ["ratechange", noteRate],
  ["volumechange", updateBar],
  ["resize", onResize],
  ["emptied", levelNewSource],
  ["loadedmetadata", levelRecapture],
  ["emptied", onEmptied],
  ["loadedmetadata", onMetadata],
].map(([name, fn]) => [name, safe(fn, "video")]);

function restorePreload(v) {
  if (!s.preload) return;
  const value = s.preload.value;
  s.preload = null;
  try {
    if (value === null) v.removeAttribute("preload");
    else v.setAttribute("preload", value);
  } catch (e) {}
}

export function detach() {
  if (!s.v) return;
  resetChapters();
  levelDetach();
  stopRecording("video");
  setFull(false);
  freeCursor();
  showSiteControls();
  videoEvents.forEach((x) => s.v.removeEventListener(x[0], x[1]));
  s.v.removeAttribute("data-vu");
  s.v.removeAttribute("data-vu-id");
  stopCast();
  if (s.unguard) s.unguard();
  s.unguard = null;
  s.hold = false;
  restorePreload(s.v);
  s.v = null;
  render();
}

export function attach(nv) {
  detach();
  s.v = nv;
  resetView();
  s.seeking = false;
  s.autoP = false;
  setPitch();
  try {
    if (nv.preload !== "auto") {
      s.preload = { value: nv.getAttribute("preload") };
      nv.preload = "auto";
    }
  } catch (e) {}
  nv.setAttribute("data-vu", "1");
  nv.setAttribute("data-vu-id", String(s.id));
  s.lastDur = nv.duration;
  s.userRate = nv.playbackRate;
  s.pendingDur = null;
  s.unguard = guardPlay(nv);
  watchCast(nv);
  videoEvents.forEach((x) => nv.addEventListener(x[0], x[1]));
  q.bad = {};
  clearTimeout(q.check);
  q.adapter = null;
  q.pq = freshPortal(false);
  q.key = "";
  q.sel = null;
  q.open = false;
  q.tick = 0;
  resetTracks();
  levelAttach();
  followAds();
  hideSiteControls();
  updateLayer();
  render();
  updateBar();
}
