import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { page, osd, leaks } from "./direct-helpers.js";
import { t } from "../../src/shared/i18n.js";

const media = path.join(import.meta.dirname, "..", "fixtures", "media");

const WRITER = `(() => {
  window.__gafferFiles = {};
  window.__gafferWriter = (name, o) => {
    const f = (window.__gafferFiles[name] = { chunks: [], size: 0, closed: false, aborted: false, extra: !!(o && o.extra) });
    return {
      name,
      memory: false,
      get size() { return f.size; },
      write(b) { f.chunks.push(b.slice()); f.size += b.length; return Promise.resolve(); },
      close() { f.closed = true; return Promise.resolve(); },
      abort() { f.aborted = true; f.chunks = []; f.size = 0; return Promise.resolve(); },
    };
  };
})()`;

async function open(file, { remember = true, setup = null } = {}) {
  await page.open(file);
  await page.eval(WRITER);
  if (setup) await page.eval(setup);
  if (remember) await page.eval(`localStorage.setItem("vu-rec-ok", "1")`);
  else await page.eval(`localStorage.removeItem("vu-rec-ok")`);
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.hover("#vid");
}

const recTitle = () => page.eval(`document.querySelector("#video-ultimate-top .rec")?.title`);
const recText = () => page.eval(`document.querySelector("#video-ultimate-top .rec")?.textContent`);
const files = () => page.eval(`Object.entries(window.__gafferFiles).map(([name, f]) => ({ name, size: f.size, closed: f.closed, aborted: f.aborted, extra: f.extra }))`);

async function clickRec() {
  await page.hover("#vid");
  await page.click("#video-ultimate-top .rec");
}

async function stopRec() {
  await clickRec();
  await page.waitFor(`!!document.querySelector("#vu-notice button.go")`, 2000);
  await page.click("#vu-notice button.go");
}

async function fileBytes(name) {
  const b64 = await page.eval(`new Blob(window.__gafferFiles[${JSON.stringify(name)}].chunks).arrayBuffer().then((a) => { const u = new Uint8Array(a); let s = ""; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); })`);
  return Buffer.from(b64, "base64");
}

