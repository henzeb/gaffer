import { state as s } from "../../state.js";
import { sortedList, labelFor, call } from "./common.js";

function abr(p) {
  const st = call(() => p.getSettings());
  const v = st && st.streaming && st.streaming.abr && st.streaming.abr.autoSwitchBitrate;
  return !v || v.video !== false;
}

function setAbr(p, on) {
  p.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: on } } } });
}

export function dashAdapterFor(p) {
  if (!p || typeof p.getVideoElement !== "function" || call(() => p.getVideoElement()) !== s.v) return null;
  const v5 = typeof p.getRepresentationsByType === "function";
  if (!v5 && typeof p.getBitrateInfoListFor !== "function") return null;
  const reps = () => call(() => (v5 ? p.getRepresentationsByType("video") : p.getBitrateInfoListFor("video"))) || [];
  if (reps().length < 2) return null;
  const idOf = (r, i) => (v5 ? (r.id !== undefined ? r.id : i) : r.qualityIndex !== undefined ? r.qualityIndex : i);
  return {
    list() {
      return sortedList(reps().map((r, i) => ({ id: idOf(r, i), h: r.height || 0, br: r.bandwidth || r.bitrate || 0, label: labelFor(r.height, r.bandwidth || r.bitrate) })));
    },
    cur() {
      if (abr(p)) return "auto";
      if (!v5) return call(() => p.getQualityFor("video"));
      const r = call(() => p.getCurrentRepresentationForType("video"));
      return r ? r.id : null;
    },
    set(id) {
      if (id === "auto") return setAbr(p, true);
      setAbr(p, false);
      if (v5) p.setRepresentationForTypeById("video", id, true);
      else p.setQualityFor("video", id, true);
    },
  };
}
