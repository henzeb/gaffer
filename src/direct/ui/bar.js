import { outsideBox, clipped } from "../view/layer.js";
import { el, button, setText, setStyle } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { state as s, els, SPEEDS } from "../state.js";
import { isLive, behindLive, goLive, BEHIND } from "../playback/live.js";
import { playPause } from "../playback/play.js";
import { skip, duration, formatTime } from "../playback/seek.js";
import { setPitch, fineSpeed, setSpeed, togglePitch } from "../playback/speed.js";
import { toggleChapters, placeChapters, renderChapter, installSeekSnap, pressing } from "../playback/chapters.js";
import { gliding, stopGlide } from "../playback/glide.js";
import { makePopup, togglePopup, closePopups, placePopup } from "./popup.js";
import { toggleMute, volumeWheel, shownVolume, setShownVolume } from "../playback/volume.js";
import { holding } from "../playback/hold.js";
import { blocked } from "../host.js";
import { siteNav } from "../playback/sitenav.js";
import { ms } from "../../shared/timing.js";
import { levelOn, levelTip, toggleLevel } from "../level/index.js";
import { toggleTrackMenu } from "../tracks/index.js";
import { siteOverlay } from "../input/routing.js";
import { freeCursor, hideCursor } from "./cursor.js";
import { placeLoader } from "./loader.js";
import { safe } from "../safe.js";
import { tell } from "../tell.js";

// Every button of Direct goes through the guard (SPEC §11.8).
export function btn(parent, text, tip, onClick, cls) {
  const b = button(parent, text, tip, safe((e) => {
    wake();
    onClick(e);
  }, "button"), cls);
  b.onmousedown = (e) => e.preventDefault();
  return b;
}

const SVG = "http://www.w3.org/2000/svg";
const SPEAKER = [
  ["", "M3 9h4l5-4v14l-5-4H3z", true],
  ["w1", "M15.5 8.5a5 5 0 0 1 0 7"],
  ["w2", "M18.5 5.5a9 9 0 0 1 0 13"],
  ["x", "M16 9.5l5 5M21 9.5l-5 5"],
];

const NOTE = [
  ["", "M9 18V6l10-2v12"],
  ["", "M9 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0z", true],
  ["", "M19 16a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0z", true],
];
const PREV_ICON = [["", "M6 5v14"], ["", "M19 5.5L9 12l10 6.5z", true]];
const NEXT_ICON = [["", "M18 5v14"], ["", "M5 5.5L15 12 5 18.5z", true]];
const LEVEL = [["", "M4 12h16"], ["", "M8 4v4M8 16v4M16 4v4M16 16v4"]];
const UP = [["", "M5 15l7-7 7 7"]];
const DOWN = [["", "M5 9l7 7 7-7"]];
export const CORNERS = [["", "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"]];

export function icon(parent, paths) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  paths.forEach(([cls, d, fill]) => {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    if (cls) p.setAttribute("class", cls);
    p.setAttribute("fill", fill ? "currentColor" : "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", fill ? "1" : "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
  });
  parent.appendChild(svg);
}

export function createBar() {
  const bar = document.createElement("div");
  bar.id = "video-ultimate-bar";
  bar.setAttribute("data-vu-for", String(s.id));
  els.bar = bar;
  return bar;
}

