import { state as s } from "../../state.js";
import { dedupe } from "../labels.js";

function labelOf(el) {
  return el.getAttribute("label") || el.getAttribute("data-quality") || (el.getAttribute("res") || el.getAttribute("size") || el.getAttribute("data-res")) + "p";
}

export function sourcesAdapter() {
  const src = [].slice.call(s.v.querySelectorAll("source")).filter((x) => x.src && (x.getAttribute("label") || x.getAttribute("res") || x.getAttribute("size") || x.getAttribute("data-res") || x.getAttribute("data-quality")));
  if (src.length <= 1) return null;
  return {
    list() {
      return dedupe(src.map((x, i) => ({ id: i, label: labelOf(x) })));
    },
    cur() {
      for (let i = 0; i < src.length; i++) if (src[i].src === s.v.currentSrc) return i;
      return null;
    },
    set(id) {
      const x = src[id];
      if (!x) return;
      const v = s.v;
      const t = v.currentTime;
      const pa = v.paused;
      const rt = v.playbackRate;
      v.src = x.src;
      v.addEventListener("loadedmetadata", function f() {
        v.removeEventListener("loadedmetadata", f);
        try {
          v.currentTime = t;
          v.playbackRate = rt;
        } catch (e) {}
        if (!pa) {
          const pr = v.play();
          if (pr && pr.catch) pr.catch(() => {});
        }
      });
    },
  };
}
