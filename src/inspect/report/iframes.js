import { short } from "./format.js";
import { t } from "../../shared/i18n.js";

export function reportIframes(L) {
  L("== " + t("inspect.report.iframes.title"));
  const ifr = [].slice.call(document.querySelectorAll("iframe"));
  if (!ifr.length) L(t("inspect.report.none"));
  ifr.slice(0, 10).forEach((f) => {
    let info = "";
    try {
      const d = f.contentDocument;
      info = " " + (d ? t("inspect.report.iframes.sameOrigin", { n: d.querySelectorAll("video").length }) : t("inspect.report.iframes.otherOrigin"));
    } catch (e) {
      info = " " + t("inspect.report.iframes.otherOrigin");
    }
    L("  " + f.offsetWidth + "x" + f.offsetHeight + " " + short(f.src || "about:blank") + info);
  });
}
