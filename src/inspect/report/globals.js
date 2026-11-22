import { globalMatches } from "../../shared/player-detect.js";
import { t } from "../../shared/i18n.js";

export function reportGlobals(L) {
  L("== " + t("inspect.report.globals.title"));
  let keys = [];
  try {
    keys = Object.keys(window);
  } catch (e) {}
  const hits = [];
  keys.forEach((k) => {
    let o;
    try {
      o = window[k];
    } catch (e) {
      return;
    }
    if (!o || (typeof o !== "object" && typeof o !== "function")) return;
    try {
      const m = globalMatches(k, o);
      if (m.length) hits.push("window." + k + ": " + m.join(", "));
    } catch (e) {}
  });
  L(hits.length ? hits.join("\n") : t("inspect.report.none"));
}