export function buildRows() {
  const bar = els.bar;
  els.qrow = el("div", "qrow", null, els.top);
  const mr = el("div", "mainrow", null, bar);
  els.mainrow = mr;
  els.volBtn = btn(mr, "", t("direct.volume"), () => togglePopup(volPop, els.volBtn), "vb volbtn");
  icon(els.volBtn, SPEAKER);
  els.volBtn.dataset.v = "high";
  const volPop = makePopup("vpop");
  els.volVal = el("div", "pval", "100", volPop);
  const vol = el("input", "vol", null, volPop);
  vol.type = "range";
  vol.min = "0";
  vol.max = "100";
  vol.step = "1";
  vol.value = "100";
  vol.title = t("direct.volume.slider");
  vol.oninput = safe(() => {
    if (!s.v) return;
    setShownVolume(vol.value / 100);
    wake();
  }, "volume");
  const onVolumeWheel = safe(volumeWheel, "volume");
  vol.addEventListener("wheel", onVolumeWheel, { passive: false });
  els.volBtn.addEventListener("wheel", onVolumeWheel, { passive: false });
  els.vol = vol;
  els.muteBtn = btn(volPop, "", t("direct.mute"), () => toggleMute(), "vb");
  icon(els.muteBtn, SPEAKER);
  els.muteBtn.dataset.v = "high";
  els.level = btn(volPop, "", t("direct.level.off"), () => toggleLevel(), "lev");
  icon(els.level, LEVEL);
  els.prev = btn(mr, "", t("direct.nav.prevSite"), () => siteNav("prev"), "nav");
  icon(els.prev, PREV_ICON);
  btn(mr, "−10", t("direct.skip.back"), () => skip(-10), "nl skip");
  els.play = btn(mr, "", t("direct.play"), () => playPause(), "pp");
  els.play.appendChild(document.createElement("i"));
  els.play.dataset.s = "play";
  btn(mr, "+10", t("direct.skip.forward"), () => skip(10), "nl skip");
  els.next = btn(mr, "", t("direct.nav.nextSite"), () => siteNav("next"), "nav");
  icon(els.next, NEXT_ICON);
  const lv = btn(mr, t("direct.live"), t("direct.live.back"), () => goLive(), "lv");
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.textContent = "●";
  lv.insertBefore(dot, lv.firstChild);
  els.lag = el("span", "lag", "", lv);
  els.live = lv;
  els.chap = btn(mr, "", t("direct.chapters"), () => toggleChapters(), "chap gone");
  els.chapPop = makePopup("tpop hpop");
  el("div", "brk", null, mr);
  els.cur = el("span", "nl tm cur", "0:00", mr);
  const sk = el("input", "nl seek", null, mr);
  sk.type = "range";
  sk.min = "0";
  sk.max = "1000";
  sk.step = "1";
  sk.value = "0";
  els.seek = sk;
  installSeekSnap(sk);
  els.chaps = el("div", "chaps", null, mr);
  els.dur = el("span", "nl tm dur", "0:00", mr);
  els.cc = btn(mr, "CC", t("direct.captions"), () => toggleTrackMenu("text"), "cc gone");
  els.ccPop = makePopup("tpop cpop");
  els.audio = btn(mr, t("direct.audio"), t("direct.audio.tip"), () => toggleTrackMenu("audio"), "aud gone");
  els.audioPop = makePopup("tpop apop");
  els.speed = btn(mr, "1.00×", t("direct.speed"), () => togglePopup(spdPop, els.speed), "spd nl");
  const spdPop = makePopup("spop");
  icon(btn(spdPop, "", t("direct.speed.faster"), () => fineSpeed(1), "fn"), UP);
  const spr = el("input", "spdr", null, spdPop);
  spr.type = "range";
  spr.min = "0";
  spr.max = String(SPEEDS.length - 1);
  spr.step = "1";
  spr.value = String(SPEEDS.indexOf(1));
  spr.title = t("direct.speed.slider");
  spr.oninput = safe(() => {
    setSpeed(SPEEDS[+spr.value]);
    wake();
  }, "speed");
  const onSpeedWheel = safe((e) => {
    e.preventDefault();
    e.stopPropagation();
    fineSpeed(e.deltaY < 0 ? 1 : -1);
  }, "speed");
  spr.addEventListener("wheel", onSpeedWheel, { passive: false });
  els.speedRange = spr;
  icon(btn(spdPop, "", t("direct.speed.slower"), () => fineSpeed(-1), "fn"), DOWN);
  els.pitch = btn(spdPop, "", t("direct.pitch"), () => togglePitch(), "on pt");
  icon(els.pitch, NOTE);
  els.speed.addEventListener("wheel", onSpeedWheel, { passive: false });

  sk.oninput = safe(() => {
    if (!s.v || s.ad) return;
    s.seeking = true;
    if (pressing()) return;
    stopGlide();
    const t = (sk.value / 1000) * duration();
    els.cur.textContent = formatTime(t);
    s.v.currentTime = t;
    wake();
  }, "seek");
  sk.onchange = safe(() => {
    s.seeking = false;
    updateBar();
  }, "seek");
  const onEnter = safe(enter, "bar");
  const onLeave = safe(leave, "bar");
  els.top.onmouseenter = onEnter;
  els.top.onmouseleave = onLeave;
  bar.onmouseenter = onEnter;
  bar.onmouseleave = onLeave;
}

