import { state as s } from "../state.js";
import { isLive } from "./live.js";
import { showOsd } from "../ui/osd.js";
import { t } from "../../shared/i18n.js";
import { blockedByAd } from "../video/ad.js";

export function duration() {
  const v = s.v;
  if (isFinite(v.duration)) return v.duration;
  const se = v.seekable;
  return se && se.length ? se.end(se.length - 1) : 0;
}

export function skip(d) {
  const v = s.v;
  if (!v || isLive() || blockedByAd()) return;
  v.currentTime = Math.min(Math.max(0, v.currentTime + d), duration() || v.currentTime + d);
  showOsd(t("direct.osd.skip", { seconds: (d > 0 ? "+" : "−") + Math.abs(d) }));
}

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec - h * 3600) / 60);
  const c = sec - h * 3600 - m * 60;
  return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (c < 10 ? "0" : "") + c;
}
