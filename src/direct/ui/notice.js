import { el, showInTopLayer } from "../../shared/dom.js";
import { save } from "../../shared/storage.js";
import { state as s, els } from "../state.js";
import { safe } from "../safe.js";

export function closeNotice() {
  if (!els.notice) return;
  els.notice.remove();
  els.notice = null;
}

export function openNotice({ text, ok, cancel, remember = null, onOk }) {
  closeNotice();
  const box = document.createElement("div");
  box.id = "vu-notice";
  box.setAttribute("data-vu-for", String(s.id));
  if (s.pop) box.setAttribute("popover", "manual");
  el("p", "txt", text, box);
  const row = el("div", "row", null, box);
  const go = el("button", "go", ok, row);
  const no = el("button", "", cancel, row);
  let check = null;
  if (remember) {
    const label = el("label", "", null, row);
    check = el("input", "", null, label);
    check.type = "checkbox";
    el("span", "", remember.label, label);
  }
  const stop = (e) => e.stopPropagation();
  ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "wheel"].forEach((n) => box.addEventListener(n, stop));
  go.onclick = safe(() => {
    if (check && check.checked) save(remember.key, "1");
    closeNotice();
    onOk();
  }, "notice");
  no.onclick = safe(() => closeNotice(), "notice");
  document.body.appendChild(box);
  els.notice = box;
  if (s.pop) showInTopLayer(box);
  const v = s.v;
  const r = v ? v.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + (r.width - w) / 2));
  const y = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + (r.height - h) / 2));
  box.style.setProperty("left", x + "px", "important");
  box.style.setProperty("top", y + "px", "important");
  go.focus({ preventScroll: true });
}
