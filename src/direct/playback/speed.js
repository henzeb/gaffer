import { state as s, SPEEDS } from "../state.js";
import { isLive } from "./live.js";
import { showOsd } from "../ui/osd.js";
import { updateBar } from "../ui/bar.js";
import { t } from "../../shared/i18n.js";
import { youtubeRates } from "../../shared/tracks/index.js";
import { blockedByAd } from "../video/ad.js";

export function setPitch() {
  const v = s.v;
  if (!v) return;
  try {
    v.preservesPitch = s.pitchOn;
    v.mozPreservesPitch = s.pitchOn;
    v.webkitPreservesPitch = s.pitchOn;
  } catch (e) {}
}

export function togglePitch() {
  s.pitchOn = !s.pitchOn;
  setPitch();
  updateBar();
  showOsd(s.pitchOn ? t("direct.osd.pitchKept") : t("direct.osd.pitchFree"));
}

export function setSpeed(r, { force = false, quiet = false } = {}) {
  const v = s.v;
  if (!v) return;
  if (!force && blockedByAd()) return;
  if (isLive() && r !== 1) return;
  r = Math.round(Math.min(10, Math.max(0.1, r)) * 100) / 100;
  const yt = youtubeRates(v);
  if (yt && yt.rates.indexOf(r) >= 0) {
    try {
      yt.set(r);
    } catch (e) {}
  }
  if (v.playbackRate !== r) v.playbackRate = r;
  setPitch();
  updateBar();
  if (!quiet) showOsd(r.toFixed(2) + "×");
}

export function fineSpeed(d) {
  if (!s.v || isLive()) return;
  setSpeed(Math.round(s.v.playbackRate * 20) / 20 + d * 0.05);
}

export function stepSpeed(dir) {
  if (!s.v || isLive()) return;
  const cur = s.v.playbackRate;
  let i = 0;
  for (let j = 0; j < SPEEDS.length; j++) {
    if (Math.abs(SPEEDS[j] - cur) < Math.abs(SPEEDS[i] - cur)) i = j;
  }
  if (dir === 0) {
    i = i + 1;
    if (i >= SPEEDS.length) i = 0;
  } else {
    i = Math.min(SPEEDS.length - 1, Math.max(0, i + dir));
  }
  setSpeed(SPEEDS[i]);
}
