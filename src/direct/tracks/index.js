import { state as s, tracks as tr, resetTracks, els } from "../state.js";
import { findTracks } from "../../shared/tracks/index.js";
import { host } from "../host.js";
import { showOsd } from "../ui/osd.js";
import { togglePopup, closePopups } from "../ui/popup.js";
import { renderTracks } from "./render.js";
import { ms } from "../../shared/timing.js";
import { t } from "../../shared/i18n.js";
import { blockedByAd } from "../video/ad.js";

const MIN = { text: 1, audio: 2 };

export function trackList(kind) {
  const src = tr[kind];
  if (!src) return [];
  let l = [];
  try {
    l = src.list() || [];
  } catch (e) {}
  return l.map((it, i) => ({ id: it.id, lang: it.lang, label: it.label || t("direct.tracks.number", { number: i + 1 }) }));
}

export function trackCur(kind) {
  const src = tr[kind];
  if (!src) return null;
  try {
    const c = src.cur();
    return c === undefined ? null : c;
  } catch (e) {
    return null;
  }
}

export function trackLabel(kind, id) {
  const it = trackList(kind).filter((x) => String(x.id) === String(id))[0];
  return it ? it.label : "";
}

export function usable(kind) {
  return trackList(kind).length >= MIN[kind];
}

export function updateTracks() {
  if (!s.v) return;
  tr.tick++;
  if (location.href !== tr.key) {
    const last = tr.last;
    resetTracks();
    tr.key = location.href;
    tr.last = last;
  }
  ["text", "audio"].forEach((kind) => {
    if (tr[kind] && !usable(kind)) tr[kind] = null;
  });
  if ((!tr.text || !tr.audio) && (tr.tick < 5 || tr.tick - Math.floor(tr.tick / 3) * 3 === 0)) {
    const found = findTracks(s.v, host.seenHls(), { text: !tr.text, audio: !tr.audio });
    ["text", "audio"].forEach((kind) => {
      if (!tr[kind] && found[kind]) {
        tr[kind] = found[kind];
        if (!usable(kind)) tr[kind] = null;
      }
    });
  }
  renderTracks();
}

function locked(kind) {
  if (blockedByAd()) return true;
  if (kind === "audio" && s.recording) {
    showOsd(t("direct.audio.locked"));
    return true;
  }
  return false;
}

export function pickTrack(kind, id) {
  if (!tr[kind] || locked(kind)) return;
  try {
    tr[kind].set(id);
  } catch (e) {}
  if (kind === "text" && id !== null) tr.last = id;
  closePopups();
  showOsd(id === null ? t("direct.captions.off.osd") : trackLabel(kind, id));
  renderTracks();
  setTimeout(renderTracks, ms(500));
}

export function toggleTrackMenu(kind) {
  if (!usable(kind) || locked(kind)) return;
  if (kind === "text") togglePopup(els.ccPop, els.cc);
  else togglePopup(els.audioPop, els.audio);
  renderTracks();
}

function preferred(list) {
  const last = list.filter((x) => String(x.id) === String(tr.last))[0];
  if (last) return last;
  const lang = String(navigator.language || "").toLowerCase().split("-")[0];
  const own = lang && list.filter((x) => String(x.lang || "").toLowerCase().split("-")[0] === lang)[0];
  return own || list[0];
}

export function toggleCaptions() {
  if (blockedByAd()) return true;
  const list = trackList("text");
  if (!list.length) return false;
  if (trackCur("text") !== null) pickTrack("text", null);
  else pickTrack("text", preferred(list).id);
  return true;
}

function describe(kind) {
  const src = tr[kind];
  if (!src) return null;
  const cur = trackCur(kind);
  return { name: src.name, list: trackList(kind).map((x) => x.label), cur: cur === null ? null : trackLabel(kind, cur) };
}

export function tracksInfo() {
  return { text: describe("text"), audio: describe("audio") };
}
