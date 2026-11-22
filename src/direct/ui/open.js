// Everything of Direct that can be open over the video: the popups of the bar,
// the quality list, the panel and the shortcuts card (SPEC §11.2).
import { quality as q, els } from "../state.js";
import { popupOpen, closePopups } from "./popup.js";
import { closeQuality } from "../quality/index.js";
import { toggleTools } from "./panel.js";
import { helpOpen, toggleHelp } from "./help.js";

function toolsOpen() {
  return !!els.top && els.top.classList.contains("tools");
}

export function anyOpen() {
  return popupOpen() || !!q.open || toolsOpen() || helpOpen();
}

export function closeAll() {
  closePopups();
  closeQuality();
  if (helpOpen()) toggleHelp(false);
  if (toolsOpen()) toggleTools(false);
}
