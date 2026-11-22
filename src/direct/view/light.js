// Brightness and contrast (SPEC §11.3): a CSS filter in Direct's own style rule
// for the video, next to the transform. 100 is unchanged.
import { state as s, els } from "../state.js";
import { showOsd } from "../ui/osd.js";
import { t } from "../../shared/i18n.js";
import { render } from "./transform.js";

export const LIGHT_MIN = 50;
export const LIGHT_MAX = 200;
export const LIGHT_STEP = 5;

function clamp(x) {
  return Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, Math.round(x / LIGHT_STEP) * LIGHT_STEP));
}

// Empty at 100 and 100, so a filter of the site itself keeps working.
export function lightFilter() {
  return s.B === 100 && s.C === 100 ? "" : "brightness(" + s.B / 100 + ") contrast(" + s.C / 100 + ")";
}

export function renderLight() {
  if (!els.bright) return;
  const b = String(s.B);
  const c = String(s.C);
  if (els.bright.value !== b) els.bright.value = b;
  if (els.contrast.value !== c) els.contrast.value = c;
  if (els.brightVal.textContent !== b) els.brightVal.textContent = b;
  if (els.contrastVal.textContent !== c) els.contrastVal.textContent = c;
}

export function setBrightness(x) {
  if (!s.v) return;
  s.B = clamp(x);
  render();
  showOsd(t("direct.osd.brightness", { value: s.B }));
}

export function setContrast(x) {
  if (!s.v) return;
  s.C = clamp(x);
  render();
  showOsd(t("direct.osd.contrast", { value: s.C }));
}

export function stepBrightness(d) {
  setBrightness(s.B + d * LIGHT_STEP);
}

export function stepContrast(d) {
  setContrast(s.C + d * LIGHT_STEP);
}

export function resetLight() {
  if (!s.v) return;
  s.B = 100;
  s.C = 100;
  render();
  showOsd(t("direct.osd.lightReset"));
}
