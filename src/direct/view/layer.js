import { state as s, els } from "../state.js";
import { showInTopLayer } from "../../shared/dom.js";
import { CAPTIONS, CONTROL_BARS, EMBED_CONTROLS, END_SCREENS, notStarted } from "../video/site-controls.js";
import { boxParent, deepContains, deepParent, deepQueryAll, inShadow, shadowOf } from "../../shared/deep.js";

const MAX = 2147483646;

function overlays() {
  return [els.loader, els.top, els.bar, els.osd, els.recInd].filter(Boolean);
}

export function playerBox(v) {
  let a = v;
  let top = null;
  while (deepParent(a) && deepParent(a) !== document.body && deepParent(a) !== document.documentElement) {
    const pa = deepParent(a);
    if (pa.offsetWidth <= v.offsetWidth * 1.3 + 100 && pa.offsetHeight <= v.offsetHeight * 1.3 + 150) {
      // A slot has no box of its own.
      if (pa.localName !== "slot") top = pa;
      a = pa;
    } else break;
  }
  return top || boxParent(v) || v;
}

// The player's box while a video that has not started lies outside it (YouTube
// keeps it above its box until then), otherwise null.
export function outsideBox(v) {
  if (!notStarted(v)) return null;
  const box = playerBox(v);
  if (!box || box === v) return null;
  const a = v.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (!b.width || !b.height) return null;
  return a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right ? b : null;
}

// During an ad the bars lie inside YouTube's player, between the video and the
// ad layer, so that the Skip button goes over them (SPEC §11.13).
function adPlayer(v) {
  return s.ad ? v.closest(".html5-video-player") : null;
}

function zOf(el) {
  let cs = null;
  try {
    cs = getComputedStyle(el);
  } catch (e) {
    return null;
  }
  if (cs.zIndex === "auto") return null;
  const z = parseInt(cs.zIndex, 10);
  return isNaN(z) ? null : z;
}

