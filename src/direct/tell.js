// What Direct tells Inspect's monitor while it works (SPEC §12.2): an event on
// the video that nothing listens to unless Inspect monitors.
import { state as s } from "./state.js";

export function tell(text) {
  const v = s.v;
  if (!v) return;
  try {
    v.dispatchEvent(new CustomEvent("gaffer:direct", { detail: { text: String(text) } }));
  } catch (e) {}
}

// A site element by what a person would call it.
export function nameOf(el) {
  let l = "";
  try {
    l = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
  } catch (e) {}
  l = l.replace(/\s+/g, " ").trim();
  return l ? (l.length > 40 ? l.slice(0, 40) + "…" : l) : el.tagName ? el.tagName.toLowerCase() : "?";
}
