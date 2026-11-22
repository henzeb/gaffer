import { state as s, quality as q } from "../state.js";
import { showOsd } from "../ui/osd.js";
import { pickQuality } from "./index.js";
import { bestQuality, isAuto } from "./labels.js";
import { t } from "../../shared/i18n.js";

export function maybeMax() {
  const a = q.adapter;
  if (!q.maxOn || q.maxDone || q.user || !a || s.recording || s.ad) return;
  if (a.pend && a.pend() !== null) return;
  if (q.pq.busy) return;
  let l = [];
  try {
    l = a.list();
  } catch (e) {}
  l = l.filter((x) => !isAuto(x) && !q.bad[x.id]);
  if (!l.length) return;
  const best = bestQuality(l);
  q.maxDone = true;
  let cur = null;
  try {
    cur = a.cur();
  } catch (e) {}
  if (String(cur) === String(best.id)) return;
  pickQuality(best, true);
  showOsd(t("direct.osd.maxPicked", { label: best.label }));
}
