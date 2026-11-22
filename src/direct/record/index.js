import { el } from "../../shared/dom.js";
import { t } from "../../shared/i18n.js";
import { load } from "../../shared/storage.js";
import { blockedPage } from "../../shared/blocked-sites.js";
import { state as s, els, onClose } from "../state.js";
import { host } from "../host.js";
import { showOsd } from "../ui/osd.js";
import { isLive } from "../playback/live.js";
import { formatTime } from "../playback/seek.js";
import { markOwnSwitch } from "../video/stream.js";
import { renderQuality } from "../quality/render.js";
import { openNotice, closeNotice } from "../ui/notice.js";
import { policyReason, hlsPlayerEncrypted, noDownload } from "./policy.js";
import { openWriter, fileName, partName } from "./writer.js";
import { createManifests } from "./manifests.js";
import { isMse, mseBuffers, webmBuffers, startMse, startRaw, rawWriters, captureApi } from "./mse-capture.js";
import { planDownload, runDownload } from "./manifest-download.js";
import { openFile, pipeFile, plainSource } from "./file-download.js";
import { canCapture, recorderType, startRecorder } from "./media-recorder.js";
import { safe } from "../safe.js";

const PCT = String.fromCharCode.apply(null, [37]);
const manifests = createManifests();
let busy = null;
let encrypted = { v: null, seen: false };
let choice = null;

const REASONS = { site: "direct.record.reason.site", drm: "direct.record.reason.drm", encrypted: "direct.record.reason.encrypted" };

function reasonText(r) {
  return t(REASONS[r] || REASONS.drm);
}

function hlsFor(v) {
  const list = host.seenHls().concat([v && v.hls, v && v._hls, window.hls]);
  for (const h of list) {
    try {
      if (h && h.media === v && Array.isArray(h.levels)) return h;
    } catch (e) {}
  }
  return null;
}

function mediaSourceOf(v) {
  const h = v ? hlsFor(v) : null;
  try {
    const ms = h && h.bufferController && h.bufferController.mediaSource;
    return ms && ms.sourceBuffers ? ms : null;
  } catch (e) {
    return null;
  }
}

function onEncrypted() {
  encrypted.seen = true;
}

const guardedOnEncrypted = safe(onEncrypted, "record");

function followVideo() {
  if (encrypted.v === s.v) return;
  if (encrypted.v) encrypted.v.removeEventListener("encrypted", guardedOnEncrypted);
  encrypted = { v: s.v, seen: false };
  if (s.v) s.v.addEventListener("encrypted", guardedOnEncrypted);
}

function policy(v) {
  if (blockedPage()) return "site";
  const h = hlsFor(v);
  return policyReason({ mediaKeys: v.mediaKeys, encryptedEvent: encrypted.seen, manifests: manifests.all(v.duration), playerEncrypted: h ? hlsPlayerEncrypted(h) : false });
}

function siteNoDownload(v) {
  try {
    return noDownload(v.getAttribute("controlslist"));
  } catch (e) {
    return false;
  }
}

function choose() {
  const v = s.v;
  if (!v) return null;
  const reason = policy(v);
  const c = method(v);
  return reason ? { method: c.method, reason } : c;
}

function method(v) {
  if (isMse(v)) {
    const h = hlsFor(v);
    const m = manifests.current(h && h.url, v.duration);
    if (m && !m.live && !isLive() && ["fmp4", "dash", "ts", "packed"].includes(m.format)) return { method: "manifest", url: m.url, text: m.text };
    if (mseBuffers(v, mediaSourceOf(v)).length) return { method: "mse" };
  } else {
    const url = plainSource(v);
    if (url) return { method: "file", url };
  }
  return canCapture(v) ? { method: "recorder" } : { method: "none" };
}

function isDownload(method) {
  return method === "manifest" || method === "file";
}

function size(n) {
  const mb = n / 1048576;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB";
}

function markRecording(on) {
  const n = Math.max(0, (+window.__gafferRecording || 0) + (on ? 1 : -1));
  if (n) {
    window.__gafferRecording = n;
    return;
  }
  try {
    delete window.__gafferRecording;
  } catch (e) {
    window.__gafferRecording = 0;
  }
  try {
    window.dispatchEvent(new Event("gaffer:recorded"));
  } catch (e) {}
}

export function recording() {
  return !!busy;
}

