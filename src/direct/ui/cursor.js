// The mouse over the video (SPEC §11.2, Idle): visible while it moves, also
// where the site hides it, and hidden together with the bars. Set inline on the
// element under the mouse, because layers of the site lie over the video and
// may be in a shadow root.
import { state as s } from "../state.js";
import { blocked } from "../host.js";
import { inUI, belongs } from "../input/routing.js";
import { outsideBox } from "../view/layer.js";
import { deepElementFromPoint } from "../../shared/deep.js";

let marked = null;

function put(el, value) {
  const st = el.style;
  if (!st) return;
  const m = { el, value, had: el.getAttribute("style"), old: st.getPropertyValue("cursor"), prio: st.getPropertyPriority("cursor") };
  st.setProperty("cursor", value, "important");
  m.now = el.getAttribute("style");
  marked = m;
}

export function freeCursor() {
  const m = marked;
  if (!m) return;
  marked = null;
  const { el } = m;
  if (el.getAttribute("style") === m.now) {
    if (m.had === null) el.removeAttribute("style");
    else el.setAttribute("style", m.had);
    return;
  }
  // The site has changed the style since then: only the cursor goes back.
  const st = el.style;
  if (st.getPropertyValue("cursor") !== m.value || st.getPropertyPriority("cursor") !== "important") return;
  if (m.old) st.setProperty("cursor", m.old, m.prio);
  else st.removeProperty("cursor");
  if (m.had === null && el.getAttribute("style") === "") el.removeAttribute("style");
}

// For code that remembers the style of an element to restore it later.
export function releaseCursorOf(el) {
  if (marked && marked.el === el) freeCursor();
}

function underMouse() {
  return deepElementFromPoint(s.mx, s.my);
}

function inside(r) {
  return s.mx >= r.left && s.mx <= r.right && s.my >= r.top && s.my <= r.bottom;
}

function onOwnVideo() {
  if (s.F) return true;
  const away = outsideBox(s.v);
  return inside(s.v.getBoundingClientRect()) || (!!away && inside(away));
}

// On every mouse move over the video or the bars.
export function showCursor(e) {
  freeCursor();
  const el = e.composedPath()[0];
  if (el && el.nodeType === 1 && getComputedStyle(el).cursor === "none") put(el, "default");
}

export function hideCursor() {
  freeCursor();
  if (!s.v || s.drag || blocked() || !onOwnVideo()) return;
  // In fullscreen the mouse may not have moved yet.
  const el = underMouse() || (s.F ? s.v : null);
  if (el && !inUI(el) && (s.F || belongs(underMouse()))) put(el, "none");
}

// On every scan: while the mouse is hidden, another element may have come under
// it.
export function keepCursor() {
  if (marked && marked.value === "none" && marked.el !== underMouse()) hideCursor();
}
