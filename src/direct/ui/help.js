import { el } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { els } from "../state.js";
import { btn, place } from "./bar.js";

export const GROUPS = () => [
  [t("direct.help.group.playback"), [
    [[t("direct.help.key.space"), "K"], t("direct.help.playPause")],
    [["J", "L"], t("direct.help.skip")],
    [["<", ">"], t("direct.help.speedSteps")],
    [[",", "."], t("direct.help.speedFine")],
    [["P"], t("direct.help.pitch")],
    [["M"], t("direct.help.mute")],
    [["PgUp", "PgDn"], t("direct.help.volume")],
  ]],
  [t("direct.help.group.picture"), [
    [["←", "↑", "↓", "→"], t("direct.help.pan")],
    [["+", "−"], t("direct.help.zoom")],
    [["[", "]"], t("direct.help.rotate")],
    [["R"], t("direct.help.quarter")],
    [["H", "V"], t("direct.help.flip")],
    [["B", "N"], t("direct.help.light")],
    [["0"], t("direct.help.reset")],
  ]],
  [t("direct.help.group.view"), [
    [["Q"], t("direct.help.quality")],
    [["C"], t("direct.help.captions")],
    [["T"], t("direct.help.tools")],
    [["F"], t("direct.help.fullscreen")],
    [["Esc"], t("direct.help.exitFullscreen")],
  ]],
  [t("direct.help.group.mouse"), [
    [[t("direct.help.key.click")], t("direct.help.playPause")],
    [[t("direct.help.key.doubleClick")], t("direct.help.fullscreen")],
    [[t("direct.help.key.drag")], t("direct.help.panMouse")],
    [["Ctrl", t("direct.help.key.scroll")], t("direct.help.zoom")],
  ]],
];

export function buildHelp(parent) {
  const card = el("div", "help", null, parent);
  const head = el("div", "hhead", null, card);
  el("div", "htitle", t("direct.help.title"), head);
  const ver = el("div", "ver", "Gaffer Direct " + __BUILD__, head);
  ver.title = t("direct.help.version");
  btn(head, "✕", t("direct.help.close"), () => toggleHelp(false), "ico");
  const grid = el("div", "hgrid", null, card);
  GROUPS().forEach(([title, rows]) => {
    const g = el("div", "hgroup", null, grid);
    el("div", "hgtitle", title, g);
    rows.forEach(([keys, text]) => {
      const row = el("div", "hrow", null, g);
      const k = el("div", "hkeys", null, row);
      keys.forEach((key) => el("kbd", null, key, k));
      el("div", "htext", text, row);
    });
  });
  els.help = card;
  return card;
}

export function helpOpen() {
  return !!els.top && els.top.classList.contains("show-help");
}

export function toggleHelp(on) {
  const open = on === undefined ? !helpOpen() : on;
  els.top.classList.toggle("show-help", open);
  if (els.helpBtn) els.helpBtn.classList.toggle("on", open);
  place();
}
