import { state as s } from "../../state.js";
import { dedupe } from "../labels.js";
import { t } from "../../../shared/i18n.js";

export function labelFor(h, br) {
  return h ? h + "p" : Math.round((br || 0) / 1000) + "k";
}

export function sortedList(items, auto = true) {
  const a = items.slice().sort((x, y) => (y.h || 0) - (x.h || 0) || (y.br || 0) - (x.br || 0));
  return dedupe((auto ? [{ id: "auto", label: t("direct.quality.auto") }] : []).concat(a));
}

export function call(fn) {
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

export function holds(el) {
  return !!el && (el === s.v || (typeof el.contains === "function" && el.contains(s.v)));
}

export function each(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  const out = [];
  for (let i = 0; i < list.length; i++) out.push(typeof list.item === "function" ? list.item(i) : list[i]);
  return out;
}
