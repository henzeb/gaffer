import { sortedList, labelFor, call, holds } from "./common.js";

export function bitmovinAdapterFor(p) {
  if (!p || typeof p.getAvailableVideoQualities !== "function" || typeof p.setVideoQuality !== "function") return null;
  if (!holds(call(() => p.getVideoElement && p.getVideoElement())) && !holds(call(() => p.getContainer && p.getContainer()))) return null;
  const qs = () => call(() => p.getAvailableVideoQualities()) || [];
  if (qs().length < 2) return null;
  let chosen = null;
  return {
    list() {
      return sortedList(qs().map((x) => ({ id: x.id, h: x.height || 0, br: x.bitrate || 0, label: x.height ? x.height + "p" : x.label || labelFor(0, x.bitrate) })));
    },
    cur() {
      if (chosen === "auto") return "auto";
      const x = call(() => p.getVideoQuality());
      return x && x.id !== undefined ? x.id : chosen;
    },
    set(id) {
      chosen = id;
      p.setVideoQuality(id);
    },
  };
}
