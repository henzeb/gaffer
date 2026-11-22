import { state as s } from "../../state.js";
import { sortedList } from "./common.js";

function instance() {
  const v = s.v;
  if (v.plyr) return v.plyr;
  const box = v.closest && v.closest(".plyr");
  return box && box.plyr ? box.plyr : null;
}

export function plyrAdapter() {
  const p = instance();
  const opts = p && p.options && p.options.quality && p.options.quality.options;
  if (!Array.isArray(opts) || opts.length < 2) return null;
  return {
    list() {
      return sortedList(
        p.options.quality.options.map((x) => ({ id: x, h: +x || 0, label: +x ? x + "p" : String(x) })),
        false,
      );
    },
    cur() {
      return p.quality;
    },
    set(id) {
      p.quality = id;
    },
  };
}
