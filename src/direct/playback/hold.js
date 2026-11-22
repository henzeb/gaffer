import { state as s } from "../state.js";
import { inUI } from "../input/routing.js";
import { safe } from "../safe.js";
import { tell } from "../tell.js";
import { t } from "../../shared/i18n.js";
import { boxParent, deepClosest, deepContains, deepParent, targetOf } from "../../shared/deep.js";

const EXCLUDED = /playlist|playback-?rate|replay|autoplay|display/i;
const ACTIVATION_MS = 5000;
const MEDIA_KEY_MS = 1000;
const INPUT_EVENTS = ["pointerdown", "mousedown", "touchstart", "keydown"];
let inputAt = 0;
let mediaKeyAt = 0;

function onInput(e) {
  if (!e.isTrusted) return;
  if (e.type === "keydown" && /^Media(PlayPause|Play)$/.test(e.key || "")) mediaKeyAt = Date.now();
  else inputAt = Date.now();
}

function fromOutside() {
  const now = Date.now();
  if (now - mediaKeyAt < MEDIA_KEY_MS) return true;
  const ua = navigator.userActivation;
  return !!(ua && ua.isActive && now - inputAt > ACTIVATION_MS);
}

export function holding() {
  if (!s.hold) return false;
  if (fromOutside()) s.hold = false;
  return s.hold;
}

export function playLabel(el) {
  const t = (el.getAttribute("aria-label") || el.getAttribute("title") || "") + " " + (typeof el.className === "string" ? el.className : "") + " " + (el.children.length ? "" : el.textContent || "");
  return /play|afspel|start/i.test(t) && !EXCLUDED.test(t);
}

export function playerRoot(v) {
  return deepClosest(v, '.video-js,.jwplayer,.plyr,.rmp-container,.xplayer,[class*="player" i]') || boxParent(v);
}

export function guardPlay(v) {
  const had = Object.getOwnPropertyDescriptor(v, "play");
  const base = had && typeof had.value === "function" ? had.value : null;
  const own = function () {
    if (s.v === v && holding()) {
      tell(t("direct.tell.held"));
      return Promise.resolve();
    }
    return (base || HTMLMediaElement.prototype.play).apply(this, arguments);
  };
  try {
    Object.defineProperty(v, "play", { value: own, configurable: true, writable: true, enumerable: false });
  } catch (e) {
    return () => {};
  }
  return () => {
    try {
      if (v.play !== own) return;
      if (had) Object.defineProperty(v, "play", had);
      else delete v.play;
    } catch (e) {}
  };
}

function onSiteClick(e) {
  const target = targetOf(e);
  if (!s.hold || !e.isTrusted || !s.v || inUI(target)) return;
  const root = playerRoot(s.v);
  const SEL = 'button,[role="button"],[class*="play" i],[aria-label]';
  let el = deepClosest(target, SEL);
  while (el && root && deepContains(root, el)) {
    if (playLabel(el)) {
      s.hold = false;
      return;
    }
    el = deepClosest(deepParent(el), SEL);
  }
}

const guardedOnSiteClick = safe(onSiteClick, "hold");
const guardedOnInput = safe(onInput, "hold");
export function installHold() {
  inputAt = 0;
  mediaKeyAt = 0;
  document.addEventListener("click", guardedOnSiteClick, true);
  INPUT_EVENTS.forEach((n) => window.addEventListener(n, guardedOnInput, true));
  return () => {
    document.removeEventListener("click", guardedOnSiteClick, true);
    INPUT_EVENTS.forEach((n) => window.removeEventListener(n, guardedOnInput, true));
  };
}
