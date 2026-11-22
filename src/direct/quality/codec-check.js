import { state as s, quality as q } from "../state.js";
import { showOsd } from "../ui/osd.js";
import { renderQuality } from "./render.js";
import { markOwnSwitch } from "../video/stream.js";
import { t } from "../../shared/i18n.js";
import { ms } from "../../shared/timing.js";

function frames() {
  try {
    const pq = s.v.getVideoPlaybackQuality && s.v.getVideoPlaybackQuality();
    return pq ? pq.totalVideoFrames : -1;
  } catch (e) {
    return -1;
  }
}

export function watchCodec(it, prev, auto) {
  clearTimeout(q.check);
  const start = Date.now();
  const el = s.v;
  let t0 = null;
  let f0 = null;
  function tick() {
    const v = s.v;
    if (!v || v !== el || !q.adapter) return;
    if (document.hidden || s.ad) t0 = null;
    else if (v.readyState >= 2 && !v.paused && !v.seeking) {
      if (t0 === null) {
        t0 = v.currentTime;
        f0 = frames();
      } else {
        const adv = v.currentTime - t0;
        const fr = frames();
        const noPic = v.videoWidth === 0 || (f0 >= 0 && fr >= 0 && fr === f0);
        if (adv >= ms(2500) / 1000) {
          if (noPic) {
            q.bad[it.id] = 1;
            markOwnSwitch();
            try {
              if (prev !== null) q.adapter.set(prev);
            } catch (e) {}
            q.sel = prev;
            if (auto) q.maxDone = false;
            showOsd(t("direct.quality.codecFallback", { label: it.label }));
            renderQuality();
          }
          return;
        }
      }
    }
    if (Date.now() - start < ms(15000)) q.check = setTimeout(tick, ms(500));
  }
  q.check = setTimeout(tick, ms(700));
}
