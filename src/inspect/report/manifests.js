import { short } from "./format.js";
import { t } from "../../shared/i18n.js";

export function summarizeManifest(text) {
  const lines = [];
  if (text.indexOf("#EXTM3U") === 0) {
    const inf = text.split("\n").filter((l) => l.indexOf("#EXT-X-STREAM-INF") === 0);
    if (inf.length) {
      lines.push(t("inspect.manifest.hlsMaster", { n: inf.length }));
      inf.forEach((l) => {
        const r = (l.match(/RESOLUTION=(\d+x\d+)/) || [])[1];
        const b = (l.match(/BANDWIDTH=(\d+)/) || [])[1];
        const nm = (l.match(/NAME="([^"]*)"/) || [])[1];
        const c = (l.match(/CODECS="([^"]*)"/) || [])[1];
        lines.push("   " + (r || "?") + " @ " + (b ? Math.round(b / 1000) + " kbps" : "?") + (nm ? " " + t("inspect.manifest.name", { name: nm }) : "") + (c ? " " + t("inspect.manifest.codecs", { codecs: c }) : ""));
      });
    } else lines.push(t("inspect.manifest.hlsMedia"));
  } else if (text.indexOf("<MPD") >= 0) {
    const d = new DOMParser().parseFromString(text, "text/xml");
    const reps = [].slice.call(d.getElementsByTagName("Representation")).filter((r) => r.getAttribute("height"));
    lines.push(t("inspect.manifest.dash", { n: reps.length, list: reps.map((r) => r.getAttribute("height") + "p").join(", ") }));
  } else lines.push(t("inspect.manifest.unknown", { n: text.length }));
  return lines;
}

export function fetchManifestSummaries(urls) {
  return Promise.all(
    urls.map((u) =>
      fetch(u, { credentials: "include" })
        .then((r) => r.text())
        .then((body) => "  " + short(u) + "\n   " + summarizeManifest(body).join("\n   "))
        .catch((e) => "  " + short(u) + ": " + t("inspect.manifest.fetchFailed", { error: e && e.message })),
    ),
  );
}
