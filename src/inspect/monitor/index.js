import { createDomWatch } from "./dom.js";
import { createClickWatch } from "./clicks.js";
import { createNetworkWatch } from "./network.js";
import { createVideoWatch } from "./video.js";
import { createErrorWatch } from "./errors.js";

// kinds: which watchers (a frame only watches its videos and errors, SPEC §12.2);
// onLine hears every line as it is logged.
export function createMonitor(ours, onChange, { kinds = null, onLine = null } = {}) {
  const events = [];
  let t0 = 0;
  let running = false;
  let undo = [];
  const m = {
    ours,
    log(s) {
      if (!running) return;
      const sec = (performance.now() - t0) / 1000;
      events.push("+" + sec.toFixed(1) + " s  " + s);
      if (onLine) onLine(s);
      if (events.length > 400) events.splice(0, events.length - 400);
      onChange();
    },
  };
  const all = { video: createVideoWatch, dom: createDomWatch, clicks: createClickWatch, network: createNetworkWatch, errors: createErrorWatch };
  const installers = Object.keys(all)
    .filter((k) => !kinds || kinds.includes(k))
    .map((k) => all[k](m));

  return {
    events,
    // A line from elsewhere, such as a frame (SPEC §12.2).
    add(s) {
      m.log(s);
    },
    get running() {
      return running;
    },
    get started() {
      return t0 > 0;
    },
    start() {
      if (running) return;
      running = true;
      events.length = 0;
      t0 = performance.now();
      undo = installers.map((install) => install());
    },
    stop() {
      if (!running) return false;
      running = false;
      undo.forEach((f) => {
        try {
          f();
        } catch (e) {}
      });
      undo = [];
      return true;
    },
  };
}
