import { state as s } from "../state.js";
import { releaseCursorOf } from "../ui/cursor.js";
import { SHARE_PANELS, SHARE_OPENED, sharing } from "../playback/share.js";
import { safe } from "../safe.js";
import { boxParent, deepChildren, deepContains, deepParent, deepQueryAll, shadowOf } from "../../shared/deep.js";

const SKIP = { VIDEO: 1, STYLE: 1, SCRIPT: 1, LINK: 1 };

export function restoreStyle(el, st) {
  try {
    el.getAttribute("style");
    if (st === null) el.removeAttribute("style");
    else el.setAttribute("style", st);
  } catch (e) {}
}

export function hideInline(c) {
  try {
    c.style.setProperty("visibility", "hidden", "important");
    c.style.setProperty("opacity", "0", "important");
    c.style.setProperty("pointer-events", "none", "important");
  } catch (e) {}
}

const POSTER_NAME = /poster|thumb|preview|cover/i;
const KNOWN_CONTROLS = [
  ".ytp-chrome-top", ".ytp-chrome-bottom", ".ytp-gradient-top", ".ytp-gradient-bottom", ".ytp-large-play-button", ".ytp-pause-overlay",
  ".ytp-watermark", ".ytp-ce-element", ".ytp-paid-content-overlay", ".ytp-cards-button", ".ytp-cards-teaser", ".ytp-show-cards-title", ".ytp-impression-link", ".ytp-ad-persistent-progress-bar-container",
  ".vjs-control-bar", ".vjs-big-play-button", ".vjs-title-bar",
  ".jw-controls", ".jw-display", ".jw-title", ".jw-controlbar",
  ".plyr__controls", ".plyr__control--overlaid",
  ".shaka-controls-container", ".shaka-play-button-container",
  ".fp-ui", ".fp-controls", ".media-control", ".bmpui-ui-controlbar", ".bmpui-ui-hugeplaybacktogglebutton",
  ".rmp-control-bar", ".rmp-overlay-button",
  ".playkit-top-bar", ".playkit-bottom-bar", ".playkit-pre-playback-play-overlay", ".playkit-overlay-action",
  "theoplayer-control-bar",
  ".vp-controls", ".vp-title", ".vp-sidedock",
  ".mejs__controls", ".mejs__overlay-play", ".mejs-controls", ".mejs-overlay-play",
  ".fluid_controls_container", ".fluid_initial_play",
  "media-control-bar", "media-controller [slot=\"centered-chrome\"]", "media-gesture-receiver",
  ".vds-controls", ".vds-gesture",
  ".w-bottom-bar", ".w-big-play-button",
  // Their spinners: Direct shows its own (SPEC §11.4).
  ".ytp-spinner", ".vjs-loading-spinner", ".shaka-spinner-container", ".bmpui-ui-buffering-overlay", ".spinner-three-bounce",
  ".playkit-spinner", ".vp-spin", ".mejs__overlay-loading", ".mejs-overlay-loading", "media-loading-indicator", ".vds-buffering-indicator",
].join(",");
// The bars of those controls: Direct's own bars go into the same element.
export const CONTROL_BARS = ".ytp-chrome-bottom,.vjs-control-bar,.jw-controls,.jw-controlbar,.plyr__controls,.shaka-controls-container,.fp-controls,.media-control,.bmpui-ui-controlbar,.rmp-control-bar,.playkit-bottom-bar,theoplayer-control-bar,.vp-controls,.mejs__controls,.mejs-controls,.fluid_controls_container,media-control-bar,.vds-controls,.w-bottom-bar";
// Controls of the YouTube embed that lie next to the player instead of in it.
export const EMBED_CONTROLS = ".ytPlayerControlsContainerHost";
export const END_SCREENS = ".ytp-fullscreen-grid,.html5-endscreen,.ytp-endscreen-content,.ytp-autonav-endscreen,.ytp-autonav-endscreen-countdown-overlay,.videowall-endscreen,.vjs-endscreen,.jw-related,.jw-plugin-related,.plyr__poster-end";
// YouTube's ad elements, such as the Skip button: never hidden (SPEC §11.13).
export const ADS = '.video-ads,.ytp-ad-module,[class*="ytp-ad-"],[class*="ytp-skip-ad"]';
export const CAPTIONS = '.ytp-caption-window-container,.caption-window,.vjs-text-track-display,.jw-captions,.plyr__captions,.shaka-text-container,.bmpui-ui-subtitle-overlay,[class*="caption" i],[class*="subtitle" i]';

