// The seek bar slides to a chosen chapter (SPEC §11.14); the video itself is
// already there.
import { state as s, els } from "../state.js";
import { updateBar } from "../ui/bar.js";
import { ms } from "../../shared/timing.js";
import { duration, formatTime } from "./seek.js";

const GLIDE_MS = 300;

let frame = 0;

export function gliding() {
  return !!frame;
}

export function stopGlide() {
  cancelAnimationFrame(frame);
  frame = 0;
}

function still() {
  return document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function glideTo(time) {
  stopGlide();
  const v = s.v;
  const d = duration();
  if (!d || still()) {
    updateBar();
    return;
  }
  const from = +els.seek.value;
  const to = (time / d) * 1000;
  const t0 = performance.now();
  // Another seek, for example ±10, takes over. Playing on does not.
  const away = () => Math.abs(v.currentTime - time) > 2 + Math.abs(v.playbackRate);
  const step = (now) => {
    frame = 0;
    const p = Math.max(0, now - t0) / ms(GLIDE_MS);
    if (p >= 1 || s.v !== v || s.seeking || away()) {
      updateBar();
      return;
    }
    const value = from + (to - from) * (1 - Math.pow(1 - p, 3));
    els.seek.value = String(Math.round(value));
    els.cur.textContent = formatTime((value / 1000) * d);
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}
