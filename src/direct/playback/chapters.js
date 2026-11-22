import { el, setStyle } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { findChapters, unloadedChapters } from "../../shared/chapters.js";
import { host } from "../host.js";
import { state as s, els } from "../state.js";
import { btn, wake } from "../ui/bar.js";
import { togglePopup, closePopups, placePopup } from "../ui/popup.js";
import { showOsd } from "../ui/osd.js";
import { blockedByAd } from "../video/ad.js";
import { isLive } from "./live.js";
import { duration, formatTime } from "./seek.js";
import { glideTo, stopGlide } from "./glide.js";
import { safe } from "../safe.js";

// The seek bar catches clicks this far beyond the ends of its line.
const PAD = 4;
// Half the width of Chrome's slider thumb, plus that margin: the thumb's centre
// never gets closer to the ends of the seek bar than this.
const THUMB = 8 + PAD;
// A click this close to a mark goes to the chapter, up to a third of the way to
// the next mark; moving further makes it a drag.
const SNAP = 8;
const DRAG = 3;

let source = null;
let href = "";
let turnedOn = [];
let list = [];
let sig = "[]";
let shown = null;
let press = null;
// Scans since the last look without a source: looking costs a walk over window.
let looks = 0;

function at(time) {
  let cur = null;
  for (const c of list) if (c.start <= time + 0.25) cur = c;
  return cur;
}

function renderMenu() {
  const box = els.chapPop;
  while (box.firstChild) box.removeChild(box.firstChild);
  const cur = at(s.v.currentTime);
  list.forEach((c) => btn(box, formatTime(c.start) + "  " + c.title, t("direct.chapters.go", { title: c.title }), () => jump(c), c === cur ? "on" : ""));
  placePopup();
  const on = box.querySelector(".on");
  if (on) box.scrollTop = on.offsetTop - box.clientHeight / 2;
}

function jump(c) {
  if (!s.v || blockedByAd()) return;
  s.v.currentTime = c.start;
  closePopups();
  wake();
  renderChapter();
  glideTo(c.start);
  showOsd(c.title || formatTime(c.start));
}

export function toggleChapters() {
  if (!list.length) return;
  togglePopup(els.chapPop, els.chap);
  if (els.chapPop.classList.contains("open")) renderMenu();
}

// The marks lie over the seek bar, where the thumb stands at that time.
export function placeChapters() {
  const box = els.chaps;
  if (!box || !list.length || !s.v) return;
  const k = els.seek;
  const w = k.offsetWidth;
  if (!duration() || !w) return;
  const st = box.style;
  setStyle(st, "left", k.offsetLeft + "px");
  setStyle(st, "top", k.offsetTop + k.offsetHeight / 2 + "px");
  [].forEach.call(box.children, (m, i) => {
    setStyle(m.style, "left", left(list[i + 1], w) + "px");
  });
}

// The name of the current chapter, on every time update.
export function renderChapter() {
  if (!els.chap || !list.length) return;
  const c = at(s.v.currentTime);
  const title = c ? c.title : "";
  if (title === shown) return;
  shown = title;
  els.chap.textContent = title;
}

// A found source stays until it has no chapters any more. Without one, Direct
// looks again on the first scans, then every third scan, and at once when the
// video starts playing, its duration changes or an ad ends (force): an embedded
// player often gets its chapters after the start.
function read(force) {
  if (location.href !== href) {
    href = location.href;
    source = null;
    looks = 0;
  }
  const l = source ? source.list() : [];
  if (l.length) return l;
  looks++;
  if (!force && looks > 5 && looks - Math.floor(looks / 3) * 3 !== 0) return [];
  // A chapter track that is off has no cues; hidden loads it without showing.
  unloadedChapters(s.v, host.seenHls()).forEach((t) => {
    t.mode = "hidden";
    turnedOn.push(t);
  });
  source = findChapters(s.v, host.seenHls());
  return source ? source.list() : [];
}

// For Inspect (SPEC §12.1): the source and how many chapters are shown.
export function chaptersInfo() {
  return { source: source ? source.name : null, count: list.length };
}

export function resetChapters() {
  turnedOn.forEach((t) => {
    try {
      if (t.mode === "hidden") t.mode = "disabled";
    } catch (e) {}
  });
  turnedOn = [];
  source = null;
  looks = 0;
  press = null;
  stopGlide();
}

// force: from an event of the video or the end of an ad, not from the scan.
export function updateChapters(force) {
  if (!els.chap || !s.v) return;
  const d = duration();
  const next = s.ad || isLive() || !d ? [] : read(!!force).filter((c) => c.start < d);
  const l = next.length > 1 ? next : [];
  const k = JSON.stringify(l);
  if (k !== sig) {
    sig = k;
    list = l;
    shown = null;
    if (els.chapPop.classList.contains("open")) closePopups();
    els.seek.title = "";
    els.chap.classList.toggle("gone", !list.length);
    while (els.chaps.firstChild) els.chaps.removeChild(els.chaps.firstChild);
    list.slice(1).forEach(() => el("i", "", null, els.chaps));
  }
  renderChapter();
  placeChapters();
}

function left(c, width) {
  return THUMB + (c.start / duration()) * (width - 2 * THUMB);
}

// The chapter whose mark lies at x. The first one has no mark, but the start of
// the seek bar works the same way.
function near(x) {
  const r = els.seek.getBoundingClientRect();
  if (!list.length || s.ad || !r.width || !duration()) return -1;
  const pos = list.map((c) => r.left + left(c, r.width));
  let i = 0;
  pos.forEach((p, k) => {
    if (Math.abs(p - x) < Math.abs(pos[i] - x)) i = k;
  });
  const other = x < pos[i] ? (i ? pos[i - 1] : -Infinity) : i < pos.length - 1 ? pos[i + 1] : r.right - PAD;
  return Math.abs(pos[i] - x) <= Math.min(SNAP, Math.abs(other - pos[i]) / 3) ? i : -1;
}

function light(i) {
  [].forEach.call(els.chaps.children, (m, k) => m.classList.toggle("near", k + 1 === i));
}

// The mark or the chapter under the mouse, as the tooltip of the seek bar.
function seekTip(e) {
  if (!list.length || s.ad) return;
  const i = near(e.clientX);
  light(i);
  const r = els.seek.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (e.clientX - r.left - THUMB) / (r.width - 2 * THUMB || 1)));
  const time = i < 0 ? p * duration() : list[i].start;
  const c = i < 0 ? at(time) : list[i];
  els.seek.title = formatTime(time) + (c && c.title ? " · " + c.title : "");
}

// A press on a mark waits: released there it goes to the chapter, moved it is a
// normal drag of the seek bar.
export function pressing() {
  return !!press;
}

export function installSeekSnap(sk) {
  sk.onmousemove = safe(seekTip, "chapters");
  sk.onmouseleave = safe(() => light(-1), "chapters");
  sk.onpointerdown = safe((e) => {
    stopGlide();
    const i = e.isTrusted && e.button === 0 ? near(e.clientX) : -1;
    press = i < 0 ? null : { x: e.clientX, c: list[i] };
  }, "chapters");
  sk.onpointermove = safe((e) => {
    if (press && Math.abs(e.clientX - press.x) > DRAG) press = null;
  }, "chapters");
  sk.onpointerup = safe(() => {
    const p = press;
    press = null;
    if (!p) return;
    s.seeking = false;
    jump(p.c);
  }, "chapters");
  sk.onpointercancel = safe(() => {
    press = null;
  }, "chapters");
}
