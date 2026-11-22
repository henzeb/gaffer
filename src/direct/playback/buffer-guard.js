import { state as s } from "../state.js";
import { isLive } from "./live.js";
import { duration } from "./seek.js";
import { quietPlay } from "./play.js";
import { updateBar } from "../ui/bar.js";

function bufferedAhead() {
  const b = s.v.buffered;
  const t = s.v.currentTime;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= t + 0.25 && b.end(i) > t) return b.end(i) - t;
  }
  return 0;
}

export function guard() {
  const v = s.v;
  if (!v) return;
  if (isLive()) {
    if (s.autoP) {
      s.autoP = false;
      updateBar();
    }
    return;
  }
  const rate = v.playbackRate;
  const ah = bufferedAhead();
  const rem = duration() - v.currentTime;
  const now = Date.now();
  if (s.autoP) {
    if (!v.paused) {
      s.autoP = false;
      updateBar();
      return;
    }
    if (ah > s.bufLastAh + 0.05) {
      s.bufLastAh = ah;
      s.bufSince = now;
    }
    if (ah >= Math.min(rate * 10, rem - 0.25) || now - s.bufSince > 8000) {
      s.autoP = false;
      quietPlay(v);
      updateBar();
    }
    return;
  }
  if (v.paused || v.seeking || rate <= 1.5) return;
  if (ah < rate * 2 && rem > ah + 0.5) {
    s.autoP = true;
    s.bufSince = now;
    s.bufLastAh = ah;
    v.pause();
    updateBar();
  }
}
