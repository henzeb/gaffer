import { PLAYER_ROOTS } from "../../shared/player-detect.js";

const ROOTS = ".html5-video-player," + PLAYER_ROOTS;

function px(n) {
  return Math.round(n);
}

export function layoutOf(v) {
  const r = v.getBoundingClientRect();
  let cs = null;
  try {
    cs = getComputedStyle(v);
  } catch (e) {}
  return {
    left: px(r.left),
    top: px(r.top),
    width: px(r.width),
    height: px(r.height),
    display: cs ? cs.display : "?",
    visibility: cs ? cs.visibility : "?",
    opacity: cs ? cs.opacity : "?",
    transform: cs ? cs.transform : "?",
    ended: !!v.ended,
  };
}

export function layoutKey(l) {
  return [l.left, l.top, l.width, l.height, l.display, l.visibility, l.opacity, l.transform, l.ended].join("|");
}

export function playerRoot(v) {
  return (v.closest && v.closest(ROOTS)) || null;
}

export function classesOf(el) {
  return el && typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean) : [];
}

function barBox(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: px(r.top), bottom: px(r.bottom), left: px(r.left), width: px(r.width) };
}

export function barsOf(id) {
  const bar = document.querySelector('#video-ultimate-bar[data-vu-for="' + id + '"]');
  let z = "?";
  try {
    z = bar ? (bar.matches(":popover-open") ? "top layer" : getComputedStyle(bar).zIndex) : "?";
  } catch (e) {
    z = bar ? getComputedStyle(bar).zIndex : "?";
  }
  return {
    z,
    top: barBox(document.querySelector('#video-ultimate-top[data-vu-for="' + id + '"]')),
    bottom: barBox(document.querySelector('#video-ultimate-bar[data-vu-for="' + id + '"]')),
  };
}