// Windows of the site over the video and the ads of other players than YouTube
// (SPEC §11.2): never hidden while they are shown, so their buttons (Accept,
// Skip) stay usable. Players keep such elements ready but hidden; those do not
// count. Only the element itself and what lies in it count: a video that plays
// in a dialog (a lightbox) still gets its own controls hidden.
const DIALOGS = 'dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],[popover]';
// videojs-ima and Shaka keep their ad container over the whole video, also
// without an ad: videojs-ima marks it hide-ad-container then, Shaka's is empty.
export const AD_LAYERS = '.ima-ad-container:not(.hide-ad-container),iframe[src*="imasdk.googleapis.com"],.shaka-client-side-ad-container:not(:empty),.shaka-server-side-ad-container:not(:empty),.shaka-skip-ad-container,.bmpui-ad-controlbar,.bmpui-ui-button-ad-skip';
const KEEP = DIALOGS + "," + AD_LAYERS;

// Shown by the site itself: Direct hides with visibility and opacity, which
// leave the box as it is, so the box tells. Up to c, an element the site made
// transparent or invisible itself does not count; opacity is not inherited, and
// visibility only tells where Direct did not hide the parent.
function shownLayer(e, c) {
  try {
    if (e.closest("[data-vu-for]") || e.getAttribute("aria-hidden") === "true") return false;
    if (e.matches("[popover]") && !e.matches(":popover-open")) return false;
    const r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    for (let n = e; n; n = n.parentElement) {
      if (!n.hasAttribute("data-vu-hide")) {
        const cs = getComputedStyle(n);
        if (+cs.opacity === 0) return false;
        const p = n.parentElement;
        if (cs.visibility === "hidden" && (!p || p.hasAttribute("data-vu-hide") ? false : getComputedStyle(p).visibility !== "hidden")) return false;
      }
      if (n === c) break;
    }
    return true;
  } catch (x) {
    return false;
  }
}

// Thresholds of the site without a dialog role (SPEC §11.2): an age check, a
// consent or paywall screen, a "tap to unmute" layer. Recognition patterns for
// texts of sites, not texts of Direct.
const GATE_WORDS = /(^|[^a-z0-9])(18\+|age|leeftijd|geboortedatum|birth|consent|cookies?|toestemming|accept|subscribe|abonneer|log ?in|sign ?in|inloggen|unmute|tap to unmute|geluid aan)([^a-z0-9]|$)/i;
const GATE_BUTTONS = 'button,a[href],[role="button"],input[type="submit"],input[type="button"]';
const GATE_TEXT = 300;
const GATE_MAX_BUTTONS = 3;
const GATE_AREA = 0.25;
const SLIDERS = '[role="slider"],[role="progressbar"],input[type="range"],progress';

// vb: the video's box. A threshold lies over the middle of the video and covers
// at least a quarter of it, has one to three buttons that are shown, no slider,
// and a text with one of the words.
function gate(c, vb) {
  if (!vb || !shownLayer(c, c)) return false;
  const r = c.getBoundingClientRect();
  const cx = (vb.L + vb.R) / 2;
  const cy = (vb.T + vb.B) / 2;
  if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return false;
  const w = Math.max(0, Math.min(vb.R, r.right) - Math.max(vb.L, r.left));
  const h = Math.max(0, Math.min(vb.B, r.bottom) - Math.max(vb.T, r.top));
  if (w * h < GATE_AREA * (vb.R - vb.L) * (vb.B - vb.T)) return false;
  if (c.querySelector(SLIDERS)) return false;
  const buttons = [].slice.call(c.querySelectorAll(GATE_BUTTONS)).filter((b) => shownLayer(b, c));
  if (!buttons.length || buttons.length > GATE_MAX_BUTTONS) return false;
  return GATE_WORDS.test((c.textContent || "").replace(/\s+/g, " ").slice(0, GATE_TEXT));
}

