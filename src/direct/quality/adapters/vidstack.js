import { state as s } from "../../state.js";
import { sortedList, labelFor, call } from "./common.js";
import { vidstackPlayer, listOf } from "../../../shared/tracks/players.js";

// Vidstack (<media-player>): its quality list. Read-only means the provider
// picks by itself and nothing can be chosen.
export function vidstackAdapter() {
  const p = vidstackPlayer(s.v);
  const list = p && p.qualities;
  if (!list || list.readonly || typeof list.autoSelect !== "function") return null;
  const items = () => call(() => listOf(list)) || [];
  if (items().length < 2) return null;
  return {
    list() {
      return sortedList(items().map((x, i) => ({ id: i, h: x.height || 0, br: x.bitrate || 0, label: labelFor(x.height, x.bitrate) })));
    },
    cur() {
      if (list.auto) return "auto";
      const i = items().findIndex((x) => x.selected);
      return i < 0 ? null : i;
    },
    set(id) {
      if (id === "auto") return list.autoSelect();
      const x = items()[id];
      if (x) x.selected = true;
    },
  };
}