function render() {
  const b = els.rec;
  if (!b) return;
  const ind = els.recInd;
  const blocked = !busy && choice && choice.reason === "site";
  b.classList.toggle("gone", (!s.v && !busy) || !!blocked);
  if (busy) {
    const secs = (Date.now() - busy.started) / 1000;
    b.classList.add("going");
    b.classList.remove("off");
    ind.classList.add("going");
    if (busy.download) {
      const p = busy.total ? busy.done / busy.total : 0;
      const left = busy.done ? (secs / busy.done) * (busy.total - busy.done) : NaN;
      const pct = Math.floor(p * 100) + PCT;
      els.recLabel.textContent = t("direct.download.running", { percent: pct, left: isFinite(left) ? formatTime(left) : "…" });
      els.recBar.style.setProperty("--vu-p", String(p));
      b.title = t("direct.download.cancel");
      ind.textContent = "⬇ " + pct;
    } else {
      els.recLabel.textContent = t("direct.record.running", { time: formatTime(secs), size: size(busy.bytes) });
      els.recBar.style.setProperty("--vu-p", "0");
      b.title = t("direct.record.stop");
      ind.textContent = "● " + formatTime(secs);
    }
    return;
  }
  b.classList.remove("going");
  ind.classList.remove("going");
  els.recBar.style.setProperty("--vu-p", "0");
  const c = choice;
  const download = c && isDownload(c.method);
  els.recLabel.textContent = download ? t("direct.download") : t("direct.record");
  const off = !c || !!c.reason || c.method === "none";
  b.classList.toggle("off", off);
  if (c && c.reason) b.title = t("direct.record.blocked", { reason: reasonText(c.reason) });
  else if (c && c.method === "none") b.title = t("direct.record.impossible");
  else b.title = download ? t("direct.download.tip") : t("direct.record.tip");
}

function tick() {
  followVideo();
  const h = s.v ? hlsFor(s.v) : null;
  manifests.refresh(h && h.url ? [h.url] : []).catch(() => {});
  choice = choose();
  if (busy && !busy.stopping && s.v) {
    const reason = policy(s.v);
    if (reason) stopRecording("policy", t("direct.record.stopped", { reason: reasonText(reason) }));
  }
  render();
}

export function buildRecord(row, makeButton) {
  const b = makeButton(row, "", t("direct.record.tip"), () => recClick(), "rec gone");
  els.rec = b;
  els.recLabel = el("span", "", t("direct.record"), b);
  els.recBar = el("i", "bar", null, b);
  const ind = document.createElement("div");
  ind.id = "vu-rec";
  ind.setAttribute("data-vu-for", String(s.id));
  els.recInd = ind;
}

export function installRecord() {
  document.body.appendChild(els.recInd);
  const stopWatch = manifests.watch();
  const timer = setInterval(safe(tick, "record"), 1000);
  const onHide = safe(() => stopRecording("leave"), "record");
  window.addEventListener("pagehide", onHide);
  tick();
  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", onHide);
    stopWatch();
    stopRecording("close");
    closeNotice();
    if (encrypted.v) encrypted.v.removeEventListener("encrypted", guardedOnEncrypted);
    encrypted = { v: null, seen: false };
    els.recInd.remove();
  };
}

function recClick() {
  if (busy) {
    const b = busy;
    openNotice({
      text: b.download ? t("direct.download.confirm") : t("direct.record.confirm"),
      ok: b.download ? t("direct.download.confirm.yes") : t("direct.record.confirm.yes"),
      cancel: b.download ? t("direct.download.confirm.no") : t("direct.record.confirm.no"),
      onOk: () => {
        if (busy === b) stopRecording(b.download ? "cancel" : "user");
      },
    });
    return;
  }
  tick();
  const c = choice;
  if (!c || c.reason === "site") return;
  if (c.reason) {
    showOsd(t("direct.record.blocked", { reason: reasonText(c.reason) }));
    return;
  }
  if (c.method === "none") {
    showOsd(t("direct.record.impossible"));
    return;
  }
  const nodl = siteNoDownload(s.v);
  const warning = isDownload(c.method) ? t("direct.download.notice") : t("direct.record.notice");
  if (load("vu-rec-ok") === "1" && !nodl) begin(c);
  else
    openNotice({
      text: nodl ? warning + " " + t("direct.record.notice.nodownload") : warning,
      ok: isDownload(c.method) ? t("direct.download.notice.download") : t("direct.record.notice.record"),
      cancel: t("direct.record.notice.cancel"),
      remember: { key: "vu-rec-ok", label: t("direct.record.notice.remember") },
      onOk: () => begin(c),
    });
}

