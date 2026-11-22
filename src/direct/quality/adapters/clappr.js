import { state as s } from "../../state.js";
import { sortedList, labelFor, call } from "./common.js";
import { hlsAdapterFor } from "./hls.js";

function playbackOf(o) {
  const core = o && o.core;
  if (!core || typeof core !== "object") return null;
  return core.activePlayback || call(() => core.getCurrentPlayback && core.getCurrentPlayback()) || null;
}

export function clapprAdapterFor(o) {
  const pb = playbackOf(o);
  if (!pb || pb.el !== s.v) return null;
  if (Array.isArray(pb.levels) && pb.levels.length > 1 && "currentLevel" in pb) {
    return {
      list() {
        return sortedList(
          pb.levels.map((l, i) => {
            const lv = l.level || {};
            const id = l.id !== undefined ? l.id : i;
            return { id, h: lv.height || 0, br: lv.bitrate || 0, label: lv.height ? lv.height + "p" : l.label || labelFor(0, lv.bitrate) };
          }),
        );
      },
      cur() {
        return pb.currentLevel === -1 ? "auto" : pb.currentLevel;
      },
      set(id) {
        pb.currentLevel = id === "auto" ? -1 : id;
      },
    };
  }
  return pb._hls ? call(() => hlsAdapterFor(pb._hls)) : null;
}