// vb: the video's box, for thresholds; without it only windows and ads count.
export function keepShown(c, vb) {
  try {
    const list = (c.matches(KEEP) ? [c] : []).concat([].slice.call(c.querySelectorAll(KEEP)));
    if (list.some((e) => shownLayer(e, c))) return true;
    if (gate(c, vb)) {
      // So the bars step aside for it too (input/routing.js).
      if (!c.hasAttribute("data-vu-gate")) c.setAttribute("data-vu-gate", String(s.id));
      return true;
    }
    return false;
  } catch (x) {
    return false;
  }
}

// The video's box without Direct's pan and zoom.
function videoBox(v) {
  const r = v.getBoundingClientRect();
  const cx = r.left + r.width / 2 - s.X;
  const cy = r.top + r.height / 2 - s.Y;
  const w = v.offsetWidth / 2;
  const h = v.offsetHeight / 2;
  return { L: cx - w, R: cx + w, T: cy - h, B: cy + h };
}

function clearGates() {
  [].forEach.call(document.querySelectorAll('[data-vu-gate="' + s.id + '"]'), (c) => c.removeAttribute("data-vu-gate"));
  watchedRoots().forEach((r) => [].forEach.call(r.querySelectorAll('[data-vu-gate="' + s.id + '"]'), (c) => c.removeAttribute("data-vu-gate")));
}

function matches(c, sel) {
  try {
    return c.matches(sel) || !!(c.closest && c.closest(sel)) || !!(c.querySelector && c.querySelector(sel));
  } catch (e) {
    return false;
  }
}

// The share panel the site opens after Direct clicked its share button (SPEC
// §11.4) stays, also on later looks.
function shareOpened(c) {
  try {
    if (!c.matches(SHARE_PANELS) && !(sharing() && (c.matches(SHARE_OPENED) || c.querySelector(SHARE_OPENED)))) return false;
  } catch (e) {
    return false;
  }
  c.setAttribute("data-vu-share", String(s.id));
  return true;
}

function isCaptions(c) {
  try {
    return c.matches(CAPTIONS);
  } catch (e) {
    return false;
  }
}

export function notStarted(v) {
  return !!v && v.paused && (!v.played || v.played.length === 0);
}

function covers(r, box) {
  const area = r.width * r.height;
  if (!area) return false;
  const w = Math.max(0, Math.min(box.R, r.right) - Math.max(box.L, r.left));
  const h = Math.max(0, Math.min(box.B, r.bottom) - Math.max(box.T, r.top));
  return (w * h) / ((box.R - box.L) * (box.B - box.T) || 1) >= 0.6;
}

