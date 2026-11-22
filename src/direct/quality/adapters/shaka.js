import { state as s } from "../../state.js";
import { dedupe } from "../labels.js";
import { t } from "../../../shared/i18n.js";

export function shakaAdapterFor(sp) {
  if (!(typeof sp.getVariantTracks === "function" && typeof sp.getMediaElement === "function" && sp.getMediaElement() === s.v)) return null;
  const tracks = () => sp.getVariantTracks() || [];
  return {
    list() {
      const a = tracks()
        .filter((t) => t.height)
        .map((t) => ({ id: t.height, h: t.height, br: t.bandwidth || 0, label: t.height + "p" }));
      a.sort((x, y) => y.h - x.h || y.br - x.br);
      return dedupe([{ id: "auto", label: t("direct.quality.auto") }].concat(a));
    },
    cur() {
      let abr = true;
      try {
        abr = sp.getConfiguration().abr.enabled;
      } catch (e) {}
      if (abr) return "auto";
      const t = tracks().filter((t2) => t2.active)[0];
      return t ? t.height : "auto";
    },
    set(id) {
      if (id === "auto") {
        sp.configure({ abr: { enabled: true } });
        return;
      }
      sp.configure({ abr: { enabled: false } });
      const best = tracks()
        .filter((t) => t.height === id)
        .sort((a, b) => b.bandwidth - a.bandwidth)[0];
      if (best) sp.selectVariantTrack(best, true);
    },
  };
}
