// Whether the video should be running, or should show another moment, but has
// to wait for data (SPEC §11.4). Judged by the video itself, so it works with
// every player.
import { state as s } from "../state.js";
import { blocked } from "../host.js";
import { notStarted } from "../video/site-controls.js";
import { updateBar } from "../ui/bar.js";
import { showLoader } from "../ui/loader.js";
import { ms } from "../../shared/timing.js";

const DELAY = 300;
// Some players keep claiming they have data while the time stands still.
const STILL = 1000;
const EVERY = 100;

let seen = null;
let time = 0;
let movedAt = 0;
let waitAt = 0;

function casting(v) {
  return !!v.remote && (v.remote.state === "connected" || v.remote.state === "connecting");
}

function standsStill(v, now) {
  if (v.currentTime !== time || v.paused || v.playbackRate === 0 || document.hidden) {
    time = v.currentTime;
    movedAt = now;
    return false;
  }
  if (v.networkState === v.NETWORK_EMPTY || v.networkState === v.NETWORK_NO_SOURCE) return false;
  if (v.readyState < v.HAVE_FUTURE_DATA) return now - movedAt >= ms(DELAY);
  // The time of a camera or a canvas may stand still with the picture.
  return !v.srcObject && now - movedAt >= ms(STILL);
}

function buffering(now) {
  const v = s.v;
  if (v !== seen) {
    seen = v;
    waitAt = 0;
    movedAt = now;
    time = v ? v.currentTime : 0;
  }
  if (!v) return false;
  const still = standsStill(v, now);
  if (!(s.autoP || v.seeking)) waitAt = 0;
  else if (!waitAt) waitAt = now;
  if (!s.shown || blocked() || v.ended || v.error || notStarted(v) || casting(v)) return false;
  return still || (waitAt > 0 && now - waitAt >= ms(DELAY));
}

function check() {
  const on = buffering(Date.now());
  if (on === s.loading) return;
  s.loading = on;
  showLoader(on);
  updateBar();
}

export function installBuffering(safe) {
  const timer = setInterval(safe(check, "loader"), ms(EVERY));
  return () => {
    clearInterval(timer);
    s.loading = false;
    seen = null;
  };
}
