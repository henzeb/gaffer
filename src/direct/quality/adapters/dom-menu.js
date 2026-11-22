import { state as s, els as ui } from "../../state.js";
import { heightOf } from "../labels.js";
import { boxParent, deepClosest } from "../../../shared/deep.js";

function playerRoot() {
  const v = s.v;
  return deepClosest(v, ".video-js,.jwplayer,.plyr,.rmp-container,.vjs-player") || boxParent(v);
}

function collect(root) {
  if (!root) return [];
  const els = [].slice.call(root.querySelectorAll('li,[role="menuitemradio"],[role="menuitem"],[data-quality],[data-res],[data-resolution]'));
  const seen = {};
  const out = [];
  els.forEach((el) => {
    if ((ui.top && ui.top.contains(el)) || (ui.bar && ui.bar.contains(el))) return;
    if (el.querySelector('li,[role="menuitemradio"],[role="menuitem"]')) return;
    const t = (el.getAttribute("data-quality") || el.getAttribute("data-res") || el.getAttribute("data-resolution") || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 24) return;
    if (!/^(\d{3,4}\s?p|4k|8k|uhd|fhd|qhd|hd|sd|sq|hq|lq|auto|origin\w*|source|bron)\b/i.test(t)) return;
    const key = t.toLowerCase();
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ el, t });
  });
  return out;
}

export function menuAdapter(rootOf) {
  const items = () => collect(rootOf());
  if (items().length < 2) return null;
  return {
    list() {
      return items()
        .map((x) => {
          return { id: x.t, label: x.t, h: /auto/i.test(x.t) ? 99999 : heightOf(x.t) };
        })
        .sort((a, b) => b.h - a.h);
    },
    cur() {
      const it = items();
      for (let i = 0; i < it.length; i++) {
        const e = it[i].el;
        if (/selected|active|checked|current/i.test(e.className || "") || e.getAttribute("aria-checked") === "true" || e.getAttribute("aria-selected") === "true") return it[i].t;
      }
      return null;
    },
    set(id) {
      const it = items();
      for (let i = 0; i < it.length; i++) {
        if (it[i].t === id) {
          try {
            it[i].el.click();
          } catch (x) {}
          return;
        }
      }
    },
  };
}

export function domMenuAdapter() {
  return menuAdapter(playerRoot);
}