function lockQuality(b, v) {
  const h = hlsFor(v);
  if (!h) return;
  try {
    b.hls = { h, auto: !!h.autoLevelEnabled };
    if (h.autoLevelEnabled && h.currentLevel >= 0) h.loadLevel = h.currentLevel;
  } catch (e) {}
}

function unlockQuality(b) {
  if (!b.hls) return;
  try {
    if (b.hls.auto) b.hls.h.loadLevel = -1;
  } catch (e) {}
}

function requestInit(b, list) {
  const h = b.hls && b.hls.h;
  const c = captureApi();
  if (!h || !c || !h.levels || h.levels.length < 2) return Promise.resolve(false);
  const back = h.currentLevel >= 0 ? h.currentLevel : h.loadLevel;
  const away = back > 0 ? back - 1 : back + 1;
  const before = new Map(list.map((e) => [e, e.init]));
  return new Promise((resolve) => {
    let done = false;
    let switched = false;
    // Back to the level of before, also when no init came or the recording stopped.
    const finish = (ok) => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      if (switched) {
        try {
          markOwnSwitch();
          h.currentLevel = back;
        } catch (e) {}
      }
      resolve(ok && busy === b);
    };
    const off = c.listen((e) => {
      if (before.has(e) && e.init && e.init !== before.get(e)) finish(true);
    });
    const timer = setTimeout(() => finish(false), 10000);
    try {
      markOwnSwitch();
      h.currentLevel = away;
      switched = true;
    } catch (e) {
      finish(false);
    }
  });
}

function sink(b) {
  return (bytes) => {
    if (b.failed) return;
    b.bytes += bytes.length;
    b.chain = b.chain.then(() => b.writer.write(bytes)).catch((e) => {
      if (b.failed) return;
      b.failed = true;
      stopRecording("error", t("direct.record.writeFailed", { error: (e && e.message) || String(e) }));
    });
  };
}

function nextPart(b) {
  return (n) => {
    b.chain = b.chain.then(async () => {
      b.closed.push(b.writer);
      b.writer = await openWriter(partName(b.name, n), { extra: true });
      showOsd(t("direct.record.part", { name: b.writer.name }));
    });
  };
}

async function begin(c) {
  const v = s.v;
  if (!v || busy) return;
  const b = { method: c.method, download: isDownload(c.method), started: Date.now(), bytes: 0, done: 0, total: 0, writer: null, closed: [], extras: [], ctrl: new AbortController(), chain: Promise.resolve(), stopping: false, failed: false, stop: null, v };
  busy = b;
  s.recording = true;
  markRecording(true);
  renderQuality();
  render();
  try {
    let response = null;
    let raw = false;
    if (b.method === "file") {
      try {
        response = await openFile(c.url, b.ctrl.signal);
      } catch (e) {
        if (!canCapture(v)) throw new Error(t("direct.record.impossible"));
        b.method = "recorder";
        b.download = false;
      }
    }
    if (b.method === "mse") raw = webmBuffers(mseBuffers(v, mediaSourceOf(v)));
    const type = b.method === "recorder" ? recorderType() : null;
    b.name = fileName(type ? type.ext : raw ? "webm" : "mp4");
    b.writer = await openWriter(b.name);
    if (busy !== b || b.stopping) {
      await b.writer.abort();
      return;
    }
    if (b.writer.memory) showOsd(t("direct.record.memory"));
    const write = sink(b);
    const part = nextPart(b);
    if (b.method === "file") {
      b.started = Date.now();
      pipeFile(response, { write: (x) => (write(x), b.chain), progress: (d, total) => ((b.done = d), (b.total = total)), signal: b.ctrl.signal }).then(
        () => stopRecording("done"),
        (e) => failDownload(b, e),
      );
    } else if (b.method === "manifest") {
      const plan = await planDownload(c.url, c.text, v, hlsFor(v), b.ctrl.signal);
      if (!plan) throw new Error(t("direct.record.impossible"));
      b.started = Date.now();
      b.total = plan.jobs.filter((j) => !j.init).length;
      runDownload(plan, { write, part, signal: b.ctrl.signal, progress: (d) => (b.done = d) }).then(
        () => stopRecording("done"),
        (e) => failDownload(b, e),
      );
    } else if (b.method === "mse" && raw) {
      startRawRecording(b, v, write);
    } else if (b.method === "mse") {
      lockQuality(b, v);
      const m = startMse(v, mediaSourceOf(v), {
        write,
        part,
        unsupported: () => {
          m.stop();
          startRawRecording(b, v, write);
        },
        noInit: () => {
          m.stop();
          switchToRecorder(b, v, write);
        },
        requestInit: (list) => requestInit(b, list),
      });
      b.stop = () => m.stop();
    } else {
      switchToRecorder(b, v, write);
    }
    b.started = Date.now();
    render();
  } catch (e) {
    if (e && e.name === "AbortError") {
      reset(b);
      return;
    }
    showOsd((e && e.message) || String(e));
    if (b.writer) await b.writer.abort().catch(() => {});
    reset(b);
  }
}

