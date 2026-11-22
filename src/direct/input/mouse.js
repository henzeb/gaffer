import { state as s, els } from "../state.js";
import { onAd } from "../video/ad.js";
import { inUI, ownUI, overVideo, onVideo, belongs, interactive } from "./routing.js";
import { showCursor } from "../ui/cursor.js";
import { hasSource, clickSitePlay, quietPlay, wantRepeated } from "../playback/play.js";
import { pan, render } from "../view/transform.js";
import { toggleFull } from "../view/fullscreen.js";
import { wake, hideNow } from "../ui/bar.js";
import { anyOpen, closeAll } from "../ui/open.js";
import { safe } from "../safe.js";
import { targetOf, deepContains } from "../../shared/deep.js";

function recentDownPaused() {
  return s.downPaused !== null && Date.now() - s.downAt < 1500 ? s.downPaused : s.v.paused;
}

function onMouseMove(e) {
  if (!e.isTrusted) return;
  s.mx = e.clientX;
  s.my = e.clientY;
  const t = targetOf(e);
  const over = s.F || overVideo(e.clientX, e.clientY);
  const inside = s.F || (over && belongs(t)) || els.top.contains(t) || els.bar.contains(t);
  if (inside) wake();
  else if (!s.drag) hideNow();
  if (inside || over) showCursor(e);
  const dg = s.drag;
  if (dg) {
    const dx = e.clientX - dg.x;
    const dy = e.clientY - dg.y;
    if (!dg.moved && Math.abs(dx) + Math.abs(dy) > 3) dg.moved = true;
    if (dg.moved) {
      dg.x = e.clientX;
      dg.y = e.clientY;
      pan(dx, dy);
    }
  }
}

function onMouseDown(e) {
  const t = targetOf(e);
  if (!s.v || !e.isTrusted || e.button !== 0 || inUI(t) || onAd(t) || !hasSource()) return;
  if ((s.F && deepContains(t, s.v)) || (!s.F && overVideo(e.clientX, e.clientY) && belongs(t) && !interactive(t))) {
    s.drag = { x: e.clientX, y: e.clientY, moved: false, paused: recentDownPaused() };
    e.preventDefault();
    render();
  }
}

function onMouseUp() {
  if (s.drag) {
    if (s.drag.moved) {
      s.noClick = true;
      wantRepeated(!s.drag.paused);
    }
    s.drag = null;
    render();
  }
}

function onPointerUp(e) {
  if (s.drag && s.drag.moved) e.stopImmediatePropagation();
}

// A press on the bars that ends over the video is not a click on the video.
let downOnUI = false;
// A click on the video while something of Direct is open only closes it.
// Dragging the video (pan) leaves the panel open.
let closing = false;

function onPointerDown(e) {
  if (e.isTrusted) {
    downOnUI = ownUI(targetOf(e));
    closing = onVideo(e) && anyOpen();
  }
  if (hasSource() && onVideo(e)) {
    s.downPaused = s.v.paused;
    s.downAt = Date.now();
  }
}

function onClick(e) {
  if (!e.isTrusted) return;
  const fromUI = downOnUI && e.detail > 0;
  downOnUI = false;
  if (fromUI && !inUI(targetOf(e))) {
    s.noClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (closing && !s.noClick) {
    closing = false;
    if (onVideo(e)) {
      closeAll();
      e.preventDefault();
      e.stopImmediatePropagation();
      s.downPaused = null;
      wake();
      return;
    }
  }
  if (!hasSource()) {
    s.noClick = false;
    if (onVideo(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!clickSitePlay()) quietPlay(s.v);
    }
    return;
  }
  if (s.noClick) {
    s.noClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (onVideo(e)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const was = recentDownPaused();
    s.downPaused = null;
    wantRepeated(was);
    wake();
  }
}

function onDoubleClick(e) {
  if (e.isTrusted && onVideo(e)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleFull();
  }
}

function onLeaveWindow(e) {
  if (!e.relatedTarget) hideNow();
}

const guardedOnLeaveWindow = safe(onLeaveWindow, "mouse");
const guardedOnMouseMove = safe(onMouseMove, "mouse");
const guardedOnMouseDown = safe(onMouseDown, "mouse");
const guardedOnMouseUp = safe(onMouseUp, "mouse");
const guardedOnPointerDown = safe(onPointerDown, "mouse");
const guardedOnPointerUp = safe(onPointerUp, "mouse");
const guardedOnClick = safe(onClick, "mouse");
const guardedOnDoubleClick = safe(onDoubleClick, "mouse");
export function installMouse() {
  document.addEventListener("mouseout", guardedOnLeaveWindow, true);
  document.addEventListener("mousemove", guardedOnMouseMove, true);
  window.addEventListener("mousedown", guardedOnMouseDown, true);
  document.addEventListener("mouseup", guardedOnMouseUp, true);
  window.addEventListener("pointerdown", guardedOnPointerDown, true);
  window.addEventListener("pointerup", guardedOnPointerUp, true);
  window.addEventListener("click", guardedOnClick, true);
  window.addEventListener("dblclick", guardedOnDoubleClick, true);
  return () => {
    document.removeEventListener("mouseout", guardedOnLeaveWindow, true);
    document.removeEventListener("mousemove", guardedOnMouseMove, true);
    window.removeEventListener("mousedown", guardedOnMouseDown, true);
    document.removeEventListener("mouseup", guardedOnMouseUp, true);
    window.removeEventListener("pointerdown", guardedOnPointerDown, true);
    window.removeEventListener("pointerup", guardedOnPointerUp, true);
    window.removeEventListener("click", guardedOnClick, true);
    window.removeEventListener("dblclick", guardedOnDoubleClick, true);
  };
}
