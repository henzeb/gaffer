import { el } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { state as s, els } from "../state.js";
import { toggleFull } from "../view/fullscreen.js";
import { toggleQuality } from "../quality/index.js";
import { castClick } from "../playback/cast.js";
import { toggleTools } from "./panel.js";
import { btn, icon, CORNERS } from "./bar.js";
import { buildRecord } from "../record/index.js";
import { share } from "../playback/share.js";

const SHARE = [
  ["", "M18 8.5a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM6 15a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM18 21.5a3 3 0 1 0 0-6a3 3 0 1 0 0 6z"],
  ["", "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"],
];

export function createTop() {
  const top = document.createElement("div");
  top.id = "video-ultimate-top";
  top.setAttribute("data-vu-for", String(s.id));
  els.top = top;
  return top;
}

export function buildTop() {
  const tr = el("div", "toprow", null, els.top);
  els.toprow = tr;
  els.tools = btn(tr, "⚙︎", t("direct.top.tools"), () => toggleTools(), "ico");
  els.q = btn(tr, t("direct.quality.auto"), t("direct.top.quality"), () => toggleQuality(), "q gone");
  buildRecord(tr, btn);
  els.cast = btn(tr, t("direct.cast"), t("direct.cast.tip"), () => castClick(), "cast gone");
  el("div", "sp", null, tr);
  els.share = btn(tr, "", t("direct.share.tip"), (e) => share(e), "share");
  icon(els.share, SHARE);
  els.fs = btn(tr, "", t("direct.fullscreen"), () => toggleFull(), "fs");
  icon(els.fs, CORNERS);
}