function probe(buf, ext = "mp4") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-rec-"));
  const file = path.join(dir, "out." + ext);
  fs.writeFileSync(file, buf);
  try {
    return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,height:format=duration,start_time", "-of", "json", file]));
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

function firstFrameIsKey(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-rec-"));
  const file = path.join(dir, "out.mp4");
  fs.writeFileSync(file, buf);
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=key_frame", "-read_intervals", "%+1", "-of", "csv=p=0", file]).toString().trim();
    return out.split("\n")[0].split(",")[0].trim() === "1";
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

const kinds = (p) => p.streams.map((s) => s.codec_type + ":" + s.codec_name).sort();

async function finished() {
  await page.waitFor(`Object.values(window.__gafferFiles).some((f) => f.closed || f.aborted) && !window.__gafferRecording`, 30000);
  return files();
}

test("download: a single mp4 file is saved byte for byte", async () => {
  await open("video.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 4000);
  assert.equal(await recText(), t("direct.download"));
  await clickRec();
  const [f] = await finished();
  assert.match(f.name, /^127\.0\.0\.1-\d{4}-\d\d-\d\d-\d{6}\.mp4$/);
  assert.equal(f.closed, true);
  const src = await page.eval(`document.getElementById("vid").currentSrc`);
  const local = path.join(media, new URL(src).pathname.split("/").pop());
  assert.ok((await fileBytes(f.name)).equals(fs.readFileSync(local)));
  assert.equal(await osd(), t("direct.download.done", { name: f.name }));
});

test("download from the manifest: hls.js with fMP4 and a separate audio track gives one file", async () => {
  await open("hls-fmp4.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 8000);
  await clickRec();
  const [f] = await finished();
  assert.equal(f.closed, true, JSON.stringify(f));
  const p = probe(await fileBytes(f.name));
  assert.deepEqual(kinds(p), ["audio:aac", "video:h264"]);
  assert.ok(Math.abs(+p.format.duration - 60) < 1, "duration " + p.format.duration);
});

test("download from the manifest: dash.js gives one file with picture and sound", async () => {
  await open("dash-real.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 8000);
  await clickRec();
  const [f] = await finished();
  assert.equal(f.closed, true);
  const p = probe(await fileBytes(f.name));
  assert.deepEqual(kinds(p), ["audio:aac", "video:h264"]);
  assert.ok(Math.abs(+p.format.duration - 60) < 1, "duration " + p.format.duration);
});

async function playsInChrome(name, at) {
  return page.eval(`(async () => {
    const v = document.createElement("video");
    v.muted = true;
    v.src = URL.createObjectURL(new Blob(window.__gafferFiles[${JSON.stringify(name)}].chunks, { type: "video/mp4" }));
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error(v.error && v.error.message)); });
    const until = (f) => new Promise((ok) => { const t0 = Date.now(); const i = setInterval(() => { if (f() || Date.now() - t0 > 8000) { clearInterval(i); ok(f()); } }, 50); });
    v.currentTime = ${at} - 0.5;
    await v.play();
    const passed = await until(() => v.currentTime > ${at} + 0.5);
    v.pause();
    const out = { duration: v.duration, height: v.videoHeight, passed, error: v.error && v.error.message };
    URL.revokeObjectURL(v.src);
    return out;
  })()`);
}

test("download from the manifest: hls.js with TS chunks is converted into one file that plays in Chrome", async () => {
  await open("hls-real.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 8000);
  assert.equal(await recText(), t("direct.download"));
  await clickRec();
  const [f] = await finished();
  assert.equal(f.closed, true, JSON.stringify(f));
  const buf = await fileBytes(f.name);
  const p = probe(buf);
  assert.deepEqual(kinds(p), ["audio:aac", "video:h264"]);
  assert.ok(Math.abs(+p.format.duration - 60) < 1, "duration " + p.format.duration);
  assert.ok(+p.format.start_time < 0.1, "start_time " + p.format.start_time);
  assert.ok(firstFrameIsKey(buf), "the file starts with a keyframe");
  const play = await playsInChrome(f.name, 30);
  assert.ok(Math.abs(play.duration - 60) < 1 && play.height > 0 && play.passed, JSON.stringify(play));
  assert.equal(await osd(), t("direct.download.done", { name: f.name }));
});

for (const [name, at, duration] of [
  ["discontinuity", 10, 20],
  ["wrap", 6.3, 10],
]) {
  test("download from the manifest: TS with a " + (name === "wrap" ? "wrap of the PTS" : "discontinuity") + " plays through in Chrome", async () => {
    await open("hls-real.html?src=/fixtures/media/ts/" + name + "/index.m3u8");
    await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 8000);
    await clickRec();
    const [f] = await finished();
    assert.equal(f.closed, true, JSON.stringify(f));
    const p = probe(await fileBytes(f.name));
    assert.ok(Math.abs(+p.format.duration - duration) < 0.2, "duration " + p.format.duration);
    const play = await playsInChrome(f.name, at);
    assert.ok(Math.abs(play.duration - duration) < 0.2 && play.passed, JSON.stringify(play));
  });
}

test("recording through MSE: hls.js with TS chunks and an unreadable manifest, separate buffers become one file that starts on a keyframe", async () => {
  await open("hls-real.html?short", { setup: `(() => { const f = window.fetch; window.fetch = (u, o) => /\\.m3u8/.test(String(u)) ? Promise.reject(new TypeError("blocked")) : f(u, o); })()` });
  await page.waitFor(`(() => { const v = document.getElementById("vid"); return v.currentTime > 2 && v.videoHeight >= 1080; })()`, 15000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 4000);
  await clickRec();
  await page.waitFor(`Object.values(window.__gafferFiles)[0]?.size > 50000`, 15000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .q").classList.contains("off")`), true);
  await stopRec();
  const [f] = await finished();
  assert.equal(f.closed, true);
  const buf = await fileBytes(f.name);
  const p = probe(buf);
  assert.deepEqual(kinds(p), ["audio:aac", "video:h264"]);
  assert.ok(+p.format.duration > 1, "duration " + p.format.duration);
  assert.ok(+p.format.start_time < 0.5, "the recording has its own timeline, start_time " + p.format.start_time);
  assert.ok(firstFrameIsKey(buf), "the file starts with a keyframe");
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .q").classList.contains("off")`), false);
});

test("recording a live stream through MSE, with capture from the start of the page and the indicator while the bars are hidden", async () => {
  const { identifier } = await page.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(path.join(import.meta.dirname, "..", "..", "dist", "capture.js"), "utf8") });
  await open("hls-live.html");
  await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  await page.waitFor(`document.getElementById("vid").currentTime > 1`, 15000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 4000);
  await clickRec();
  await page.waitFor(`window.__gafferRecording === 1 && Object.values(window.__gafferFiles)[0]?.size > 20000`, 15000);
  assert.match(await recText(), /^⏺ \d+:\d\d · \d+\.\d MB$/);
  await page.move(5, 5);
  await page.waitFor(`getComputedStyle(document.getElementById("vu-rec")).display !== "none"`, 4000);
  assert.match(await page.eval(`document.getElementById("vu-rec").textContent`), /^● \d+:\d\d$/);
  await stopRec();
  const [f] = await finished();
  const p = probe(await fileBytes(f.name));
  assert.deepEqual(kinds(p), ["audio:aac", "video:h264"]);
  assert.ok(+p.format.start_time < 0.5, "the recording has its own timeline, start_time " + p.format.start_time);
  assert.ok(+p.format.duration < 30, "duration " + p.format.duration);
  assert.equal(await page.eval(`"__gafferRecording" in window`), false);
});

test("fallback: a canvas stream is recorded with MediaRecorder", async () => {
  await open("canvas.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 4000);
  await clickRec();
  await page.waitFor(`document.getElementById("vu-osd").textContent === ${JSON.stringify(t("direct.record.reencoded"))}`, 4000);
  await page.waitFor(`Object.values(window.__gafferFiles)[0]?.size > 1000`, 8000);
  await stopRec();
  const [f] = await finished();
  const p = probe(await fileBytes(f.name), f.name.split(".").pop());
  assert.equal(p.streams[0].codec_type, "video");
});

test("policy: encrypted HLS and DRM disable the button with the reason", async () => {
  for (const [file, reason] of [["hls-encrypted.html", "direct.record.reason.encrypted"], ["drm.html", "direct.record.reason.drm"]]) {
    await open(file);
    const want = t("direct.record.blocked", { reason: t(reason) });
    await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(want)}`, 6000);
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .rec").classList.contains("off")`), true);
    await clickRec();
    assert.equal(await osd(), want);
    assert.deepEqual(await files(), []);
  }
});

test("policy: on a blocked site there is no record or download button, the rest of Direct works", async () => {
  for (const file of ["video.html", "hls.html"]) {
    await open(file, { setup: `window.__gafferBlockedHosts = ["127.0.0.1"]` });
    await page.waitFor(`!!document.querySelector("#video-ultimate-top .rec")`, 3000);
    await page.sleep(300);
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .rec").classList.contains("gone")`), true, file);
    assert.equal(await page.eval(`getComputedStyle(document.querySelector("#video-ultimate-top .rec")).display`), "none", file);
    assert.equal(await page.eval(`document.getElementById("vu-rec").classList.contains("going")`), false, file);
    assert.ok((await page.eval(`[...document.querySelectorAll("#video-ultimate-top .toprow button")].filter((b) => !b.classList.contains("gone")).length`)) > 0, file);
    assert.ok(await page.eval(`!!document.getElementById("video-ultimate-bar")`), file);
    assert.deepEqual(await files(), []);
  }
});

test("policy: a signal during a recording stops it and keeps the file", async () => {
  await open("canvas.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 4000);
  await clickRec();
  await page.waitFor(`Object.values(window.__gafferFiles)[0]?.size > 1000`, 8000);
  await page.eval(`Object.defineProperty(document.getElementById("vid"), "mediaKeys", { configurable: true, get: () => ({}) })`);
  const [f] = await finished();
  assert.equal(f.closed, true);
  assert.ok(f.size > 1000);
  await page.waitFor(`document.getElementById("vu-osd").textContent === ${JSON.stringify(t("direct.record.stopped", { reason: t("direct.record.reason.drm") }))}`, 4000);
});

test("nodownload is a warning: the download stays possible and the notice always mentions it", async () => {
  await open("nodownload.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 4000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .rec").classList.contains("off")`), false);
  await clickRec();
  await page.waitFor(`document.querySelector("#vu-notice .txt")?.textContent === ${JSON.stringify(t("direct.download.notice") + " " + t("direct.record.notice.nodownload"))}`, 2000);
  assert.equal(await page.eval(`document.querySelector("#vu-notice button.go").textContent`), t("direct.download.notice.download"));
  await page.click("#vu-notice button.go");
  const [f] = await finished();
  assert.equal(f.closed, true);
});

test("notice: shown before the first recording, Cancel does nothing, the checkbox remembers the choice, stopping asks for confirmation", async () => {
  await open("canvas.html", { remember: false });
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 4000);
  await clickRec();
  await page.waitFor(`document.querySelector("#vu-notice .txt")?.textContent === ${JSON.stringify(t("direct.record.notice"))}`, 2000);
  await page.click("#vu-notice button:not(.go)");
  assert.equal(await page.eval(`!!document.getElementById("vu-notice")`), false);
  assert.deepEqual(await files(), []);
  assert.equal(await page.eval(`document.getElementById("vid").paused`), false);
  await clickRec();
  await page.click("#vu-notice input");
  await page.click("#vu-notice button.go");
  await page.waitFor(`Object.values(window.__gafferFiles)[0]?.size > 0`, 8000);
  assert.equal(await page.eval(`localStorage.getItem("vu-rec-ok")`), "1");
  await clickRec();
  await page.waitFor(`document.querySelector("#vu-notice .txt")?.textContent === ${JSON.stringify(t("direct.record.confirm"))}`, 2000);
  await page.click("#vu-notice button:not(.go)");
  assert.equal(await page.eval(`window.__gafferRecording`), 1);
  assert.deepEqual((await files()).map((f) => f.closed), [false]);
  await stopRec();
  await finished();
});

test("closing Direct during a recording closes the file and restores everything", async () => {
  await open("canvas.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 4000);
  await clickRec();
  await page.waitFor(`Object.values(window.__gafferFiles)[0]?.size > 1000`, 8000);
  await page.eval(`window.__vuClose()`);
  const [f] = await finished();
  assert.equal(f.closed, true);
  assert.equal(await page.eval(`!!document.getElementById("vu-rec") || !!document.getElementById("vu-notice")`), false);
  assert.equal(await page.eval(`!window.__gafferCapture && /\\[native code\\]/.test(SourceBuffer.prototype.appendBuffer.toString())`), true);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("cancelling a download removes the partial file", async () => {
  await open("hls-fmp4.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.download.tip"))}`, 8000);
  await page.eval(`(() => { const f = window.fetch; window.fetch = (u, o) => /seg0[1-9]/.test(String(u)) ? new Promise((r) => setTimeout(r, 400)).then(() => f(u, o)) : f(u, o); })()`);
  await clickRec();
  await page.waitFor(`/^⬇ \\d+/.test(document.querySelector("#video-ultimate-top .rec").textContent)`, 4000);
  await stopRec();
  const [f] = await finished();
  assert.equal(f.aborted, true);
  assert.equal(await osd(), t("direct.download.cancelled"));
});
