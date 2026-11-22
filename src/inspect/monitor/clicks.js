import { describe, path, text, attributes, reactInfo } from "./describe.js";
import { t } from "../../shared/i18n.js";

const TYPES = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "touchstart", "touchend"];

function handlers(el) {
  const r = [];
  let a = el;
  for (let k = 0; k < 4 && a && a.tagName; k++, a = a.parentElement) {
    const pk = Object.keys(a).filter((x) => x.indexOf("__reactProps") === 0)[0];
    if (!pk) continue;
    const pr = a[pk] || {};
    const hs = Object.keys(pr).filter((x) => /^on[A-Z]/.test(x) && typeof pr[x] === "function");
    if (hs.length) r.push(describe(a) + ": " + hs.join(", "));
  }
  return r;
}

export function createClickWatch(m) {
  let lastEl = null;
  let lastT = 0;

  function onClick(e) {
    if (m.ours(e.target)) return;
    const el = e.target;
    const now = performance.now();
    if (el === lastEl && now - lastT < 1500) {
      lastT = now;
      m.log("   + " + e.type + (e.isTrusted ? "" : " " + t("inspect.monitor.fromCode")));
      return;
    }
    lastEl = el;
    lastT = now;
    m.log(t("inspect.monitor.event", { type: e.type, text: text(el) }) + "  " + describe(el) + (e.isTrusted ? "" : "  " + t("inspect.monitor.fromCode")));
    const at = attributes(el);
    if (at) m.log("   " + t("inspect.monitor.attributes", { list: at }));
    m.log("   " + t("inspect.monitor.place", { path: path(el) }));
    handlers(el).forEach((x) => m.log("   " + t("inspect.monitor.handlers", { list: x })));
    reactInfo(el).forEach((x) => m.log("   " + t("inspect.monitor.react", { info: x })));
  }

  return function install() {
    TYPES.forEach((n) => window.addEventListener(n, onClick, true));
    return () => TYPES.forEach((n) => window.removeEventListener(n, onClick, true));
  };
}
