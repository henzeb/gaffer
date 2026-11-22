import { state as s, els } from "../state.js";
import { blocked } from "../host.js";
import { container, embedHost, outsideBox } from "../view/layer.js";
import { AD_LAYERS, CAPTIONS, END_SCREENS } from "../video/site-controls.js";
import { boxParent, deepClosest, deepContains, deepElementFromPoint, targetOf } from "../../shared/deep.js";

const FOREIGN = '#vu-analyse,[popover],dialog,[role="dialog"],[aria-modal="true"]';

export function foreignOverlay(t) {
  try {
    const c = deepClosest(t, FOREIGN);
    return !!c && c !== s.v && !(s.v && deepContains(c, s.v));
  } catch (e) {
    return false;
  }
}

// A window of the site, or an ad of another player than YouTube (its Skip
// button may lie where the bars are): the bars step aside while it is shown.
// Put together when used: site-controls.js is part of an import cycle with
// this module, so AD_LAYERS is not there yet when this module loads.
// A threshold of the site that site-controls.js recognised counts too.
const siteOverlays = () => '[popover],dialog,[role="dialog"],[aria-modal="true"],[data-vu-gate],' + AD_LAYERS;

function overlaps(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
}

function shown(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return null;
  return r;
}

// In fullscreen the video lies in the top layer, so a window of the site counts
// only if it really lies above it.
function above(el, r, v, vr) {
  const x = (Math.max(r.left, vr.left) + Math.min(r.right, vr.right)) / 2;
  const y = (Math.max(r.top, vr.top) + Math.min(r.bottom, vr.bottom)) / 2;
  const list = document.elementsFromPoint(x, y);
  const i = list.findIndex((e) => deepContains(el, e));
  const vi = list.indexOf(v);
  return i >= 0 && (vi < 0 || i < vi);
}

let overlayAt = 0;
let overlayWas = false;

export function siteOverlay() {
  const now = Date.now();
  if (now - overlayAt < 250) return overlayWas;
  overlayAt = now;
  overlayWas = findOverlay();
  return overlayWas;
}

function findOverlay() {
  const v = s.v;
  if (!v) return false;
  let list = [];
  try {
    list = document.querySelectorAll(siteOverlays());
  } catch (e) {
    return false;
  }
  const vr = v.getBoundingClientRect();
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el === v || deepContains(el, v) || els.top.contains(el) || els.bar.contains(el) || el.closest("#vu-analyse,#vu-osd,#vu-rec,#vu-notice,[data-vu-for]")) continue;
    const r = shown(el);
    if (r && overlaps(r, vr) && (!s.F || above(el, r, v, vr))) return true;
  }
  return false;
}

// Also the bars of another video: videos may share a parent, and then that
// video's area counts as ours (overVideo).
export function ownUI(t) {
  return !!deepClosest(t, "[data-vu-for]");
}

export function inUI(t) {
  return ownUI(t) || foreignOverlay(t);
}

function roughlyVideo(box, v) {
  return box !== document.body && box !== document.documentElement && box.offsetWidth <= v.offsetWidth * 1.3 + 100 && box.offsetHeight <= v.offsetHeight * 1.3 + 150;
}

// Whether what lies under the mouse belongs to this video: the video, its
// player or our bars. Anything else over it, such as a page header, is the
// site's. The video's player is the element the bars are in, if that is not
// much larger than the video.
export function belongs(t) {
  const v = s.v;
  if (!v || !t || t.nodeType !== 1) return false;
  if (t === v || deepContains(t, v) || els.top.contains(t) || els.bar.contains(t)) return true;
  if (t.tagName === "VIDEO") return false;
  if (embedHost(t) || s.hidden.some((h) => deepContains(h.el, t))) return true;
  const box = container();
  if (!box || !deepContains(box, t)) return false;
  if (roughlyVideo(box, v)) return true;
  return !!deepClosest(t, CAPTIONS + "," + END_SCREENS);
}

const ACTIVE = 'a[href],button,label,input,textarea,select,[contenteditable],[role="button"],[role="slider"]';

// A press there is not the start of a drag.
export function interactive(t) {
  const a = deepClosest(t, ACTIVE);
  return !!a && !(s.v && deepContains(a, s.v));
}

// The video lies under the mouse, and nothing of the site lies over it.
export function atVideo(x, y) {
  return overVideo(x, y) && belongs(deepElementFromPoint(x, y));
}

const FILL = 0.9;

export function fillsWindow() {
  const v = s.v;
  if (!v || blocked()) return false;
  const r = v.getBoundingClientRect();
  const w = Math.min(window.innerWidth, r.right) - Math.max(0, r.left);
  const h = Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top);
  return w >= window.innerWidth * FILL && h >= window.innerHeight * FILL;
}

export function overVideo(x, y) {
  const v = s.v;
  if (!v || blocked()) return false;
  const rs = [v.getBoundingClientRect()];
  const parent = boxParent(v);
  if (parent) rs.push(parent.getBoundingClientRect());
  const away = outsideBox(v);
  if (away) rs.push(away);
  return rs.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

export function onVideo(e) {
  const v = s.v;
  const t = targetOf(e);
  if (!v || blocked() || e.button !== 0 || inUI(t)) return false;
  const own = t === v || deepContains(t, v) || !!deepClosest(t, "[data-vu-poster]");
  if (!own) return false;
  if (s.F) return t === v || deepContains(t, v);
  const r = v.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}
