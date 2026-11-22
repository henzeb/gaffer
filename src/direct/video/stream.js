import { state as s, quality as q, resetView } from "../state.js";
import { render } from "../view/transform.js";
import { updateBar } from "../ui/bar.js";
import { stopRecording } from "../record/index.js";
import { adBusy, afterAdMetadata, noteRate } from "./ad.js";

const OWN_SWITCH_MS = 4000;

export function markOwnSwitch() {
  s.ownSwitch = Date.now();
}

export function onEmptied() {
  if (adBusy()) return;
  if (Date.now() - s.ownSwitch < OWN_SWITCH_MS) return;
  s.pendingDur = s.lastDur;
}

export function onMetadata() {
  const d = s.v ? s.v.duration : NaN;
  if (adBusy()) {
    s.pendingDur = null;
    if (!s.ad) {
      s.lastDur = d;
      afterAdMetadata();
    }
    return;
  }
  noteRate();
  if (s.pendingDur !== null) {
    const old = s.pendingDur;
    s.pendingDur = null;
    // A live stream reloaded is still the same: Infinity minus Infinity is no number.
    if (d !== old && !(Math.abs(d - old) <= 1)) newStream();
  }
  s.lastDur = d;
}

function newStream() {
  stopRecording("video");
  resetView();
  q.key = "#nieuw";
  render();
  updateBar();
}