export function updateBar() {
  const v = s.v;
  if (!v) return;
  if (!v.paused && holding()) {
    tell(t("direct.tell.held"));
    v.pause();
    return;
  }
  const live = isLive();
  // Hidden bars wait for the times and the seek bar; showing them catches up.
  const awake = !barsHidden();
  els.bar.classList.toggle("live", live);
  if (live) {
    const late = behindLive();
    els.live.classList.toggle("behind", v.paused || late > BEHIND);
    if (awake) setText(els.lag, late > BEHIND ? "−" + formatTime(late) : "");
  }
  setData(els.play, "s", s.autoP || (s.loading && !v.paused) ? "wait" : v.paused ? "play" : "pause");
  setText(els.speed, v.playbackRate.toFixed(2) + "×");
  renderChapter();
  els.pitch.classList.toggle("on", s.pitchOn);
  const sound = shownVolume();
  const loud = sound === 0 ? "mute" : sound < 0.5 ? "low" : "high";
  setData(els.volBtn, "v", loud);
  setData(els.muteBtn, "v", loud);
  setText(els.volVal, String(Math.round(sound * 100)));
  els.level.classList.toggle("on", levelOn());
  setTitle(els.level, levelTip());
  setTitle(els.vol, levelOn() ? t("direct.level.slider") : t("direct.volume.slider"));
  let si = 0;
  for (let j = 0; j < SPEEDS.length; j++) if (Math.abs(SPEEDS[j] - v.playbackRate) < Math.abs(SPEEDS[si] - v.playbackRate)) si = j;
  setValue(els.speedRange, String(si));
  setValue(els.vol, String(Math.round(sound * 100)));
  if (v.preservesPitch !== void 0 && v.preservesPitch !== s.pitchOn) setPitch();
  if (!awake) return;
  const d = duration();
  setText(els.dur, formatTime(d));
  if (!s.seeking && !gliding()) {
    setText(els.cur, formatTime(v.currentTime));
    setValue(els.seek, d ? String(Math.round((v.currentTime / d) * 1000)) : "0");
  }
}

function setData(e, key, value) {
  if (e.dataset[key] !== value) e.dataset[key] = value;
}

function setTitle(e, title) {
  if (e.title !== title) e.title = title;
}

// Custom properties without priority, as before.
function setVar(st, key, value) {
  if (st.getPropertyValue(key) !== value) st.setProperty(key, value);
}

function setValue(e, value) {
  if (e.value !== value) e.value = value;
}

function barsHidden() {
  return els.bar.classList.contains("v-ui-hide") || els.bar.classList.contains("v-ui-off");
}

// Shows the bars that were hidden, brought up to date first.
function unhide() {
  const was = barsHidden();
  els.top.classList.remove("v-ui-hide");
  els.bar.classList.remove("v-ui-hide");
  if (was && !barsHidden()) updateBar();
}

const PLACED = ["left", "top", "width"];

// Relative to the container, which also moves along when the page scrolls.
export function put(el, left, top) {
  const st = el.style;
  ["left", "top"].forEach((k) => {
    if (!st.getPropertyValue(k)) st.setProperty(k, "0px", "important");
  });
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const move = (k, d) => {
    if (Math.abs(d) > 0.5) st.setProperty(k, parseFloat(st.getPropertyValue(k)) + d + "px", "important");
  };
  move("left", left - r.left);
  move("top", top - r.top);
}

