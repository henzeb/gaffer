import { showPanel } from "./panel.js";
import { reportVideos } from "./report/videos.js";
import { reportReact } from "./report/react.js";
import { reportPlayers } from "./report/players.js";
import { reportGlobals } from "./report/globals.js";
import { reportIframes } from "./report/iframes.js";
import { reportNetwork } from "./report/network.js";
import { fetchManifestSummaries } from "./report/manifests.js";
import { short } from "./report/format.js";
import { reportRecord } from "./report/record.js";
import { reportPageErrors } from "./report/page-errors.js";
import { reportDomPlayers } from "./report/dom-players.js";
import { reportDirect } from "./report/direct.js";
import { reportTracks } from "./report/tracks.js";
import { inFrame, sendToTop, collectFrames, tellFrames, frameLines, monitorInFrame } from "./report/frames.js";
import { createMonitor } from "./monitor/index.js";
import { t } from "../shared/i18n.js";
import { chromeVersion } from "./issue.js";
import { allVideos } from "../shared/deep.js";

// Set by the shell before the module (SPEC §4.5): its version, and whether it is
// Gaffer (dev). Missing for the bookmarklet.
function shellInfo() {
  const x = window.__gafferInspect;
  try {
    delete window.__gafferInspect;
  } catch (e) {}
  return x && typeof x === "object" ? { shell: String(x.shell || "?"), dev: x.dev === true } : null;
}

function run() {
  const shell = shellInfo();
  const frame = inFrame();
  const frames = [];
  let panel = null;
  let stopFrames = null;
  if (!frame) {
    stopFrames = collectFrames((block) => {
      frames.push(block);
      if (panel) panel.setText(base() + "\n\n" + frames.join("\n\n"));
    });
  }
  const out = [];
  const base = () => out.join("\n");
  const L = (s) => out.push(s);
  let manifests = [];
  let vids = [];
  try {
    L("Gaffer Inspect " + __BUILD__);
    L(t("inspect.report.page", { url: short(location.href) }));
    L(t("inspect.report.started", { how: !shell ? t("inspect.report.started.bookmarklet") : shell.dev ? t("inspect.report.started.dev") : t("inspect.report.started.extension", { shell: shell.shell }) }));
    L(t("inspect.report.browser", { chrome: chromeVersion(navigator.userAgent), width: innerWidth, height: innerHeight, ratio: devicePixelRatio, language: navigator.language || "?" }));
    L("");
    vids = allVideos();
    reportVideos(L, vids);
    L("");
    reportReact(L, vids);
    L("");
    reportPlayers(L, vids);
    L("");
    reportTracks(L, vids);
    L("");
    reportDomPlayers(L, vids);
    L("");
    reportDirect(L, vids);
    L("");
    reportGlobals(L);
    L("");
    reportIframes(L);
    L("");
    manifests = reportNetwork(L);
  } catch (err) {
    L(t("inspect.report.error", { error: err && err.message ? err.message : err }));
  }
  function finish() {
    const text = out.join("\n");
    try {
      console.log(text);
    } catch (e) {}
    if (frame) {
      if (vids.length) sendToTop(text);
      monitorInFrame(createMonitor, () => allVideos().length > 0);
      return;
    }
    panel = showPanel(frames.length ? text + "\n\n" + frames.join("\n\n") : text, stopFrames, { dev: !!(shell && shell.dev), frames: { tell: tellFrames, lines: frameLines } });
  }
  const record = () =>
    reportRecord(L, vids, manifests, { dev: !!(shell && shell.dev) })
      .catch((err) => L(t("inspect.report.error", { error: err && err.message ? err.message : err })))
      .then(() => {
        L("");
        try {
          reportPageErrors(L);
        } catch (err) {
          L(t("inspect.report.error", { error: err && err.message ? err.message : err }));
        }
      })
      .then(finish);
  const todo = manifests.slice(0, 3);
  if (!todo.length) {
    L("");
    record();
    return;
  }
  fetchManifestSummaries(todo).then((r) => {
    L("");
    L("== " + t("inspect.report.manifests"));
    r.forEach((x) => L(x));
    L("");
    record();
  });
}

run();
