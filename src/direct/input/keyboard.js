import { state as s, els } from "../state.js";
import { atVideo } from "./routing.js";
import { pan, zoomAt, rotate, quarter, flip, resetAll } from "../view/transform.js";
import { setFull, toggleFull } from "../view/fullscreen.js";
import { playPause } from "../playback/play.js";
import { skip } from "../playback/seek.js";
import { stepSpeed, fineSpeed, togglePitch } from "../playback/speed.js";
import { isLive } from "../playback/live.js";
import { toggleMute, stepVolume } from "../playback/volume.js";
import { toggleTools } from "../ui/panel.js";
import { toggleQuality } from "../quality/index.js";
import { toggleCaptions } from "../tracks/index.js";
import { wake } from "../ui/bar.js";
import { helpOpen, toggleHelp } from "../ui/help.js";
import { popupOpen, closePopups } from "../ui/popup.js";
import { safe } from "../safe.js";
import { stepBrightness, stepContrast } from "../view/light.js";
import { targetOf } from "../../shared/deep.js";

function handle(k, shift) {
  const step = shift ? 90 : 30;
  if (k === "Escape") {
    if (popupOpen()) closePopups();
    else if (helpOpen()) toggleHelp(false);
    else if (s.F) setFull(false);
    else return false;
  } else if (k === "ArrowUp") pan(0, step);
  else if (k === "ArrowDown") pan(0, -step);
  else if (k === "ArrowLeft") pan(step, 0);
  else if (k === "ArrowRight") pan(-step, 0);
  else if (k === "+" || k === "=") zoomAt(null, null, 1.1);
  else if (k === "-" || k === "_") zoomAt(null, null, 1 / 1.1);
  else if (k === "[" || k === "{") rotate(shift ? -1 : -5);
  else if (k === "]" || k === "}") rotate(shift ? 1 : 5);
  else if (k === "r" || k === "R") quarter();
  else if (k === "h" || k === "H") flip(true);
  else if (k === "v" || k === "V") flip(false);
  else if (k === " " || k === "k" || k === "K") playPause();
  else if (k === "j" || k === "J") skip(-10);
  else if (k === "l" || k === "L") skip(10);
  else if (k === "<") stepSpeed(-1);
  else if (k === ",") fineSpeed(-1);
  else if (k === ".") fineSpeed(1);
  else if ((k === "p" || k === "P") && !isLive()) togglePitch();
  else if (k === ">") stepSpeed(1);
  else if (k === "f" || k === "F") toggleFull();
  else if (k === "0") resetAll();
  else if (k === "b" || k === "B") stepBrightness(shift ? -1 : 1);
  else if (k === "n" || k === "N") stepContrast(shift ? -1 : 1);
  else if (k === "t" || k === "T") toggleTools();
  else if (k === "m" || k === "M") toggleMute();
  else if (k === "q" || k === "Q") toggleQuality();
  else if (k === "c" || k === "C") return toggleCaptions();
  else if (k === "PageUp") stepVolume(0.05);
  else if (k === "PageDown") stepVolume(-0.05);
  else return false;
  return true;
}

function onKeyDown(e) {
  if (!s.v || e.ctrlKey || e.metaKey || e.altKey) return;
  // The field itself, also inside a shadow root.
  const t = targetOf(e);
  // Fields of the site keep their keys; our own sliders (seek bar, exposure) do not.
  const own = t === els.seek || (els.ui && els.ui.contains(t));
  if (t && !own && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  if (!s.F && !atVideo(s.mx, s.my) && !els.top.matches(":hover")) return;
  if (handle(e.key, e.shiftKey)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    wake();
  }
}

const guardedOnKeyDown = safe(onKeyDown, "keyboard");
export function installKeyboard() {
  window.addEventListener("keydown", guardedOnKeyDown, true);
  return () => window.removeEventListener("keydown", guardedOnKeyDown, true);
}
