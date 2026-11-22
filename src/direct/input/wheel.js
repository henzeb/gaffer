import { state as s } from "../state.js";
import { inUI, overVideo, belongs, fillsWindow } from "./routing.js";
import { zoomAt } from "../view/transform.js";
import { showOsd } from "../ui/osd.js";
import { t } from "../../shared/i18n.js";
import { safe } from "../safe.js";
import { targetOf } from "../../shared/deep.js";

function onWheel(e) {
  const target = targetOf(e);
  if (!s.v || inUI(target)) return;
  if (s.F || ((e.ctrlKey || fillsWindow()) && overVideo(e.clientX, e.clientY) && belongs(target))) {
    e.preventDefault();
    e.stopPropagation();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    showOsd(t("direct.osd.zoom", { zoom: s.S.toFixed(1) }));
  }
}

const guardedOnWheel = safe(onWheel, "wheel");
export function installWheel() {
  window.addEventListener("wheel", guardedOnWheel, { capture: true, passive: false });
  return () => window.removeEventListener("wheel", guardedOnWheel, { capture: true });
}