function startRawRecording(b, v, write) {
  const list = mseBuffers(v, mediaSourceOf(v));
  const kinds = list.map((e) => (/audio/i.test(e.mime || "") ? "audio" : "video"));
  // MP4 buffers that could not be combined stay MP4, each in a file of its own.
  const ext = webmBuffers(list) ? ".webm" : ".mp4";
  const opening = kinds.slice(1).map((k, i) => openWriter(partName(b.name, i + 2, k).replace(/\.mp4$/, ext), { extra: true }));
  Promise.all(opening).then((list) => {
    if (busy !== b || b.stopping) return list.forEach((w) => w.abort());
    b.extras = list;
    const extras = list.map((w) => ({ write: (x) => ((b.bytes += x.length), w.write(x)) }));
    const r = startRaw(v, mediaSourceOf(v), rawWriters([{ write }].concat(extras)));
    b.stop = r.stop;
    b.separate = true;
  });
}

function switchToRecorder(b, v, write) {
  const type = recorderType();
  try {
    if (!type) throw new Error("no type");
    const r = startRecorder(v, type, {
      write,
      fail: () => stopRecording("error", t("direct.record.impossible")),
    });
    b.method = "recorder";
    b.stop = () => r.stop();
    showOsd(t("direct.record.reencoded"));
  } catch (e) {
    stopRecording("error", t("direct.record.impossible"));
  }
}

function failDownload(b, e) {
  if (busy !== b || b.stopping) return;
  if (e && e.name === "AbortError") return;
  stopRecording("failed", t("direct.download.failed", { error: (e && e.message) || String(e) }));
}

function reset(b) {
  if (busy !== b) return;
  busy = null;
  closeNotice();
  s.recording = false;
  unlockQuality(b);
  markRecording(false);
  renderQuality();
  render();
}

function command(b) {
  const names = [b.name].concat(b.extras.map((w) => w.name));
  return "ffmpeg " + names.map((n) => '-i "' + n + '"').join(" ") + " -c copy \"" + b.name.replace(/\.[a-z0-9]+$/i, "") + '.mkv"';
}

export function stopRecording(reason, message) {
  const b = busy;
  if (!b || b.stopping) return Promise.resolve();
  b.stopping = true;
  const cancel = reason === "cancel" || (b.download && reason === "failed");
  b.ctrl.abort();
  const done = (async () => {
    try {
      if (b.stop) await b.stop();
    } catch (e) {}
    await b.chain.catch(() => {});
    if (!b.writer) return;
    if (cancel) {
      await b.writer.abort().catch(() => {});
      await Promise.all(b.closed.concat(b.extras).map((w) => w.abort().catch(() => {})));
      showOsd(message || t("direct.download.cancelled"));
      return;
    }
    let error = null;
    for (const w of b.closed.concat([b.writer], b.extras)) {
      try {
        await w.close();
      } catch (e) {
        error = error || e;
      }
    }
    if (error) showOsd(t("direct.record.writeFailed", { error: error.message || String(error) }));
    else if (message) showOsd(message);
    else if (b.separate) showOsd(t("direct.record.separate", { command: command(b) }));
    else showOsd(t(b.download ? "direct.download.done" : "direct.record.saved", { name: b.writer.name }));
    if (b.separate) console.log("[Gaffer Direct] " + command(b));
  })();
  return done.finally(() => {
    if (busy === b) reset(b);
  });
}
