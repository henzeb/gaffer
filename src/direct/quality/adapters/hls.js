import { state as s } from "../../state.js";
import { dedupe } from "../labels.js";
import { host } from "../../host.js";
import { t } from "../../../shared/i18n.js";

export function hookHls() {
  host.hookHls();
}

export function seenHls() {
  return host.seenHls();
}

export function hlsAdapterFor(c) {
  if (!(c.media === s.v && Array.isArray(c.levels) && c.levels.length > 1 && "currentLevel" in c)) return null;
  return {
    list() {
      const a = c.levels.map((l, i) => ({ id: i, h: l.height || 0, br: l.bitrate || 0, label: l.height ? l.height + "p" : Math.round((l.bitrate || 0) / 1000) + "k" }));
      a.sort((x, y) => y.h - x.h || y.br - x.br);
      return dedupe([{ id: "auto", label: t("direct.quality.auto") }].concat(a));
    },
    cur() {
      return c.autoLevelEnabled ? "auto" : c.currentLevel;
    },
    set(id) {
      c.currentLevel = id === "auto" ? -1 : id;
    },
  };
}
