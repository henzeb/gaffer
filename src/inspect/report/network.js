import { short, uniq } from "./format.js";
import { isManifestUrl } from "../../shared/net-hook.js";
import { t } from "../../shared/i18n.js";

export const STATIC_ASSET = /\.(js|css|json|png|jpe?g|gif|svg|webp|avif|woff2?)([?#]|$)/i;
export const SEGMENT = /\.(ts|m4s|m4v|m4a|mp4|aac|webm|cmfv|cmfa)([?#]|$)/i;

export function resolutionHint(u) {
  const m = u.match(/(^|[^0-9])(144|240|360|480|540|576|720|1080|1440|2160)p?([^0-9]|$)/);
  return m ? m[2] : null;
}

export function reportNetwork(L) {
  L("== " + t("inspect.report.network.title"));
  let res = [];
  try {
    res = performance.getEntriesByType("resource").map((r) => r.name);
  } catch (e) {}
  const man = uniq(res.filter(isManifestUrl));
  const seg = res.filter((u) => {
    if (STATIC_ASSET.test(u)) return false;
    return SEGMENT.test(u) || /segment|frag|range=|bytes=/i.test(u);
  });
  L(t("inspect.report.network.manifests", { n: man.length }));
  man.slice(0, 15).forEach((u) => L("  " + short(u)));
  L(t("inspect.report.network.segments", { n: seg.length }));
  uniq(seg).slice(-8).forEach((u) => L("  " + short(u)));
  const hint = {};
  seg.forEach((u) => {
    const h = resolutionHint(u);
    if (h) hint[h] = 1;
  });
  const hk = Object.keys(hint);
  L(t("inspect.report.network.hints", { list: hk.length ? hk.join(", ") : t("inspect.report.none") }));
  return man;
}
