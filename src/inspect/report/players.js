import { short, uniq } from "./format.js";
import { LIBRARIES, PLAYER_ROOTS, PLAYER_SCRIPT } from "../../shared/player-detect.js";
import { t } from "../../shared/i18n.js";

function videojsPlayers(L) {
  try {
    if (!(window.videojs && window.videojs.getPlayers)) return;
    const vps = window.videojs.getPlayers();
    Object.keys(vps).forEach((k) => {
      const p = vps[k];
      if (!p) return;
      let info = t("inspect.report.players.videojs", { name: k });
      try {
        const cs = p.currentSources() || [];
        info += "\n   currentSources (" + cs.length + "): " + cs.map((x) => JSON.stringify({ src: short(x.src || ""), type: x.type, label: x.label, res: x.res })).join(", ");
      } catch (e) {}
      try {
        info += "\n   currentSrc: " + short(p.currentSrc());
      } catch (e) {}
      try {
        if (typeof p.qualityLevels === "function") info += "\n   qualityLevels: " + p.qualityLevels().length;
      } catch (e) {}
      try {
        const pl = Object.keys(p.activePlugins_ || {});
        if (pl.length) info += "\n   plugins: " + pl.join(", ");
      } catch (e) {}
      L(info);
    });
  } catch (e) {}
}

export function reportPlayers(L, vids) {
  L("== " + t("inspect.report.players.title"));
  const found = [];
  for (const g in LIBRARIES) {
    try {
      if (window[g]) found.push(LIBRARIES[g] + " (window." + g + ")");
    } catch (e) {}
  }
  L(found.length ? found.join(", ") : t("inspect.report.players.none"));
  videojsPlayers(L);
  vids.forEach((v, i) => {
    const root = (v.closest && v.closest(PLAYER_ROOTS)) || v.parentElement;
    if (!root) return;
    const items = [].slice
      .call(root.querySelectorAll('li,[role="menuitemradio"],[role="menuitem"],button,[data-quality],[data-res]'))
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((x) => x && x.length < 24 && /^(\d{3,4}\s?p|4k|8k|uhd|fhd|qhd|hd|sd|sq|hq|lq|auto|origin\w*|source|quality|kwaliteit|resolution)/i.test(x));
    if (items.length) L(t("inspect.report.players.menu", { index: i, list: items.slice(0, 20).join(" | ") }));
  });
  const scripts = [].slice.call(document.scripts).map((x) => x.src).filter((x) => x && PLAYER_SCRIPT.test(x));
  if (scripts.length) {
    L(t("inspect.report.players.scripts"));
    uniq(scripts).slice(0, 15).forEach((x) => L("  " + short(x)));
  }
}
