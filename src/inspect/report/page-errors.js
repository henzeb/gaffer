// The errors capture kept since the page loaded (SPEC §4.5, §12.1).
import { t } from "../../shared/i18n.js";

function line(e) {
  if (e.kind === "load") return t("inspect.monitor.loadFailed", { element: e.text, url: e.where });
  if (e.kind === "rejection") return t("inspect.monitor.rejection", { text: e.text });
  return e.where ? t("inspect.monitor.error.at", { text: e.text, where: e.where }) : t("inspect.monitor.error", { text: e.text });
}

export function reportPageErrors(L) {
  L("== " + t("inspect.report.pageErrors.title"));
  const g = window.__gafferErrors;
  if (!g || typeof g.list !== "function") {
    L(t("inspect.report.pageErrors.unknown"));
    return;
  }
  // Started later than the page: from the bookmarklet, or switched on in an open tab.
  if (g.since > 3000) L(t("inspect.report.pageErrors.since", { time: (g.since / 1000).toFixed(1) }));
  const list = g.list();
  if (!list.length) L(t("inspect.report.none"));
  list.forEach((e) => L("+" + (e.at / 1000).toFixed(1) + " s  " + line(e)));
}
