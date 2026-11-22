import { state as s, els, resetView } from "../state.js";
import { place, updateBar } from "../ui/bar.js";
import { showOsd } from "../ui/osd.js";
import { t } from "../../shared/i18n.js";
import { lightFilter, renderLight } from "./light.js";
import { shadowStyle } from "./shadow-style.js";

export function normalizeRotation() {
  s.R = s.R - Math.floor(s.R / 360) * 360;
}

export function render() {
  const v = s.v;
  if (els.deg) els.deg.textContent = s.R + "°";
  if (els.zoom) els.zoom.textContent = s.S.toFixed(1) + "×";
  if (els.fs) {
    els.fs.classList.toggle("on", s.F);
    els.fs.title = s.F ? t("direct.fullscreen.exit") : t("direct.fullscreen");
  }
  if (els.flipH) els.flipH.classList.toggle("on", s.FX < 0);
  if (els.flipV) els.flipV.classList.toggle("on", s.FY < 0);
  renderLight();
  if (!v) {
    els.dyn.textContent = "";
    shadowStyle("");
    return;
  }
  const q = Math.round(s.R / 90);
  const side = q === 1 || q === 3;
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  let cw, ch, ew, eh;
  if (s.F) {
    cw = iw;
    ch = ih;
    ew = side ? ih : iw;
    eh = side ? iw : ih;
  } else {
    cw = v.offsetWidth;
    ch = v.offsetHeight;
    ew = cw;
    eh = ch;
  }
  let fit = 1;
  if (s.R && cw && ch && ew && eh) {
    const rad = (s.R * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const sn = Math.abs(Math.sin(rad));
    const bw = ew * c + eh * sn;
    const bh = ew * sn + eh * c;
    fit = Math.min(cw / bw, ch / bh);
    if (fit > 1) fit = 1;
  }
  const vw0 = v.videoWidth || ew;
  const vh0 = v.videoHeight || eh;
  if (ew && eh && cw && ch) {
    const csc = Math.min(ew / vw0, eh / vh0);
    const pw = vw0 * csc;
    const ph = vh0 * csc;
    const rd = (s.R * Math.PI) / 180;
    const cc = Math.abs(Math.cos(rd));
    const ss = Math.abs(Math.sin(rd));
    const kk = s.S * fit;
    const bw2 = kk * (pw * cc + ph * ss);
    const bh2 = kk * (pw * ss + ph * cc);
    const mxX = Math.max(0, (bw2 - cw) / 2);
    const mxY = Math.max(0, (bh2 - ch) / 2);
    s.X = Math.max(-mxX, Math.min(mxX, s.X));
    s.Y = Math.max(-mxY, Math.min(mxY, s.Y));
  }
  const r = [];
  const p = (k, val) => r.push(k + ":" + val + "!important");
  if (s.F) {
    p("position", "fixed");
    p("inset", "auto");
    p("left", "50vw");
    p("top", "50vh");
    p("margin", "0");
    p("padding", "0");
    p("border", "0");
    p("width", side ? "100vh" : "100vw");
    p("height", side ? "100vw" : "100vh");
    p("max-width", "none");
    p("max-height", "none");
    p("min-width", "0");
    p("min-height", "0");
    p("object-fit", "contain");
    p("background", "#000");
    p("z-index", "2147483646");
    p("overflow", "visible");
    p("visibility", "visible");
    p("opacity", "1");
  }
  const identity = !s.R && s.S === 1 && !s.X && !s.Y && s.FX === 1 && s.FY === 1;
  if (s.F || !identity) {
    const k = s.S * fit;
    const t = "translate(" + s.X + "px," + s.Y + "px) scale(" + s.FX + "," + s.FY + ") rotate(" + s.R + "deg) scale(" + k + ")";
    p("transform-origin", "center center");
    p("transition", "none");
    p("transform", s.F ? (side ? "translate(-50vh,-50vw) " : "translate(-50vw,-50vh) ") + t : t);
  }
  const light = lightFilter();
  if (light) p("filter", light);
  p("cursor", s.drag ? "grabbing" : "grab");
  // The picture before the start turns, zooms and gets the exposure along.
  const along = [];
  if (!identity) along.push("transform-origin:center center!important;transform:translate(" + s.X + "px," + s.Y + "px) scale(" + s.FX + "," + s.FY + ") rotate(" + s.R + "deg) scale(" + s.S * fit + ")!important");
  if (light) along.push("filter:" + light + "!important");
  const poster = !s.F && along.length ? '[data-vu-poster="' + s.id + '"]{' + along.join(";") + "}" : "";
  els.dyn.textContent = 'video[data-vu-id="' + s.id + '"]{' + r.join(";") + "}" + poster;
  shadowStyle(els.dyn.textContent);
  if (els.bar) place();
}

export function zoomAt(px, py, k) {
  if (!s.v) return;
  const r = s.v.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  if (px == null) {
    px = cx;
    py = cy;
  }
  const nS = Math.min(20, Math.max(1, s.S * k));
  if (nS === s.S) return;
  k = nS / s.S;
  s.X += (px - cx) * (1 - k);
  s.Y += (py - cy) * (1 - k);
  s.S = nS;
  render();
}

export function rotate(d) {
  s.R += d * s.FX * s.FY;
  normalizeRotation();
  render();
  showOsd(s.R + "°");
}

export function quarter() {
  s.R = s.FX * s.FY > 0 ? (Math.floor(s.R / 90) + 1) * 90 : (Math.ceil(s.R / 90) - 1) * 90;
  normalizeRotation();
  s.X = 0;
  s.Y = 0;
  render();
  showOsd(s.R + "°");
}

export function flip(horizontal) {
  if (horizontal) s.FX = -s.FX;
  else s.FY = -s.FY;
  render();
}

export function pan(dx, dy) {
  s.X += dx;
  s.Y += dy;
  render();
}

export function resetAll() {
  resetView();
  if (s.v) {
    s.v.playbackRate = 1;
    s.adRate = 1;
    s.userRate = 1;
    s.autoP = false;
  }
  render();
  updateBar();
  showOsd(t("direct.osd.reset"));
}
