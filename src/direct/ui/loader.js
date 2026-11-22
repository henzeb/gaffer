// The spinner in the middle of the video while it buffers (SPEC §11.4).
import { state as s, els } from "../state.js";
import { el } from "../../shared/dom.js";
import { put, visibleBox } from "./bar.js";
import { clearOsd } from "./osd.js";

export function createLoader() {
  const l = document.createElement("div");
  l.id = "vu-loader";
  l.setAttribute("data-vu-for", String(s.id));
  el("i", "", null, l);
  els.loader = l;
  return l;
}

export function placeLoader() {
  const l = els.loader;
  if (!l) return;
  l.classList.toggle("mini", !s.F);
  const st = l.style;
  if (s.F || !s.v) {
    ["left", "top", "--vu-l"].forEach((p) => st.removeProperty(p));
    return;
  }
  if (!s.loading) return;
  const r = visibleBox(s.v).seen;
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  const size = Math.round(Math.max(20, Math.min(64, Math.min(w, h) * 0.18)));
  st.setProperty("--vu-l", size + "px");
  if (w < 40 || h < 40) st.setProperty("top", "-9999px", "important");
  else put(l, (r.left + r.right - size) / 2, (r.top + r.bottom - size) / 2);
}

export function showLoader(on) {
  els.loader.classList.toggle("on", on);
  if (!on) return;
  placeLoader();
  clearOsd();
}
