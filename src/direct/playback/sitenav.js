import { state as s, els } from "../state.js";
import { playerRoot } from "./hold.js";
import { host } from "../host.js";
import { t } from "../../shared/i18n.js";
import { blockedByAd } from "../video/ad.js";
import { tell, nameOf } from "../tell.js";
import { deepQueryAll } from "../../shared/deep.js";

const PREV = /(^|[^a-z])(vorige|previous|prev)([^a-z]|$)/i;
const NEXT = /(^|[^a-z])(volgende|next)([^a-z]|$)/i;
const SKIP = /playlist|chapter|hoofdstuk|slide|carousel/i;

function label(el) {
  const t = el.getAttribute("aria-label") || el.getAttribute("title") || "";
  if (t) return t;
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
  return txt.length <= 24 ? txt : "";
}

function ours(el) {
  return (els.top && els.top.contains(el)) || (els.bar && els.bar.contains(el));
}

export function findNav(which) {
  const v = s.v;
  if (!v) return null;
  const root = playerRoot(v);
  if (!root) return null;
  const re = which === "prev" ? PREV : NEXT;
  const list = deepQueryAll(root, 'button,[role="button"],a');
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (ours(el) || el.disabled) continue;
    const t = label(el);
    if (re.test(t) && !SKIP.test(t + " " + (typeof el.className === "string" ? el.className : ""))) return el;
  }
  return null;
}

export function siteNav(which) {
  if (blockedByAd()) return;
  const b = findNav(which);
  if (b) {
    tell(t("direct.tell.siteClick", { button: nameOf(b) }));
    try {
      b.click();
    } catch (e) {}
    return;
  }
  host.go(s.id, which === "prev" ? -1 : 1);
}

function setNav(b, enabled, title) {
  b.disabled = !enabled;
  b.title = title;
}

export function renderNav() {
  if (!els.prev || s.ad) return;
  const sp = findNav("prev");
  const sn = findNav("next");
  if (sp || sn) {
    setNav(els.prev, !!sp, t("direct.nav.prevSite"));
    setNav(els.next, !!sn, t("direct.nav.nextSite"));
    return;
  }
  const n = host.neighbors(s.id);
  setNav(els.prev, n.prev, t("direct.nav.prevPage"));
  setNav(els.next, n.next, t("direct.nav.nextPage"));
}