function looksLikePoster(c, box) {
  if (c.tagName === "IMG" || c.tagName === "PICTURE") return true;
  if (POSTER_NAME.test((c.id || "") + " " + (typeof c.className === "string" ? c.className : ""))) return true;
  let bg = "";
  try {
    bg = getComputedStyle(c).backgroundImage || "";
  } catch (e) {}
  if (/url\(/.test(bg)) return true;
  const imgs = c.querySelectorAll ? c.querySelectorAll("img,picture") : [];
  for (let i = 0; i < imgs.length; i++) if (covers(imgs[i].getBoundingClientRect(), box)) return true;
  return false;
}

// Hidden while the video plays. Before the start they hold the image and the
// play button, during an ad possibly the Skip button, at the end the end screen.
// A marker with a style rule (ui/styles.js), because the site keeps writing the
// inline display of this element itself.
function embedControls(v, hide) {
  const mine = String(s.id);
  if (hide && v.closest(".html5-video-player")) {
    [].forEach.call(document.querySelectorAll(EMBED_CONTROLS), (c) => {
      if (!c.hasAttribute("data-vu-embed") && !c.contains(v)) c.setAttribute("data-vu-embed", mine);
    });
    return;
  }
  [].forEach.call(document.querySelectorAll('[data-vu-embed="' + mine + '"]'), (c) => c.removeAttribute("data-vu-embed"));
}

// Some sites make the video itself transparent and show it, sharpened, in a
// canvas over it (TikTok). Direct hides that layer, so the video must show.
function showPicture(v, box) {
  const drawn = !notStarted(v) && s.hidden.some((h) => !h.poster && h.el.isConnected && [h.el].concat([].slice.call(h.el.querySelectorAll("canvas"))).some((c) => c.tagName === "CANVAS" && covers(c.getBoundingClientRect(), box)));
  if (drawn !== v.hasAttribute("data-vu-picture")) v.toggleAttribute("data-vu-picture", drawn);
}

export function hideEmbedControls() {
  const v = s.v;
  if (v) embedControls(v, !(notStarted(v) || s.ad || v.ended));
}

// Some players mount their controls again on every mouse-over (NOS). They are
// hidden as soon as they are added, before they are drawn, not on the next scan.
let watched = [];
let watcher = null;

function added(list) {
  if (!s.v || s.F) return;
  for (let i = 0; i < list.length; i++) {
    const nodes = list[i].addedNodes;
    for (let j = 0; j < nodes.length; j++) {
      const n = nodes[j];
      if (n.nodeType === 1 && !n.hasAttribute("data-vu-for") && !/^(vu-|video-ultimate)/.test(n.id || "") && !(n.closest && n.closest("[data-vu-for]"))) {
        hideSiteControls();
        return;
      }
    }
  }
}

// The shadow roots under an element: a subtree observer does not look into them.
function shadowsUnder(root) {
  const out = [];
  const visit = (r) => {
    const own = r.nodeType === 1 ? shadowOf(r) : null;
    if (own) {
      out.push(own);
      visit(own);
    }
    const all = r.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const sr = shadowOf(all[i]);
      if (sr) {
        out.push(sr);
        visit(sr);
      }
    }
  };
  visit(root);
  return out;
}

function watchedRoots() {
  return watched.filter((r) => r.nodeType === 11);
}

function watch(root) {
  const list = root ? [root].concat(shadowsUnder(root)) : [];
  if (list.length === watched.length && list.every((x, i) => x === watched[i])) return;
  if (watcher) watcher.disconnect();
  watched = list;
  watcher = null;
  if (!list.length || typeof MutationObserver !== "function") return;
  watcher = new MutationObserver(safe(added, "site controls"));
  list.forEach((r) => watcher.observe(r, { childList: true, subtree: true }));
}

