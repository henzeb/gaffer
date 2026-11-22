import { findTracks } from "../../shared/tracks/index.js";
import { t } from "../../shared/i18n.js";

function line(src) {
  let list = [];
  let cur = null;
  try {
    list = src.list() || [];
  } catch (e) {}
  try {
    cur = src.cur();
  } catch (e) {}
  return list.map((x, i) => (x.label || "#" + (i + 1)) + (x.lang ? " [" + x.lang + "]" : "") + (cur !== null && cur !== undefined && String(cur) === String(x.id) ? " " + t("inspect.report.tracks.active") : "")).join(", ");
}

export function reportTracks(L, vids) {
  L("== " + t("inspect.report.tracks.title"));
  vids.forEach((v, i) => {
    let found = { text: null, audio: null };
    try {
      found = findTracks(v);
    } catch (e) {}
    if (!found.text && !found.audio) {
      L(t("inspect.report.tracks.none", { index: i }));
      return;
    }
    if (found.text) L(t("inspect.report.tracks.text", { index: i, source: found.text.name, list: line(found.text) }));
    if (found.audio) L(t("inspect.report.tracks.audio", { index: i, source: found.audio.name, list: line(found.audio) }));
  });
}
