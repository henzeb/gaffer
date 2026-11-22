import { describe, path, text, attributes, reactInfo } from "./describe.js";
import { t } from "../../shared/i18n.js";

const QUALITY_TEXT = /(^|[^a-z0-9])(\d{3,4}p(\d{2})?|4k|8k|hd|sd|fhd|uhd|auto|quality|kwaliteit|resolution|resolutie|qualit[eé])([^a-z0-9]|$)/i;
const STATE_ATTRS = ["aria-checked", "aria-selected", "aria-pressed", "data-state", "data-selected", "aria-current"];
const OBSERVED = ["class", "style", "hidden", "aria-hidden", "aria-expanded", "aria-checked", "aria-selected", "aria-pressed", "aria-current", "data-state", "data-selected", "open"];

export function createDomWatch(m) {
  const seenText = {};
  const shownBefore = typeof WeakMap !== "undefined" ? new WeakMap() : null;

  function qualityItems(root) {
    const r = [];
    const all = root.nodeType === 1 ? [root].concat([].slice.call(root.querySelectorAll("*"))) : [];
    for (let i = 0; i < all.length && r.length < 15; i++) {
      const e = all[i];
      if (m.ours(e)) continue;
      const label = text(e);
      if (!label || label.length > 40) continue;
      if (e.children.length && text(e.children[0]) === label) continue;
      if (QUALITY_TEXT.test(label) && r.indexOf(e) < 0) r.push(e);
    }
    return r;
  }

  function reportItems(items, how) {
    if (!items.length) return;
    const labels = items.map(text);
    const key = how + labels.join("|");
    if (seenText[key] && performance.now() - seenText[key] < 1500) return;
    seenText[key] = performance.now();
    let common = items[0].parentElement;
    while (common && items.some((x) => !common.contains(x))) common = common.parentElement;
    m.log(how + ": " + labels.join(" | "));
    m.log("   " + t("inspect.monitor.place", { path: path(items[0]) }));
    const at = attributes(items[0]);
    if (at) m.log("   " + t("inspect.monitor.attributes", { list: at }));
    if (items.length > 1 && common) m.log("   " + t("inspect.monitor.parent", { path: path(common) }));
    reactInfo(items[0]).forEach((x) => m.log("   " + t("inspect.monitor.react", { info: x })));
  }

  function onMutations(list) {
    list.forEach((mu) => {
      if (m.ours(mu.target)) return;
      if (mu.type === "childList") {
        [].forEach.call(mu.addedNodes, (n) => {
          if (n.nodeType !== 1 || m.ours(n)) return;
          reportItems(qualityItems(n), t("inspect.monitor.appeared"));
        });
      } else if (mu.type === "attributes") {
        const e = mu.target;
        if (e.nodeType !== 1) return;
        const an = mu.attributeName;
        if (STATE_ATTRS.indexOf(an) >= 0) {
          const label = text(e);
          if (label && label.length <= 40 && QUALITY_TEXT.test(label)) m.log(t("inspect.monitor.state", { attribute: an, value: e.getAttribute(an), text: label }) + "  (" + describe(e) + ")");
          return;
        }
        const shown = !!(e.offsetWidth || e.offsetHeight);
        if (shownBefore) {
          const was = shownBefore.get(e);
          shownBefore.set(e, shown);
          if (was === void 0 || was === shown) return;
        }
        if (!shown) return;
        const it = qualityItems(e);
        if (it.length >= 1) reportItems(it, t("inspect.monitor.shown"));
      }
    });
  }

  return function install() {
    const mo = new MutationObserver(onMutations);
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: OBSERVED });
    return () => mo.disconnect();
  };
}