// The part of the video's box, without its pan and zoom, that the player shows,
// and the height of the whole box.
export function visibleBox(v) {
  const away = outsideBox(v);
  const tr = away || v.getBoundingClientRect();
  const cx = tr.left + tr.width / 2 - (away ? 0 : s.X);
  const cy = tr.top + tr.height / 2 - (away ? 0 : s.Y);
  const w = away ? away.width : v.offsetWidth;
  const h = away ? away.height : v.offsetHeight;
  const whole = { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
  return { seen: away ? whole : clipped(v, whole), height: h };
}

export function place() {
  const bar = els.bar;
  const bs = bar.style;
  const ts = els.top.style;
  const v = s.v;
  if (els.mainrow) setVar(bs, "--vu-s", Math.max(0, bar.offsetHeight - els.mainrow.offsetTop) + "px");
  if (els.toprow) setVar(ts, "--vu-s", els.toprow.offsetTop + els.toprow.offsetHeight + "px");
  placeChapters();
  placeLoader();
  const ri = els.recInd ? els.recInd.style : null;
  if (v && blocked()) {
    setStyle(bs, "top", "-9999px");
    setStyle(ts, "top", "-9999px");
    if (ri) setStyle(ri, "top", "-9999px");
    return;
  }
  if (s.F || !v) {
    ["w1", "w2", "w3"].forEach((c) => bar.classList.remove(c));
    els.top.classList.remove("w2", "p1");
    ts.removeProperty("--vu-help-h");
    ts.removeProperty("--vu-help-w");
    PLACED.forEach((p) => {
      bs.removeProperty(p);
      ts.removeProperty(p);
    });
    if (ri) {
      ri.removeProperty("left");
      ri.removeProperty("top");
    }
    return;
  }
  const { seen: r, height: h0 } = visibleBox(v);
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  const l = Math.max(0, r.left);
  const rt = Math.min(iw, r.right);
  const b = Math.min(ih, r.bottom);
  const w = rt - l;
  bar.classList.toggle("w1", w < 520);
  bar.classList.toggle("w2", w < 400);
  bar.classList.toggle("w3", w < 320);
  els.top.classList.toggle("w2", w < 400);
  els.top.classList.toggle("p1", w < 480);
  const bh = bar.offsetHeight || 50;
  const seen = b - Math.max(0, r.top);
  if (w < 160 || r.bottom - r.top < 40 || r.bottom < 40 || r.top > ih - 40 || seen < Math.min(h0, ih) / 2) {
    setStyle(bs, "top", "-9999px");
    setStyle(ts, "top", "-9999px");
    if (ri) setStyle(ri, "top", "-9999px");
    return;
  }
  if (ri) put(els.recInd, l + 8, r.top + 8);
  setStyle(bs, "width", w + "px");
  put(bar, l, r.bottom - bh);
  setStyle(ts, "width", w + "px");
  put(els.top, l, Math.min(r.top, r.bottom - bh - 40));
  setVar(ts, "--vu-help-h", Math.max(160, b - Math.max(0, r.top) - bh - 64) + "px");
  setVar(ts, "--vu-help-w", Math.max(240, Math.min(760, w - 24)) + "px");
  placePopup();
}

export function show(on) {
  const was = barsHidden();
  els.top.classList.toggle("v-ui-off", !on);
  els.bar.classList.toggle("v-ui-off", !on);
  els.bar.classList.toggle("mini", !s.F);
  els.top.classList.toggle("mini", !s.F);
  if (els.recInd) els.recInd.classList.toggle("mini", !s.F);
  if (on) {
    wake();
    place();
    if (was && !barsHidden()) updateBar();
  }
}

function hideBars() {
  closePopups();
  if (els.recInd) els.recInd.classList.add("idle");
  els.top.classList.add("v-ui-hide");
  els.bar.classList.add("v-ui-hide");
}

function stepAside() {
  if (!siteOverlay()) return false;
  s.over = false;
  clearTimeout(s.idleTimer);
  closePopups();
  if (els.recInd) els.recInd.classList.remove("idle");
  els.top.classList.add("v-ui-hide");
  els.bar.classList.add("v-ui-hide");
  freeCursor();
  return true;
}

export function checkOverlay() {
  if (!els.bar.classList.contains("v-ui-hide")) stepAside();
}

function enter() {
  if (stepAside()) return;
  s.over = true;
  if (els.recInd) els.recInd.classList.remove("idle");
  unhide();
  freeCursor();
  clearTimeout(s.idleTimer);
}

export function hideNow() {
  if (s.F) return;
  s.over = false;
  clearTimeout(s.idleTimer);
  freeCursor();
  hideBars();
}

function leave() {
  s.over = false;
  wake();
}

export function wake() {
  if (stepAside()) return;
  if (s.over) return;
  if (els.recInd) els.recInd.classList.remove("idle");
  unhide();
  freeCursor();
  clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => {
    if (s.over) return;
    hideBars();
    hideCursor();
  }, ms(2000));
}