export function hideSiteControls() {
  const v = s.v;
  if (!v) return;
  const waiting = notStarted(v);
  hideEmbedControls();
  // Thresholds are looked for again on every pass; in fullscreen the video lies
  // above them anyway.
  clearGates();
  const vb = s.F ? null : videoBox(v);
  // What the site took out of the page is let go, as it was: some players add
  // their controls again on every mouse-over, and the list would only grow.
  // A dialog, an ad or a threshold that appears in something Direct hid
  // earlier: that comes back, until it is gone again.
  s.hidden = s.hidden.filter((h) => {
    if (h.el.isConnected && (h.poster || !keepShown(h.el, vb))) return true;
    h.el.removeAttribute("data-vu-hide");
    h.el.removeAttribute("data-vu-poster");
    restoreStyle(h.el, h.st);
    return false;
  });
  s.hidden.forEach((h) => {
    if (h.poster && waiting) return;
    if (h.poster && !h.el.hasAttribute("data-vu-hide")) h.el.setAttribute("data-vu-hide", "");
    if (h.el.style.getPropertyValue("visibility") !== "hidden") hideInline(h.el);
  });
  if (v.controls) {
    v.controls = false;
    s.nativeControls = true;
  }
  if (s.F) return;
  const tr0 = v.getBoundingClientRect();
  const vcx = tr0.left + tr0.width / 2 - s.X;
  const vcy = tr0.top + tr0.height / 2 - s.Y;
  const vw2 = v.offsetWidth / 2;
  const vh2 = v.offsetHeight / 2;
  const VL = vcx - vw2;
  const VR = vcx + vw2;
  const VT = vcy - vh2;
  const VB = vcy + vh2;
  const chain = [];
  let a = v;
  let box = { L: VL, R: VR, T: VT, B: VB };
  while (deepParent(a) && deepParent(a) !== document.body && deepParent(a) !== document.documentElement) {
    const pa = deepParent(a);
    if (pa.offsetWidth <= v.offsetWidth * 1.3 + 100 && pa.offsetHeight <= v.offsetHeight * 1.3 + 150) {
      chain.push(pa);
      a = pa;
    } else break;
  }
  const top = chain.filter((x) => x.localName !== "slot").pop();
  if (top) {
    const pr = top.getBoundingClientRect();
    if (pr.width * pr.height > 0 && (VB <= pr.top || VT >= pr.bottom || VR <= pr.left || VL >= pr.right)) box = { L: pr.left, R: pr.right, T: pr.top, B: pr.bottom };
  }
  const handled = (c) => c.hasAttribute("data-vu-hide") || c.hasAttribute("data-vu-poster") || c.hasAttribute("data-vu-share");
  const hide = (c) => {
    releaseCursorOf(c);
    c.setAttribute("data-vu-hide", "");
    s.hidden.push({ el: c, st: c.getAttribute("style"), poster: false });
    hideInline(c);
  };
  function consider(c, dep) {
    if (c.hasAttribute("data-vu-for") || /^(vu-|video-ultimate)/.test(c.id || "")) return;
    if (handled(c) || isCaptions(c) || matches(c, END_SCREENS) || matches(c, ADS) || keepShown(c, vb)) return;
    if (SKIP[c.tagName]) return;
    if (deepContains(c, v) || (c.querySelector && c.querySelector("video"))) return;
    const cr = c.getBoundingClientRect();
    const ca = cr.width * cr.height;
    if (!ca) {
      if (dep < 3) deepChildren(c).forEach((k) => consider(k, dep + 1));
      return;
    }
    const iw2 = Math.max(0, Math.min(box.R, cr.right) - Math.max(box.L, cr.left));
    const ih2 = Math.max(0, Math.min(box.B, cr.bottom) - Math.max(box.T, cr.top));
    if ((iw2 * ih2) / ca < 0.6) return;
    if (shareOpened(c)) return;
    releaseCursorOf(c);
    const poster = waiting && looksLikePoster(c, box);
    c.setAttribute(poster ? "data-vu-poster" : "data-vu-hide", poster ? String(s.id) : "");
    s.hidden.push({ el: c, st: c.getAttribute("style"), poster });
    if (!poster) hideInline(c);
    else [].forEach.call(c.querySelectorAll('button,[role="button"]'), (b) => { if (!handled(b)) hide(b); });
  }
  showPicture(v, box);
  const root = top || boxParent(v);
  watch(root);
  if (v.ended) return;
  if (root) {
    deepQueryAll(root, KNOWN_CONTROLS).forEach((c) => {
      if (!handled(c) && !keepShown(c) && !deepContains(c, v) && !(c.querySelector && c.querySelector("video"))) hide(c);
    });
  }
  chain.forEach((pa2) => {
    deepChildren(pa2).forEach((c) => {
      if (c === v || chain.indexOf(c) >= 0 || handled(c)) return;
      if (SKIP[c.tagName]) return;
      if (deepContains(c, v) || (c.querySelector && c.querySelector("video"))) return;
      consider(c, 0);
    });
  });
  showPicture(v, box);
}

export function showSiteControls() {
  clearGates();
  watch(null);
  if (s.v) {
    embedControls(s.v, false);
    s.v.removeAttribute("data-vu-picture");
  }
  s.hidden.forEach((h) => {
    const c = h.el;
    c.removeAttribute("data-vu-hide");
    c.removeAttribute("data-vu-poster");
    restoreStyle(c, h.st);
  });
  s.hidden = [];
  [].forEach.call(document.querySelectorAll('[data-vu-share="' + s.id + '"]'), (c) => c.removeAttribute("data-vu-share"));
  if (s.nativeControls && s.v) s.v.controls = true;
  s.nativeControls = false;
}
