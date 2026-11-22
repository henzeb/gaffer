// Ads on YouTube (SPEC §11.13): Direct also controls the ad, but locks
// everything that could skip it or run through it.
import { state as s, els } from "../state.js";
import { t } from "../../shared/i18n.js";
import { ADS, hideSiteControls } from "./site-controls.js";
import { updateBar } from "../ui/bar.js";
import { closePopups } from "../ui/popup.js";
import { showOsd } from "../ui/osd.js";
import { renderNav } from "../playback/sitenav.js";
import { renderQuality } from "../quality/render.js";
import { updateLayer } from "../view/layer.js";
import { updateChapters } from "../playback/chapters.js";
import { levelNewSource } from "../level/index.js";
import { stopGlide } from "../playback/glide.js";
import { setSpeed } from "../playback/speed.js";
import { tell } from "../tell.js";
import { safe } from "../safe.js";

const AD_CLASSES = ["ad-showing", "ad-interrupting"];
// A source change this soon after the ad starts or ends belongs to the ad.
export const AD_SETTLE_MS = 3000;

let observed = null;
let observer = null;
const tips = new Map();

function playerOf(v) {
  try {
    return v ? v.closest(".html5-video-player") : null;
  } catch (e) {
    return null;
  }
}

function adShowing(p) {
  return !!p && AD_CLASSES.some((c) => p.classList.contains(c));
}

// The controls that could get past the ad, or that belong to the video. The
// functions behind them check blockedByAd() too, for shortcuts and the wheel.
function lockUi(on) {
  if (!els.bar || !els.seek) return;
  const skips = [].slice.call(els.bar.querySelectorAll(".skip"));
  [els.prev, els.next, els.seek, els.speed, els.cc, els.audio].concat(skips).forEach((b) => {
    if (on) tips.set(b, b.title);
    b.disabled = on;
    b.title = on ? t("direct.ad.unavailable") : tips.get(b) || "";
  });
}

function setAd(on) {
  const v = s.v;
  s.ad = on;
  tell(on ? t("direct.tell.adStart") : t("direct.tell.adEnd"));
  s.adAt = Date.now();
  if (on) {
    // A new source resets playbackRate before the class change arrives, so
    // the speed comes from the last rate change outside an ad.
    s.adRate = s.userRate;
    s.adRestore = null;
    closePopups();
    s.seeking = false;
    stopGlide();
    s.autoP = false;
    if (v && v.playbackRate !== 1) setSpeed(1, { force: true, quiet: true });
  } else {
    if (s.adRate !== 1) {
      s.adRestore = s.adRate;
      setSpeed(s.adRate, { force: true, quiet: true });
    }
    s.adRate = 1;
  }
  levelNewSource();
  hideSiteControls();
  updateChapters(true);
  lockUi(on);
  updateLayer();
  renderNav();
  renderQuality();
  updateBar();
}

function check() {
  const on = adShowing(observed);
  if (on !== s.ad) setAd(on);
}

// Called on attach and on every scan: follows the player around the current
// video and its class, also when the video moves to another player.
export function followAds() {
  const p = playerOf(s.v);
  if (p !== observed) {
    if (observer) observer.disconnect();
    observer = null;
    observed = p;
    if (p) {
      observer = new MutationObserver(safe(check, "ads"));
      observer.observe(p, { attributes: true, attributeFilter: ["class"] });
    }
  }
  check();
}

// Follows the user's speed outside ads (ratechange on the video).
export function noteRate() {
  if (!s.ad && s.v) s.userRate = s.v.playbackRate;
}

// The speed after the ad: a new source resets playbackRate, so it is set
// again when the video's metadata arrives shortly after the ad.
export function afterAdMetadata() {
  if (s.ad || s.adRestore === null) return;
  if (Date.now() - s.adAt < AD_SETTLE_MS) setSpeed(s.adRestore, { force: true, quiet: true });
  s.adRestore = null;
}

export function adBusy() {
  return s.ad || Date.now() - s.adAt < AD_SETTLE_MS;
}

// True (with a message) while an ad plays, for everything that is locked then.
export function blockedByAd() {
  if (s.ad) showOsd(t("direct.ad.unavailable"));
  return s.ad;
}

// Pressing on an ad element, such as the Skip button, is not a drag.
export function onAd(target) {
  return s.ad && !!target && !!target.closest && !!target.closest(ADS);
}

export function installAds() {
  return () => {
    if (observer) observer.disconnect();
    observer = null;
    observed = null;
    s.ad = false;
  };
}
