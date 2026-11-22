import { createOsd } from "../../shared/osd.js";
import { state, els } from "../state.js";
import { tell } from "../tell.js";
import { t } from "../../shared/i18n.js";

const GAP = 10;

let osd = null;

export function createDirectOsd() {
  osd = createOsd("vu-osd", false);
  els.osd = osd.el;
  return osd;
}

// Below the spinner if they would lie over each other.
export function clearOsd() {
  const st = els.osd.style;
  st.removeProperty("translate");
  if (!state.loading) return;
  const a = els.osd.getBoundingClientRect();
  const b = els.loader.getBoundingClientRect();
  if (a.right <= b.left || a.left >= b.right || a.bottom <= b.top - GAP || a.top >= b.bottom + GAP) return;
  st.setProperty("translate", "0 " + Math.round(b.bottom + GAP - a.top) + "px", "important");
}

export function showOsd(text) {
  osd.show(text);
  tell(t("direct.tell.message", { text }));
  clearOsd();
}
