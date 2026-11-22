import { raise } from "../../shared/dom.js";
import { topLayer, updateLayer } from "./layer.js";
import { state as s, els } from "../state.js";
import { host } from "../host.js";
import { render } from "./transform.js";
import { place, wake } from "../ui/bar.js";
import { tell } from "../tell.js";
import { t } from "../../shared/i18n.js";

function restoreScroll() {
  window.scrollTo(s.sx, s.sy);
}

function raiseOverlays() {
  topLayer(true);
}

export function setFull(on) {
  const v = s.v;
  if (!v) on = false;
  if (on && !s.F) {
    s.keep = { X: s.X, Y: s.Y, S: s.S };
    s.sx = window.scrollX;
    s.sy = window.scrollY;
  } else if (!on && s.F && s.keep) {
    s.X = s.keep.X;
    s.Y = s.keep.Y;
    s.S = s.keep.S;
    s.keep = null;
    setTimeout(restoreScroll, 0);
    setTimeout(restoreScroll, 150);
    setTimeout(restoreScroll, 400);
  }
  if (on !== s.F) tell(on ? t("direct.tell.fullscreenOn") : t("direct.tell.fullscreenOff"));
  s.F = on;
  host.setFull(on);
  els.bar.classList.toggle("mini", !on);
  els.top.classList.toggle("mini", !on);
  if (els.recInd) els.recInd.classList.toggle("mini", !on);
  document.documentElement.classList.toggle("vu-full", on);
  if (on) {
    const de = document.documentElement;
    if (!document.fullscreenElement && de.requestFullscreen) {
      try {
        const fp = de.requestFullscreen();
        if (fp && fp.catch) fp.catch(() => {});
      } catch (e) {}
    }
  } else if (document.fullscreenElement && document.exitFullscreen) {
    try {
      const xp = document.exitFullscreen();
      if (xp && xp.catch) xp.catch(() => {});
    } catch (e) {}
  }
  if (v) {
    if (on) {
      if (s.pop) {
        v.setAttribute("popover", "manual");
        render();
        try {
          v.showPopover();
        } catch (e) {}
        raiseOverlays();
      } else render();
    } else {
      if (s.pop && v.hasAttribute("popover")) {
        try {
          v.hidePopover();
        } catch (e) {}
        v.removeAttribute("popover");
      }
      topLayer(false);
      render();
    }
  } else render();
  updateLayer();
  place();
  wake();
}

export function onFullscreenChange() {
  if (document.fullscreenElement) {
    if (s.F && s.pop && s.v) {
      raise(s.v);
      raiseOverlays();
    }
    render();
  } else if (s.F) setFull(false);
}

export function toggleFull() {
  setFull(!s.F);
}
