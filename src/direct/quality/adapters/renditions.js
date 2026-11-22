import { state as s } from "../../state.js";
import { sortedList, labelFor } from "./common.js";
import { deepParent } from "../../../shared/deep.js";

// Media elements with the media-tracks API: Mux Player's mux-video, hls-video,
// dash-video, and what Media Chrome uses for its quality menu. videoRenditions
// with selectedIndex, −1 is automatic; on the video or on a host around it.
function listOf(el) {
  const list = el && el.videoRenditions;
  return list && typeof list.length === "number" && list.length > 1 && "selectedIndex" in list ? list : null;
}

export function renditionsAdapter() {
  let list = null;
  for (let el = s.v, i = 0; el && i < 6 && !list; el = deepParent(el), i++) list = listOf(el);
  if (!list) return null;
  const items = () => [].slice.call(list);
  return {
    list() {
      return sortedList(items().map((r, i) => ({ id: i, h: r.height || 0, br: r.bitrate || 0, label: labelFor(r.height, r.bitrate) })));
    },
    cur() {
      const i = list.selectedIndex;
      return i < 0 ? "auto" : i;
    },
    set(id) {
      list.selectedIndex = id === "auto" ? -1 : id;
    },
  };
}
