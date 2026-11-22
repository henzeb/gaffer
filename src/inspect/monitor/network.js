import { short } from "../report/format.js";
import { summarizeManifest } from "../report/manifests.js";
import { SEGMENT, resolutionHint } from "../report/network.js";
import { isManifestUrl, hookManifests } from "../../shared/net-hook.js";
import { t } from "../../shared/i18n.js";

const SKIP = /\.(js|css|json|png|jpe?g|gif|svg|webp|avif|woff2?|ico)([?#]|$)/i;

export function createNetworkWatch(m) {
  const seenUrl = {};
  const segPat = {};
  let lastHint = null;

  function onResources(list) {
    list.getEntries().forEach((r) => {
      const u = r.name;
      if (SKIP.test(u)) return;
      const s = short(u);
      if (isManifestUrl(u)) {
        if (!seenUrl[s]) {
          seenUrl[s] = 1;
          m.log(t("inspect.monitor.newManifest", { url: s }));
        }
        return;
      }
      if (SEGMENT.test(u) || /segment|frag/i.test(u)) {
        let p;
        try {
          p = new URL(u).pathname.replace(/[0-9a-z]{12,}/gi, "#").replace(/\d+(p\d*)?/g, (d) => (/^(144|240|360|480|540|576|720|1080|1440|2160)(p\d*)?$/.test(d) ? d : "#"));
        } catch (x) {
          p = s;
        }
        if (!segPat[p]) {
          segPat[p] = 1;
          m.log(t("inspect.monitor.newSegmentPattern", { pattern: p }));
        }
        const hn = resolutionHint(u);
        if (hn && hn !== lastHint) {
          m.log(lastHint ? t("inspect.monitor.segments.was", { height: hn, was: lastHint }) : t("inspect.monitor.segments", { height: hn }));
          lastHint = hn;
        }
      }
    });
  }

  function onManifestBody(u, body) {
    if (!body || (body.indexOf("#EXTM3U") !== 0 && body.indexOf("<MPD") < 0)) return;
    const sm = summarizeManifest(body);
    if (sm[0] === t("inspect.manifest.hlsMedia") && seenUrl["body:" + short(u)]) return;
    const key = "body:" + short(u) + sm.join("");
    if (seenUrl[key]) return;
    seenUrl[key] = 1;
    seenUrl["body:" + short(u)] = 1;
    m.log(t("inspect.monitor.manifestBody", { url: short(u) }));
    sm.forEach((l) => m.log("   " + l));
  }

  return function install() {
    const undo = [];
    try {
      const po = new PerformanceObserver(onResources);
      po.observe({ type: "resource", buffered: false });
      undo.push(() => po.disconnect());
    } catch (x) {
      m.log(t("inspect.monitor.noNetwork"));
    }
    undo.push(hookManifests(onManifestBody));
    return () => undo.forEach((f) => f());
  };
}
