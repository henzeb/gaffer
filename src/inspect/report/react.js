import { short, typeOf, collectVideoUrls, INTERESTING, fiberKey, componentName } from "./format.js";
import { isPlayer, playerMethods } from "../../shared/player-detect.js";
import { t } from "../../shared/i18n.js";

const shortUrls = (k, x) => (typeof x === "string" && /^https?:/.test(x) ? short(x) : x);

function playerDetails(cur) {
  let extra = "";
  try {
    if (typeof cur.getBitrates === "function") extra = "\n         getBitrates() = " + JSON.stringify(cur.getBitrates(), shortUrls).slice(0, 1500);
    if (typeof cur.getCurrentBitrateIndex === "function") extra += "\n         getCurrentBitrateIndex() = " + cur.getCurrentBitrateIndex();
    if (typeof cur.getSrc === "function") extra += "\n         getSrc() = " + JSON.stringify(cur.getSrc(), shortUrls).slice(0, 800);
  } catch (e) {
    extra += "\n         " + t("inspect.report.react.error", { error: e.message });
  }
  return extra;
}

export function reportReact(L, vids) {
  L("== " + t("inspect.report.react.title"));
  vids.forEach((v, i) => {
    let a = v;
    let done = 0;
    const seenF = [];
    const comps = [];
    const props = [];
    const found = [];
    const us = [];
    for (let k = 0; k < 8 && a.parentElement; k++) {
      a = a.parentElement;
      const fk = fiberKey(a);
      if (!fk) continue;
      let f = a[fk];
      for (let n = 0; f && n < 30; n++) {
        if (seenF.indexOf(f) >= 0) break;
        seenF.push(f);
        const nm = componentName(f.type);
        if (nm && comps.indexOf(nm) < 0) comps.push(nm);
        const mp = f.memoizedProps;
        if (mp && typeof mp === "object") {
          Object.keys(mp).forEach((pk) => {
            if (INTERESTING.test(pk)) {
              let ty = "?";
              try {
                ty = typeOf(mp[pk]);
              } catch (e) {}
              const line = (nm || "?") + "." + pk + ": " + ty;
              if (props.indexOf(line) < 0) props.push(line);
            }
          });
          collectVideoUrls(mp, 0, us, []);
        }
        let ms = f.memoizedState;
        let si = 0;
        while (ms && si < 20) {
          const val = ms.memoizedState;
          const cur = val && typeof val === "object" && val.current !== void 0 ? val.current : val;
          if (isPlayer(cur)) found.push((nm || "?") + " hook[" + si + "]: " + playerMethods(cur) + playerDetails(cur));
          if (cur && typeof cur === "object") collectVideoUrls(cur, 1, us, []);
          ms = ms.next;
          si++;
        }
        if (f.stateNode && f.stateNode !== a && isPlayer(f.stateNode)) found.push((nm || "?") + " instance: " + playerMethods(f.stateNode));
        f = f.return;
      }
      done = 1;
      break;
    }
    if (!done) {
      L(t("inspect.report.react.missing", { index: i }));
      return;
    }
    L(t("inspect.report.react.components", { index: i, list: comps.slice(0, 25).join(" < ") }));
    if (props.length) L("   props:\n      " + props.slice(0, 40).join("\n      "));
    L("   " + t("inspect.report.react.players") + " " + (found.length ? "\n      " + found.join("\n      ") : t("inspect.report.none")));
    L("   " + t("inspect.report.react.urls") + " " + (us.length ? "\n      " + us.slice(0, 20).map(short).join("\n      ") : t("inspect.report.none")));
  });
}
