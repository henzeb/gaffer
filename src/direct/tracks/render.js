import { state as s, tracks as tr, els } from "../state.js";
import { btn } from "../ui/bar.js";
import { placePopup, closePopups } from "../ui/popup.js";
import { trackList, trackCur, trackLabel, usable, pickTrack } from "./index.js";
import { t } from "../../shared/i18n.js";

function renderButtons() {
  const hasText = usable("text");
  const hasAudio = usable("audio");
  els.cc.classList.toggle("gone", !hasText);
  els.audio.classList.toggle("gone", !hasAudio);
  if (hasText) {
    const cur = trackCur("text");
    els.cc.classList.toggle("on", cur !== null);
    els.cc.title = cur === null ? t("direct.captions") : t("direct.captions.current", { label: trackLabel("text", cur) });
  }
  if (hasAudio) {
    const cur = trackCur("audio");
    els.audio.classList.toggle("off", s.recording);
    els.audio.title = s.recording ? t("direct.audio.locked") : cur === null ? t("direct.audio.tip") : t("direct.audio.current", { label: trackLabel("audio", cur) });
  }
  if ((!hasText && els.ccPop.classList.contains("open")) || ((!hasAudio || s.recording) && els.audioPop.classList.contains("open"))) closePopups();
}

function renderMenu(kind, box) {
  if (!box.classList.contains("open")) {
    tr.sig[kind] = "";
    return;
  }
  const list = trackList(kind);
  const cur = trackCur(kind);
  const sig = JSON.stringify([cur, list.map((x) => [x.id, x.label])]);
  if (sig === tr.sig[kind] && box.firstChild) return;
  tr.sig[kind] = sig;
  while (box.firstChild) box.removeChild(box.firstChild);
  if (kind === "text") btn(box, t("direct.captions.off"), t("direct.captions.off.tip"), () => pickTrack("text", null), cur === null ? "on" : "");
  list.forEach((x) => {
    const on = cur !== null && String(cur) === String(x.id);
    const tip = kind === "text" ? t("direct.captions.tip", { label: x.label }) : t("direct.audio.pick", { label: x.label });
    btn(box, x.label, tip, () => pickTrack(kind, x.id), on ? "on" : "");
  });
  placePopup();
}

export function renderTracks() {
  if (!els.ccPop || !els.audioPop) return;
  renderButtons();
  renderMenu("text", els.ccPop);
  renderMenu("audio", els.audioPop);
}
