import { el } from "../../shared/dom.js";
import { els } from "../state.js";
import { safe } from "../safe.js";

let open = null;

export function makePopup(cls) {
  return el("div", "pop " + cls, null, els.bar);
}

export function popupOpen() {
  return !!open;
}

export function closePopups() {
  if (!open) return;
  open.classList.remove("open");
  if (open.__anchor) open.__anchor.classList.remove("open");
  open = null;
}

export function placePopup() {
  if (!open) return;
  const a = open.__anchor;
  const br = els.bar.getBoundingClientRect();
  const ar = a.getBoundingClientRect();
  const room = Math.max(60, ar.top - 16);
  open.style.setProperty("--vu-pop-h", Math.min(130, room - 80) + "px");
  const w = open.offsetWidth;
  const left = Math.max(4, Math.min(br.width - w - 4, ar.left - br.left + ar.width / 2 - w / 2));
  open.style.setProperty("left", left + "px", "important");
  open.style.setProperty("bottom", br.bottom - ar.top + 6 + "px", "important");
}

export function togglePopup(p, anchor) {
  if (open === p) {
    closePopups();
    return;
  }
  closePopups();
  open = p;
  p.__anchor = anchor;
  p.classList.add("open");
  anchor.classList.add("open");
  placePopup();
}

function onDown(e) {
  if (!open || !e.isTrusted) return;
  const t = e.target;
  if (open.contains(t) || (open.__anchor && open.__anchor.contains(t))) return;
  closePopups();
}

const guardedOnDown = safe(onDown, "popups");
export function installPopups() {
  document.addEventListener("pointerdown", guardedOnDown, true);
  return () => {
    document.removeEventListener("pointerdown", guardedOnDown, true);
    closePopups();
  };
}
