import { short, shortIn } from "../report/format.js";
import { layoutOf, layoutKey, playerRoot, classesOf, barsOf } from "../report/layout.js";
import { t } from "../../shared/i18n.js";
import { allVideos } from "../../shared/deep.js";

const EVENTS = ["resize", "emptied", "loadedmetadata", "ended", "play", "pause", "waiting", "stalled", "seeking", "seeked", "ratechange", "volumechange", "gaffer:direct"];

function describe(e) {
  const v = e.target;
  if (e.type === "resize") return t("inspect.monitor.resize", { width: v.videoWidth, height: v.videoHeight });
  if (e.type === "emptied") return t("inspect.monitor.emptied");
  if (e.type === "loadedmetadata") return t("inspect.monitor.loaded", { source: v.currentSrc && v.currentSrc.indexOf("blob:") !== 0 ? short(v.currentSrc) : "blob/MediaSource", width: v.videoWidth, height: v.videoHeight });
  if (e.type === "ended") return t("inspect.monitor.ended");
  if (e.type === "waiting") return t("inspect.monitor.waiting", { time: v.currentTime.toFixed(1), readyState: v.readyState });
  if (e.type === "stalled") return t("inspect.monitor.stalled", { time: v.currentTime.toFixed(1) });
  if (e.type === "seeking") return t("inspect.monitor.seeking", { time: v.currentTime.toFixed(1) });
  if (e.type === "seeked") return t("inspect.monitor.seeked", { time: v.currentTime.toFixed(1) });
  if (e.type === "ratechange") return t("inspect.monitor.rate", { rate: v.playbackRate });
  if (e.type === "volumechange") return v.muted ? t("inspect.monitor.muted", { volume: Math.round(v.volume * 100) }) : t("inspect.monitor.volume", { volume: Math.round(v.volume * 100) });
  // What Direct does (SPEC §12.2).
  if (e.type === "gaffer:direct") return t("inspect.monitor.direct", { text: shortIn((e.detail && e.detail.text) || "") });
  return e.type === "play" ? t("inspect.monitor.play") : t("inspect.monitor.pause");
}

function barsKey(id) {
  const b = barsOf(id);
  if (!b.top || !b.bottom) return { key: "gone", b };
  return { key: [b.top.top, b.top.bottom, b.bottom.top, b.bottom.bottom].join("|"), b };
}

export function createVideoWatch(m) {
  return function install() {
    const vids = allVideos();
    const seen = vids.map(() => ({ layout: "", classes: "", bars: "" }));
    const handlers = vids.map((v, i) => (e) => m.log(t("inspect.monitor.video", { index: i, text: describe(e) })));

    function poll() {
      vids.forEach((v, i) => {
        const say = (text) => m.log(t("inspect.monitor.video", { index: i, text }));
        const l = layoutOf(v);
        const lk = layoutKey(l);
        if (lk !== seen[i].layout) {
          if (seen[i].layout) say(t("inspect.monitor.layout", l));
          seen[i].layout = lk;
        }
        const ck = classesOf(playerRoot(v)).join(" ");
        if (ck !== seen[i].classes) {
          if (seen[i].classes) say(t("inspect.monitor.classes", { list: ck }));
          seen[i].classes = ck;
        }
        const id = v.getAttribute("data-vu-id");
        if (!id) return;
        const bk = barsKey(id);
        if (bk.key !== seen[i].bars) {
          if (seen[i].bars) say(bk.key === "gone" ? t("inspect.monitor.bars.gone") : t("inspect.monitor.bars", { top: bk.b.top.top, topEnd: bk.b.top.bottom, bottom: bk.b.bottom.top, bottomEnd: bk.b.bottom.bottom }));
          seen[i].bars = bk.key;
        }
      });
    }

    vids.forEach((v, i) => {
      m.log(t("inspect.monitor.video", { index: i, text: t("inspect.monitor.start", { width: v.videoWidth, height: v.videoHeight }) }));
      EVENTS.forEach((n) => v.addEventListener(n, handlers[i]));
    });
    poll();
    const timer = setInterval(poll, 250);
    return () => {
      clearInterval(timer);
      vids.forEach((v, i) => EVENTS.forEach((n) => v.removeEventListener(n, handlers[i])));
    };
  };
}
