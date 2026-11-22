// The same level for every video (SPEC §11.15): Direct steers v.volume so that
// every video sounds as loud as the one it was switched on for.
import { state as s } from "../state.js";
import { host } from "../host.js";
import { t } from "../../shared/i18n.js";
import { showOsd } from "../ui/osd.js";
import { updateBar } from "../ui/bar.js";
import { youtubePlayer } from "../../shared/tracks/youtube.js";
import { ASSUMED, volumeFor, stepVolumeTo, statedLoudness, cleanRef } from "../../shared/loudness.js";
import { createMeter } from "./meter.js";
import { setting, store, installStore } from "./store.js";

// Smaller changes of the reference are not worth storing.
const REF_STEP = 0.5;
const OWN_SWITCH_MS = 4000;

let meter = null;
let prior = null;
let written = null;
let siteVolume = null;
let held = false;
// This video, until another source comes, sets how loud the others must be.
let reference = false;

// What YouTube states about the video, never about an ad. Only for the
// start: what is heard counts.
function stated(v) {
  if (s.ad) return null;
  try {
    const p = youtubePlayer(v);
    const r = p && p.getPlayerResponse();
    if (!r || (r.videoDetails && r.videoDetails.videoId !== p.getVideoData().video_id)) return null;
    return statedLoudness(r, typeof p.getStatsForNerds === "function" ? p.getStatsForNerds() : null);
  } catch (e) {
    return null;
  }
}

function measured() {
  return meter && !meter.young() ? meter.level() : null;
}

function loudness() {
  const m = measured();
  if (m !== null && meter.full()) return m;
  const k = stated(s.v);
  // A quiet intro must not turn a loud video up: until half a minute has been
  // heard it is not taken for softer than YouTube states.
  if (m !== null) return k === null ? m : Math.max(m, k);
  if (prior !== null) return prior;
  if (k !== null) return k;
  // A quiet start must not turn the volume up before a loud part.
  const young = meter ? meter.level() : null;
  return young === null ? ASSUMED : Math.max(young, ASSUMED);
}

// The video it was switched on for keeps its own volume and is listened to as
// long as it plays.
function learn(v) {
  if (v.paused || v.muted || document.hidden || s.ad || held) return;
  if (setting.ref === null) reference = true;
  else if (!reference) return;
  let m = measured();
  if (m === null && setting.ref === null && meter && meter.failed()) m = loudness();
  const ref = m === null ? null : cleanRef(m);
  if (ref !== null && (setting.ref === null || Math.abs(ref - setting.ref) >= REF_STEP)) store({ ref });
}

function casting(v) {
  return !!v.remote && v.remote.state !== "disconnected";
}

// Some sites mute with volume 0.
function silenced(v) {
  return v.volume === 0 && written !== 0;
}

function write(volume) {
  const v = s.v;
  if (v.volume !== written) siteVolume = v.volume;
  if (v.volume !== volume) v.volume = volume;
  written = v.volume;
}

// Above 1 when the video is too quiet.
function needed() {
  return reference || setting.ref === null ? setting.value / 100 : volumeFor(setting.value, setting.ref, loudness());
}

function wanted() {
  return Math.min(1, needed());
}

function applyNow() {
  const v = s.v;
  if (!setting.on || !v || casting(v) || silenced(v)) return;
  write(wanted());
}

export function levelTick() {
  const v = s.v;
  if (!setting.on || !v || casting(v)) return;
  if (!meter) meter = createMeter(v);
  if (!held) meter.tick(host.audio());
  if (silenced(v)) return;
  learn(v);
  // The site set the volume itself: back at once, without a slide.
  const own = v.volume === written;
  write(own && !reference ? stepVolumeTo(v.volume, wanted(), meter.young()) : wanted());
}

// For Inspect (SPEC §12.1).
export function levelInfo() {
  const v = s.v;
  const info = { on: setting.on, value: setting.value, ref: setting.ref, reference, context: host.audioState() };
  if (!setting.on || !v) return info;
  const m = measured();
  const k = stated(v);
  return Object.assign(info, {
    loudness: loudness(),
    from: m !== null ? "measured" : prior !== null ? "earlier" : k !== null ? "youtube" : "assumed",
    failed: !!(meter && meter.failed()),
    held,
    volume: written,
  });
}

export function levelOn() {
  return setting.on;
}

export function levelValue() {
  return setting.value;
}

export function setLevel(value) {
  store({ value: Math.min(100, Math.max(1, Math.round(value))) });
  applyNow();
  updateBar();
}

// Off: the video plays at the number the user sees.
function letGo() {
  const v = s.v;
  if (v && written !== null && v.volume === written) v.volume = setting.value / 100;
  stopMeter();
  written = null;
}

export function toggleLevel() {
  const v = s.v;
  if (!v) return;
  if (setting.on) {
    store({ on: false });
    letGo();
  } else {
    store({ on: true, value: Math.min(100, Math.max(1, Math.round((v.volume || 0.5) * 100))), ref: null });
    reference = false;
    applyNow();
  }
  updateBar();
  showOsd(setting.on ? t("direct.osd.levelOn", { level: setting.value }) : t("direct.osd.levelOff"));
}

export function levelTip() {
  if (!setting.on) return t("direct.level.off");
  const v = s.v;
  const numbers = { level: setting.value, volume: v ? Math.round(v.volume * 100) : 0 };
  if (meter && meter.failed()) return t("direct.level.unmeasured", numbers);
  if (setting.ref === null) return t("direct.level.listening", numbers);
  if (v && needed() > 1.1) return t("direct.level.quiet", numbers);
  return t("direct.level.on", numbers);
}

// A recording with MediaRecorder needs the capture; the loudness so far holds.
export function holdMeter(on) {
  held = on;
  if (on && meter) meter.recapture();
}

function stopMeter() {
  if (meter) meter.close();
  meter = null;
  prior = null;
  reference = false;
}

// A new source, or an ad that starts or ends. After a quality switch by Direct
// the loudness so far still holds.
export function levelNewSource() {
  const same = !s.ad && Date.now() - s.ownSwitch < OWN_SWITCH_MS;
  if (!same) reference = false;
  if (!meter) return;
  prior = same ? meter.level() : null;
  meter.reset();
}

export function levelRecapture() {
  if (meter) meter.recapture();
  applyNow();
}

export function levelAttach() {
  written = null;
  applyNow();
}

export function levelDetach() {
  stopMeter();
  if (written !== null && s.v && s.v.volume === written) s.v.volume = siteVolume;
  written = null;
}

export function installLevel() {
  return installStore(() => {
    reference = false;
    if (setting.on) applyNow();
    else letGo();
    if (s.v) updateBar();
  });
}
