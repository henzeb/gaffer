import { t } from "../../shared/i18n.js";
import { short } from "./format.js";

const KEY = "gafferInspectFrame";
const WAIT_MS = 800;

export function inFrame() {
  try {
    return window.top !== window;
  } catch (e) {
    return true;
  }
}

export function sendToTop(text) {
  setTimeout(() => {
    try {
      window.top.postMessage({ [KEY]: 1, url: location.href, text }, "*");
    } catch (e) {}
  }, WAIT_MS);
}

export function collectFrames(onReport, ms = 10000) {
  const seen = {};
  function onMessage(e) {
    const d = e.data;
    if (!d || d[KEY] !== 1 || typeof d.text !== "string" || seen[d.url]) return;
    seen[d.url] = 1;
    onReport("== " + t("inspect.report.frame", { url: short(String(d.url)), origin: e.origin }) + "\n" + d.text);
  }
  window.addEventListener("message", onMessage);
  const timer = setTimeout(stop, ms);
  function stop() {
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
  }
  return stop;
}

// Monitor in frames (SPEC §12.2): the main window tells the frames to start and
// stop, every frame with a video watches its videos and errors and sends its
// lines back.
const CONTROL = "gafferInspectMonitor";
const LINE = "gafferInspectLine";

function children(cmd) {
  [].forEach.call(document.querySelectorAll("iframe,frame"), (f) => {
    try {
      f.contentWindow.postMessage({ [CONTROL]: cmd }, "*");
    } catch (e) {}
  });
}

export function tellFrames(cmd) {
  children(cmd);
}

export function frameLines(onLine) {
  function onMessage(e) {
    const d = e.data;
    if (!d || d[LINE] !== 1 || typeof d.line !== "string") return;
    let host = "?";
    try {
      host = new URL(String(d.frame)).host;
    } catch (x) {}
    onLine("[frame " + host + "] " + d.line);
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

// In a frame: listen to the window above, also passing it on to the frames
// below. A new run replaces the earlier listener.
export function monitorInFrame(createMonitor, hasVideo) {
  if (window.__gafferInspectFrame) window.__gafferInspectFrame();
  let monitor = null;
  function stop() {
    if (monitor) monitor.stop();
    monitor = null;
  }
  function onMessage(e) {
    const d = e.data;
    if (!d || !d[CONTROL] || e.source !== window.parent) return;
    if (d[CONTROL] === "start" && hasVideo() && !monitor) {
      monitor = createMonitor(() => false, () => {}, {
        kinds: ["video", "errors"],
        onLine: (line) => {
          try {
            window.top.postMessage({ [LINE]: 1, frame: location.href, line }, "*");
          } catch (x) {}
        },
      });
      monitor.start();
    } else if (d[CONTROL] === "stop") stop();
    children(d[CONTROL]);
    // The panel closed: nothing of Inspect stays in the frame.
    if (d[CONTROL] === "close") window.__gafferInspectFrame();
  }
  window.addEventListener("message", onMessage);
  window.__gafferInspectFrame = () => {
    stop();
    window.removeEventListener("message", onMessage);
    window.__gafferInspectFrame = null;
  };
}
