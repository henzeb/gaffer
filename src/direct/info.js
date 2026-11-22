// What Direct reports about its video to Inspect (SPEC §12.1). Only reads.
import { state as s, els } from "./state.js";
import { host } from "./host.js";
import { zSource } from "./view/layer.js";
import { qualityInfo, qualityState } from "./quality/index.js";
import { tracksInfo } from "./tracks/index.js";
import { liveInfo } from "./playback/live.js";
import { levelInfo } from "./level/index.js";
import { chaptersInfo } from "./playback/chapters.js";
import { findNav } from "./playback/sitenav.js";
import { findShare } from "./playback/share.js";

// Seconds buffered from the current time on.
function ahead(v) {
  const b = v.buffered;
  const now = v.currentTime;
  for (let i = 0; i < b.length; i++) if (b.start(i) <= now + 0.1 && b.end(i) >= now) return b.end(i) - now;
  return 0;
}

export function directInfo(errors) {
  const v = s.v;
  return Object.assign(
    {
      version: __BUILD__,
      extension: host.quiet,
      capture: !!window.__gafferCapture,
      errors: errors(),
      quality: qualityInfo(),
      qualityState: qualityState(),
      zFrom: zSource(),
      parent: els.bar.parentElement,
      live: liveInfo(),
      ad: s.ad,
      light: { brightness: s.B, contrast: s.C },
      level: levelInfo(),
      chapters: chaptersInfo(),
      playback: v ? { held: s.hold, loading: s.loading, readyState: v.readyState, ahead: ahead(v), guard: s.autoP } : null,
      nav: { prev: findNav("prev"), next: findNav("next"), page: host.neighbors(s.id) },
      share: findShare() || (navigator.share ? "system" : "copy"),
    },
    tracksInfo(),
  );
}

