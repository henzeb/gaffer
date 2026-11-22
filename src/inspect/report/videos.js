import { shortIn, short, typeOf, INTERESTING, componentName } from "./format.js";
import { isQualityPlayer } from "../../shared/player-detect.js";
import { t } from "../../shared/i18n.js";
import { layoutOf, playerRoot, classesOf } from "./layout.js";
import { deepParent } from "../../shared/deep.js";

function reactOnVideo(v, L) {
  const own = Object.keys(v);
  const rk = own.filter((k) => k.indexOf("__react") === 0);
  const other = own.filter((k) => k.indexOf("__react") !== 0);
  if (other.length) {
    L("   " + t("inspect.report.videos.ownProperties", { list: other.slice(0, 20).map((k) => {
      let ty = "?";
      try {
        ty = typeOf(v[k]);
      } catch (e) {}
      return k + ":" + ty;
    }).join(", ") }));
  }
  if (!rk.length) return;
  const fk = rk.filter((k) => k.indexOf("__reactFiber") === 0)[0];
  L("   " + t("inspect.report.videos.react"));
  if (!fk) return;
  let f = v[fk];
  const names = [];
  const props = [];
  for (let n = 0; f && n < 40; n++) {
    const type = f.type;
    const nm = componentName(type);
    if (nm) names.push(nm);
    const mp = f.memoizedProps;
    if (mp && typeof mp === "object") {
      Object.keys(mp).forEach((pk) => {
        if (INTERESTING.test(pk)) {
          let ty = "?";
          try {
            ty = typeOf(mp[pk]);
          } catch (e) {}
          props.push((nm || (typeof type === "string" ? type : "?")) + "." + pk + ": " + ty);
        }
      });
    }
    let ms = f.memoizedState;
    let si = 0;
    while (ms && si < 15) {
      const val = ms.memoizedState;
      if (val && typeof val === "object") {
        const cur = val.current !== void 0 ? val.current : val;
        try {
          if (isQualityPlayer(cur)) props.push((nm || "?") + " state/ref[" + si + "]: " + t("inspect.report.videos.playerObject") + " " + typeOf(cur));
        } catch (e) {}
      }
      ms = ms.next;
      si++;
    }
    f = f.return;
  }
  L("   " + t("inspect.report.videos.components", { list: names.slice(0, 20).join(" < ") || "-" }));
  if (props.length) L("   " + t("inspect.report.videos.interesting") + "\n      " + props.slice(0, 40).join("\n      "));
}

export function reportVideos(L, vids) {
  L("== " + t("inspect.report.videos.title", { n: vids.length }));
  vids.forEach((v, i) => {
    const cs = v.currentSrc || v.src || "";
    L(t("inspect.report.videos.video", { index: i, width: v.offsetWidth, height: v.offsetHeight, videoWidth: v.videoWidth, videoHeight: v.videoHeight, state: v.paused ? t("inspect.report.videos.paused") : t("inspect.report.videos.playing"), source: cs ? (cs.indexOf("blob:") === 0 ? t("inspect.report.videos.blob") : short(cs)) : t("inspect.report.videos.empty") }));
    [].forEach.call(v.querySelectorAll("source"), (src) => {
      L("   <source> " + short(src.src) + " " + [].map.call(src.attributes, (a) => (a.name === "src" ? "" : a.name + "=" + shortIn(a.value))).join(" ").trim());
    });
    // A video in a shadow root: which kind, and of which host (SPEC §11.1).
    const shadow = v.getRootNode();
    if (shadow && shadow.host) L("   " + t("inspect.report.videos.shadow", { mode: shadow.mode || "?", host: shadow.host.tagName.toLowerCase() }));
    const anc = [];
    let a = v;
    for (let k = 0; k < 6 && deepParent(a); k++) {
      a = deepParent(a);
      anc.push(a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") + (typeof a.className === "string" && a.className.trim() ? "." + a.className.trim().split(/\s+/).slice(0, 3).join(".") : ""));
    }
    L("   " + t("inspect.report.videos.ancestors", { list: anc.join(" < ") }));
    const l = layoutOf(v);
    L("   " + t("inspect.report.videos.layout", Object.assign({}, l, { ended: l.ended ? t("inspect.report.videos.yes") : t("inspect.report.videos.no") })));
    const root = playerRoot(v);
    if (root) L("   " + t("inspect.report.videos.player", { name: root.id ? "#" + root.id : root.tagName.toLowerCase(), list: classesOf(root).join(" ") }));
    reactOnVideo(v, L);
  });
}