function counts(el, vr) {
  if (el.closest('[data-vu-hide],[data-vu-for],[id^="vu-"],[id^="video-ultimate"]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  if (Math.min(r.right, vr.right) <= Math.max(r.left, vr.left) || Math.min(r.bottom, vr.bottom) <= Math.max(r.top, vr.top)) return false;
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0;
}

const STOP = ["click", "dblclick", "auxclick", "contextmenu", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend"];

function stop(e) {
  e.stopPropagation();
}

export function isolate(el) {
  STOP.forEach((n) => el.addEventListener(n, stop));
}

const SLIDERS = '[role="slider"],[role="progressbar"],input[type="range"],progress';

function looksLikeControls(el) {
  try {
    return el.matches(CONTROL_BARS) || !!el.querySelector(SLIDERS) || el.querySelectorAll('button,[role="button"]').length > 1;
  } catch (e) {
    return false;
  }
}

// What the player itself has over the video: its controls, images before the
// start, captions and end screens.
function layersOf(v) {
  const box = playerBox(v);
  const out = [];
  const add = (el, kind) => {
    if (deepContains(el, v) || el.closest('[data-vu-for],[id^="vu-"],[id^="video-ultimate"]') || out.some((x) => x.el === el)) return;
    out.push({ el, kind });
  };
  const find = (sel, from = box) => deepQueryAll(from, sel).slice(0, 3000);
  find(CONTROL_BARS).forEach((el) => add(el, "controls"));
  if (v.closest(".html5-video-player")) find(EMBED_CONTROLS, document).forEach((el) => add(el, "controls"));
  s.hidden.forEach((h) => {
    if (h.el.isConnected && deepContains(box, h.el)) add(h.el, h.poster ? "poster" : looksLikeControls(h.el) ? "controls" : "other");
  });
  const vr = v.getBoundingClientRect();
  find(CAPTIONS + "," + END_SCREENS).forEach((el) => {
    if (counts(el, vr)) add(el, "text");
  });
  return out;
}

// Elements that cannot hold the bars: children of a shadow host that it does
// not show.
const unusable = new WeakSet();
const ACTIVE = "a[href],button,label,summary";

// The bars stay in the page itself, out of every shadow root: there Direct's
// own styles apply (SPEC §11.2).
function usable(box) {
  return !unusable.has(box) && !shadowOf(box) && !inShadow(box);
}

// The element that holds the site's own controls as well as the video. Without
// recognised controls: the smallest one around the video and its layers.
function containerOf(v, layers) {
  const controls = layers.filter((x) => x.kind === "controls");
  const inside = controls.length ? controls : layers;
  let box = deepParent(v);
  const up = () => {
    if (!deepParent(box) || box === document.body) return false;
    box = deepParent(box);
    return true;
  };
  while (box && (!usable(box) || inside.some((x) => !deepContains(box, x.el))) && up());
  // A click on the bars would also activate a link around them.
  for (let a = box && box.closest(ACTIVE); a && a.parentElement; a = box.closest(ACTIVE)) box = a.parentElement;
  return box;
}

export function mount(layers) {
  const v = s.v;
  if (!v || s.closing) return null;
  // In fullscreen a site may hide the player (YouTube moves the video out of
  // its box), and a hidden ancestor also hides elements in the top layer.
  const box = s.F ? document.body : adPlayer(v) || containerOf(v, layers || layersOf(v));
  if (!box || box === v) return null;
  overlays().forEach((e) => {
    if (e.parentNode === box) return;
    box.appendChild(e);
    // Moving an open popover closes it.
    if (s.F && s.pop && e.hasAttribute("popover")) showInTopLayer(e);
  });
  if (!s.F && box !== document.body && shows(v) && !els.top.classList.contains("v-ui-off") && !shows(els.top)) {
    unusable.add(box);
    return mount(layers);
  }
  return box;
}

function shows(el) {
  return el.getClientRects().length > 0;
}

// The element the bars are in, outside fullscreen.
export function container() {
  return s.F || !els.bar ? null : els.bar.parentElement;
}

let source = null;

export function zSource() {
  return source;
}

// Whether the z-index of the children stays inside the element.
function ownLayer(el) {
  const cs = getComputedStyle(el);
  return (
    (cs.position !== "static" && cs.zIndex !== "auto") ||
    cs.position === "fixed" ||
    cs.position === "sticky" ||
    cs.transform !== "none" ||
    cs.filter !== "none" ||
    cs.isolation === "isolate" ||
    +cs.opacity < 1 ||
    /paint|layout|strict|content/.test(cs.contain) ||
    /transform|opacity/.test(cs.willChange)
  );
}

// The z-index of an element as its container sees it: that of the outermost
// element on the way that has one.
function zIn(el, box) {
  let z = 0;
  for (let e = el; e && e !== box; e = deepParent(e)) {
    const n = zOf(e);
    if (n !== null) z = n;
  }
  return z;
}

// As high as the site's own controls and above the video. Where the player keeps
// its layers to itself also above its captions and end screen; elsewhere that
// could lift the bars over the rest of the page.
function zFor(v, box, layers) {
  const above = ownLayer(box) ? 1 : 0;
  let max = above;
  source = null;
  const take = (el, plus) => {
    const z = zIn(el, box) + plus;
    if (z <= max) return;
    max = z;
    source = el;
  };
  take(v, above);
  layers.forEach((x) => {
    if (x.kind === "other" || (x.kind === "text" && !above) || !deepContains(box, x.el)) return;
    take(x.el, above);
  });
  return Math.min(MAX, max);
}

export function updateLayer() {
  const v = s.v;
  const ad = v ? adPlayer(v) : null;
  const layers = v && !s.F && !ad ? layersOf(v) : [];
  const box = mount(layers);
  const z = s.F || !v || !box ? "" : String(ad ? zIn(v, ad) + 1 : zFor(v, box, layers));
  overlays().forEach((e) => {
    if (z) e.style.setProperty("--vu-z", z);
    else e.style.removeProperty("--vu-z");
  });
}

// The element next to YouTube's embedded player with its controls.
export function embedHost(t) {
  return !!s.v && !!s.v.closest(".html5-video-player") && !!t.closest(EMBED_CONTROLS);
}

// The part of the video's box that the player does not cut off.
export function clipped(v, r) {
  const last = playerBox(v);
  const c = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  for (let e = deepParent(v); e && e !== document.body; e = deepParent(e)) {
    const o = getComputedStyle(e);
    const b = /hidden|clip/.test(o.overflowX + o.overflowY) ? e.getBoundingClientRect() : null;
    if (b && /hidden|clip/.test(o.overflowX)) {
      c.left = Math.max(c.left, b.left);
      c.right = Math.min(c.right, b.right);
    }
    if (b && /hidden|clip/.test(o.overflowY)) {
      c.top = Math.max(c.top, b.top);
      c.bottom = Math.min(c.bottom, b.bottom);
    }
    if (e === last) break;
  }
  return c;
}

export function topLayer(on) {
  if (!s.pop) return;
  if (on) mount();
  overlays().forEach((e) => {
    if (on) {
      e.setAttribute("popover", "manual");
      try {
        e.hidePopover();
      } catch (x) {}
      try {
        e.showPopover();
      } catch (x) {}
    } else if (e.hasAttribute("popover")) {
      try {
        e.hidePopover();
      } catch (x) {}
      e.removeAttribute("popover");
    }
  });
}
