import { el } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { save } from "../../shared/storage.js";
import { state as s, quality as q, els } from "../state.js";
import { flip, rotate, quarter, zoomAt, pan, resetAll } from "../view/transform.js";
import { setBrightness, setContrast, resetLight, LIGHT_MIN, LIGHT_MAX, LIGHT_STEP } from "../view/light.js";
import { maybeMax } from "../quality/max.js";
import { closeQuality } from "../quality/index.js";
import { btn, place, icon } from "./bar.js";
import { showOsd } from "./osd.js";
import { buildHelp, toggleHelp } from "./help.js";
import { safe } from "../safe.js";

const CIRCLE = ["", "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z"];
const ZOOM_OUT = [CIRCLE, ["", "M8 12h8"]];
const ZOOM_IN = [CIRCLE, ["", "M8 12h8"], ["", "M12 8v8"]];

const group = (parent, cls) => el("div", "grp" + (cls ? " " + cls : ""), null, parent);

// A slider for brightness or contrast (SPEC §11.3).
function lightSlider(parent, tip, onInput) {
  const r = el("input", "lr", null, parent);
  r.type = "range";
  r.min = String(LIGHT_MIN);
  r.max = String(LIGHT_MAX);
  r.step = String(LIGHT_STEP);
  r.value = "100";
  r.title = tip;
  r.oninput = safe(() => onInput(+r.value), "exposure");
  return r;
}

export function buildPanel() {
  const ui = el("div", null, null, els.top);
  ui.id = "video-ultimate-ui";
  els.ui = ui;
  const mirror = group(ui);
  els.flipH = btn(mirror, "⇆", t("direct.panel.flipH"), () => flip(true));
  els.flipV = btn(mirror, "⇅", t("direct.panel.flipV"), () => flip(false));
  const turn = group(ui);
  btn(turn, "⟲", t("direct.panel.rotateLeft"), (e) => rotate(e && e.shiftKey ? -1 : -5));
  els.deg = btn(turn, "0°", t("direct.panel.quarter"), () => quarter(), "val");
  btn(turn, "⟳", t("direct.panel.rotateRight"), (e) => rotate(e && e.shiftKey ? 1 : 5));
  const zoom = group(ui);
  icon(btn(zoom, "", t("direct.panel.zoomOut"), () => zoomAt(null, null, 1 / 1.1), "zb"), ZOOM_OUT);
  els.zoom = el("div", "val zm", "1.0×", zoom);
  icon(btn(zoom, "", t("direct.panel.zoomIn"), () => zoomAt(null, null, 1.1), "zb"), ZOOM_IN);
  const move = group(ui, "move");
  btn(move, "←", t("direct.panel.panLeft"), () => pan(30, 0));
  btn(move, "↑", t("direct.panel.panUp"), () => pan(0, 30));
  btn(move, "↓", t("direct.panel.panDown"), () => pan(0, -30));
  btn(move, "→", t("direct.panel.panRight"), () => pan(-30, 0));
  const light = group(ui, "light");
  el("span", "lt", "☀", light).title = t("direct.panel.brightness");
  els.bright = lightSlider(light, t("direct.panel.brightness"), setBrightness);
  els.brightVal = el("span", "lv", "100", light);
  el("span", "lt", "◐", light).title = t("direct.panel.contrast");
  els.contrast = lightSlider(light, t("direct.panel.contrast"), setContrast);
  els.contrastVal = el("span", "lv", "100", light);
  btn(light, "↺", t("direct.panel.light.reset"), () => resetLight());
  const opts = group(ui, "plain");
  const maxBtn = btn(opts, t("direct.panel.max"), t("direct.panel.max.tip"), () => {
    if (s.recording) {
      showOsd(t("direct.quality.locked"));
      return;
    }
    q.maxOn = !q.maxOn;
    save("vu-max", q.maxOn ? "1" : "0");
    maxBtn.classList.toggle("on", q.maxOn);
    showOsd(q.maxOn ? t("direct.osd.maxOn") : t("direct.osd.maxOff"));
    if (q.maxOn) {
      q.maxDone = false;
      q.user = false;
      maybeMax();
    }
  }, "txt" + (q.maxOn ? " on" : ""));
  btn(opts, t("direct.panel.reset"), t("direct.panel.reset.tip"), () => resetAll(), "txt");
  const end = group(ui, "plain end");
  els.helpBtn = btn(end, "?", t("direct.help.title"), () => toggleHelp());
  buildHelp(els.top);
}

// The panel and the quality list are never open together (SPEC §11.2).
export function toggleTools(on = !els.top.classList.contains("tools")) {
  els.top.classList.toggle("tools", on);
  els.tools.classList.toggle("on", on);
  if (on) closeQuality();
  place();
}

// A click outside the panel closes it. Dragging the video (pan) does not, nor
// does the shortcuts card, which is opened from the panel.
const SLACK = 5;

let down = null;

function onDown(e) {
  down = e.isTrusted ? [e.clientX, e.clientY] : null;
}

function onUp(e) {
  const from = down;
  down = null;
  if (!from || !e.isTrusted || !els.top.classList.contains("tools")) return;
  if (Math.abs(e.clientX - from[0]) > SLACK || Math.abs(e.clientY - from[1]) > SLACK) return;
  if ([els.ui, els.tools, els.help].some((x) => x.contains(e.target))) return;
  toggleTools(false);
}

const guardedOnDown = safe(onDown, "panel");
const guardedOnUp = safe(onUp, "panel");
export function installPanel() {
  document.addEventListener("pointerdown", guardedOnDown, true);
  document.addEventListener("pointerup", guardedOnUp, true);
  return () => {
    document.removeEventListener("pointerdown", guardedOnDown, true);
    document.removeEventListener("pointerup", guardedOnUp, true);
  };
}
