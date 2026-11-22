import { state as s, quality as q, els } from "../state.js";
import { btn } from "../ui/bar.js";
import { readPortalNow } from "./adapters/portal.js";
import { qualityLabel, pickQuality } from "./index.js";
import { isOriginal } from "./labels.js";
import { t } from "../../shared/i18n.js";

function clearRow() {
  while (els.qrow.firstChild) els.qrow.removeChild(els.qrow.firstChild);
}

export function renderQuality() {
  const qB = els.q;
  const qrow = els.qrow;
  const a = q.adapter;
  if (!a) {
    if (s.v && q.pq.has) {
      qB.classList.remove("gone");
      qB.textContent = "…";
      qB.classList.toggle("on", q.open);
      qrow.classList.toggle("open", q.open);
      if (q.open && q.sig !== "load") {
        q.sig = "load";
        clearRow();
        btn(qrow, t("direct.quality.loading"), t("direct.quality.loading.tip"), () => readPortalNow(), "");
      }
      return;
    }
    qB.classList.add("gone");
    qrow.classList.remove("open");
    return;
  }
  qB.classList.remove("gone");
  let cur = null;
  try {
    cur = a.cur();
  } catch (e) {}
  const pnd = a.pend ? a.pend() : null;
  const auto = t("direct.quality.auto");
  let shown = q.sel === "auto" && cur !== "auto" ? auto : qualityLabel(cur) || auto;
  if (pnd !== null) shown = (qualityLabel(pnd) || String(pnd)) + " …";
  else if (((shown === auto && (cur === "auto" || cur === null)) || isOriginal(shown)) && s.v && s.v.videoHeight) shown = t("direct.quality.withHeight", { label: shown, height: s.v.videoHeight });
  qB.textContent = shown;
  qB.classList.toggle("off", s.recording || s.ad);
  qB.title = s.ad ? t("direct.ad.unavailable") : s.recording ? t("direct.quality.locked") : t("direct.top.quality");
  if ((s.recording || s.ad) && q.open) q.open = false;
  qB.classList.toggle("pend", pnd !== null);
  qB.classList.toggle("on", q.open);
  qrow.classList.toggle("open", q.open);
  if (!q.open) {
    q.sig = "";
    return;
  }
  let l = [];
  try {
    l = a.list();
  } catch (e) {}
  const sig = JSON.stringify([q.sel, cur, pnd, l.map((it) => [it.id, it.label, !!q.bad[it.id]])]);
  if (sig === q.sig && qrow.firstChild) return;
  q.sig = sig;
  clearRow();
  l.forEach((it) => {
    // Not on the option itself: an adapter may keep its list between renders.
    const label = q.bad[it.id] ? it.label + " ✕" : it.label;
    const on = pnd !== null ? String(pnd) === String(it.id) : q.sel !== null ? String(q.sel) === String(it.id) : String(cur) === String(it.id);
    btn(qrow, label, t("direct.quality.tip", { label: it.label }) + (it.tip ? "\n" + it.tip : ""), () => pickQuality(it), (on ? "on" : "") + (on && pnd !== null ? " pend" : "") + (q.bad[it.id] ? " bad" : ""));
  });
}
