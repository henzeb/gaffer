import { state as s } from "../../state.js";
import { sortedList, labelFor, call } from "./common.js";

function player() {
  const K = window.KalturaPlayer;
  if (!K || typeof K.getPlayers !== "function") return null;
  const ps = call(() => K.getPlayers()) || {};
  for (const k in ps) {
    const p = ps[k];
    if (p && typeof p.getVideoElement === "function" && call(() => p.getVideoElement()) === s.v) return p;
  }
  return null;
}

export function kalturaAdapter() {
  const p = player();
  if (!p || typeof p.getTracks !== "function" || typeof p.selectTrack !== "function") return null;
  const type = (p.Track && p.Track.VIDEO) || "video";
  const tracks = () => call(() => p.getTracks(type)) || [];
  if (tracks().length < 2) return null;
  return {
    list() {
      return sortedList(tracks().map((t, i) => ({ id: t.index !== undefined ? t.index : i, h: t.height || 0, br: t.bandwidth || 0, label: t.height ? t.height + "p" : t.label || labelFor(0, t.bandwidth) })));
    },
    cur() {
      if (call(() => p.isAdaptiveBitrateEnabled())) return "auto";
      const l = tracks();
      const i = l.findIndex((x) => x.active);
      return i < 0 ? null : l[i].index !== undefined ? l[i].index : i;
    },
    set(id) {
      if (id === "auto") {
        p.enableAdaptiveBitrate();
        return;
      }
      const t = tracks().filter((x, i) => String(x.index !== undefined ? x.index : i) === String(id))[0];
      if (t) p.selectTrack(t);
    },
  };
}
