import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { launch } from "./harness.js";
import { t } from "../../src/shared/i18n.js";

let page;
before(async () => { page = await launch(); });
after(async () => { await page?.close(); });

const report = () => page.eval(`document.querySelector("#vu-analyse textarea").value`);
const panelButton = (text) => `[...document.querySelectorAll("#vu-analyse button")].find((b) => b.textContent === ${JSON.stringify(text)})`;

async function clickPanel(text) {
  const [x, y] = await page.eval(`(() => { const r = ${panelButton(text)}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.clickAt(x, y);
}

// dev: started as from Gaffer (dev), which adds the ffmpeg commands (SPEC §12.3).
async function inspect(file, { dev = false } = {}) {
  await page.open(file);
  await page.sleep(500);
  await page.eval("window.__track.mark()");
  if (dev) await page.eval(`window.__gafferInspect = { shell: "1.0.0", dev: true }`);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  return report();
}

test("report: header, video elements and network", async () => {
  const r = await inspect("video.html");
  assert.match(r, /^Gaffer Inspect \d\d-\d\d-\d{4} \d\d:\d\d\n/);
  assert.match(r, /\nPage: http:\/\/127\.0\.0\.1:\d+\/video\.html\n/);
  assert.ok(r.includes("\n" + t("inspect.report.started", { how: t("inspect.report.started.bookmarklet") }) + "\n"), r);
  assert.match(r, /\nBrowser: Chrome \d+\.[\d.]+, window \d+x\d+ at pixel ratio [\d.]+, language [a-zA-Z-]+\n/);
  assert.match(r, /== Video elements: 1\n#0 640x360 on screen, picture 640x360, playing, source: http:\/\/127\.0\.0\.1:\d+\/fixtures\/media\/v360\.mp4/);
  assert.match(r, /ancestors: div#player\.player < body < html/);
  assert.match(r, /== React around the player \(ancestors\)\n#0: no React found on the ancestors/);
  assert.match(r, /== Known player libraries\nnone found as a global variable/);
  assert.match(r, /== Global objects that look like a player\nnone/);
  assert.match(r, /== Iframes\nnone/);
  assert.match(r, /== Network\nManifests \(0\):/);
  assert.match(r, /Segments \/ video files \(\d+\), latest examples:\n {2}http:\/\/127\.0\.0\.1:\d+\/fixtures\/media\/v360\.mp4/);
  assert.match(r, /Resolution hints in segment URLs: 360/);
  assert.equal(await page.eval(`document.querySelector("#vu-analyse div").textContent`), "Gaffer Inspect");
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#vu-analyse button")].map((b) => b.textContent)`), [t("inspect.button.monitor"), t("inspect.button.report"), t("inspect.button.close")]);
  assert.equal(await page.eval(`document.querySelector("#vu-analyse").lastElementChild.textContent`), t("inspect.issue.warning"));
});

test("report an issue: copies the report and opens a new issue for this site", async () => {
  await inspect("video.html");
  await page.eval(`window.open = (url, target, features) => { window.__opened = { url, target, features }; return null; }`);
  await clickPanel(t("inspect.button.report"));
  await page.waitFor("!!window.__opened", 3000);
  const opened = await page.eval("window.__opened");
  const u = new URL(opened.url);
  assert.equal(u.origin + u.pathname, "https://github.com/henzeb/gaffer/issues/new");
  assert.equal(u.searchParams.get("template"), "inspect.yml");
  assert.equal(u.searchParams.get("title"), "Inspect: 127.0.0.1");
  assert.equal(u.searchParams.get("site"), "127.0.0.1");
  assert.equal(u.searchParams.get("report"), null);
  assert.equal(opened.target, "_blank");
  const label = await page.eval(`[...document.querySelectorAll("#vu-analyse button")][1].textContent`);
  assert.ok([t("inspect.button.reported"), t("inspect.button.copyManually")].includes(label), label);
});

test("started by the shell: its version in the header, Copy only in the development version", async () => {
  for (const dev of [false, true]) {
    await page.open("video.html");
    await page.sleep(300);
    await page.eval(`window.__gafferInspect = { shell: "1.2.3", dev: ${dev} }`);
    await page.run("inspect");
    await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
    const r = await report();
    const how = dev ? t("inspect.report.started.dev") : t("inspect.report.started.extension", { shell: "1.2.3" });
    assert.ok(r.includes("\n" + t("inspect.report.started", { how }) + "\n"), r);
    assert.equal(await page.eval("window.__gafferInspect"), undefined);
    const buttons = await page.eval(`[...document.querySelectorAll("#vu-analyse button")].map((b) => b.textContent)`);
    assert.deepEqual(buttons, dev ? [t("inspect.button.monitor"), t("inspect.button.report"), t("inspect.button.copy"), t("inspect.button.close")] : [t("inspect.button.monitor"), t("inspect.button.report"), t("inspect.button.close")]);
    await clickPanel(t("inspect.button.close"));
  }
});

test("report: <source> elements", async () => {
  const r = await inspect("sources.html");
  assert.match(r, /<source> http:\/\/127\.0\.0\.1:\d+\/fixtures\/media\/v720\.mp4 type=video\/mp4 label=720p/);
  assert.match(r, /<source> http:\/\/127\.0\.0\.1:\d+\/fixtures\/media\/v360\.mp4 type=video\/mp4 label=360p/);
});

test("report: hls.js player, global objects and HLS manifest", async () => {
  const r = await inspect("hls.html?global");
  assert.match(r, /hls\.js \(window\.Hls\)/);
  assert.match(r, /window\.player: hls\.js-like \(levels\/currentLevel\), \.media is a video/);
  assert.match(r, /Manifests \(1\):\n {2}http:\/\/127\.0\.0\.1:\d+\/streams\/master\.m3u8/);
  assert.match(r, /== Manifest content\n {2}http:\/\/127\.0\.0\.1:\d+\/streams\/master\.m3u8\n {3}HLS master playlist with 3 variants:\n {6}1920x1080 @ 3000 kbps codecs avc1\.640028,mp4a\.40\.2\n {6}1280x720 @ 1500 kbps/);
});

test("report: real hls.js", async () => {
  await page.open("hls-real.html");
  await page.waitFor(`document.getElementById("vid").videoHeight > 0`, 10000);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  const r = await report();
  assert.match(r, /source: blob: \(MediaSource, streamed by a JS player\)/);
  assert.match(r, /hls\.js \(window\.Hls\)/);
  assert.match(r, /media\/hls\/master\.m3u8\n {3}HLS master playlist with 3 variants:\n {6}1920x1080 @ 3000 kbps codecs avc1\.42c028,mp4a\.40\.2/);
  assert.match(r, /\.ts\n/);
});

test("report: encrypted HLS is a media playlist", async () => {
  const r = await inspect("hls-encrypted.html");
  assert.match(r, /encrypted\.m3u8\n {3}HLS media playlist \(one quality, no master\)/);
});

test("report: DASH manifest", async () => {
  const r = await inspect("dash.html");
  assert.match(r, /stream\.mpd\n {3}DASH manifest with 3 video representations: 1080p, 720p, 360p/);
});

test("recording: the facts per video; commands with Referer and User-Agent only in the development version", async () => {
  let r = await inspect("hls.html?global");
  assert.doesNotMatch(r, /ffmpeg|Recording commands/);
  r = await inspect("hls.html?global", { dev: true });
  assert.match(r, new RegExp("== " + t("inspect.record.title") + "\n" + t("inspect.record.warning").replace(/[.()]/g, "\\$&")));
  assert.match(r, /#1 source: /);
  assert.match(r, /DRM \(mediaKeys\): none/);
  assert.match(r, /streams\/master\.m3u8 — HLS master, 3 variants, 0 audio renditions/);
  assert.match(r, /ffmpeg -user_agent "[^"]+" -referer "http:\/\/127\.0\.0\.1:\d+\/hls\.html\?global" -i "http:\/\/127\.0\.0\.1:\d+\/streams\/master\.m3u8" -c copy out\.mp4/);
  assert.doesNotMatch(r, /yt-dlp/);
});

test("recording: on a blocked site the section only says that recording is not available", async () => {
  await page.open("hls.html?global");
  await page.sleep(500);
  await page.eval(`window.__gafferBlockedHosts = ["127.0.0.1"]`);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  const r = await report();
  assert.match(r, new RegExp("== " + t("inspect.record.title") + "\n" + t("inspect.record.blocked") + "(\\n|$)"));
  assert.doesNotMatch(r, /ffmpeg -user_agent|yt-dlp|Recording commands/);
  assert.doesNotMatch(r, new RegExp(t("inspect.record.warning").slice(0, 30).replace(/[.()]/g, "\\$&")));
});

test("recording: no command for an encrypted stream or DRM, nodownload and site links are reported", async () => {
  let r = await inspect("hls-encrypted.html", { dev: true });
  assert.match(r, /encrypted\.m3u8 — HLS media playlist, 10 segments, ts, VOD · encrypted: #EXT-X-KEY:METHOD=AES-128/);
  assert.match(r, new RegExp(t("inspect.record.noCommand", { reason: t("inspect.record.reason.encrypted") })));
  assert.doesNotMatch(r, /ffmpeg -user_agent/);
  r = await inspect("drm.html");
  assert.match(r, /DRM \(mediaKeys\): yes, org\.w3\.clearkey/);
  r = await inspect("nodownload.html");
  assert.match(r, /controlslist: nodownload \(the browser's download option is off/);
  await page.open("video.html");
  await page.eval(`document.body.insertAdjacentHTML("beforeend", '<a href="/fixtures/media/v360.mp4" download>Download video</a>')`);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  r = await report();
  assert.match(r, /Download links or buttons of the site itself \(1\):\n {3}<a download> Download video → http:\/\/127\.0\.0\.1:\d+\/fixtures\/media\/v360\.mp4/);
  assert.match(r, /source: plain file http:\/\/127\.0\.0\.1:\d+\/fixtures\/media\/v360\.mp4; downloadable as a file/);
});

test("report: iframe from another domain", async () => {
  const r = await inspect("iframe.html");
  assert.match(r, /== Iframes\n {2}720x440 http:\/\/localhost:\d+\/video\.html \(other domain\)/);
});

test("report: quality-like menu items in the player", async () => {
  await page.open("portal.html");
  await page.eval(`document.getElementById("player").insertAdjacentHTML("beforeend", "<ul class=menu><li>Auto</li><li>1080p</li><li>720p</li><li>360p</li><li>Subtitles</li></ul>")`);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`);
  assert.match(await report(), /Quality-like menu items in player #0: Auto \| 1080p \| 720p \| 360p/);
});

test("running again replaces the panel", async () => {
  await inspect("video.html");
  await page.run("inspect");
  await page.sleep(300);
  assert.equal(await page.eval(`document.querySelectorAll("#vu-analyse").length`), 1);
});

test("closing removes the panel", async () => {
  await inspect("video.html");
  await clickPanel(t("inspect.button.close"));
  assert.equal(await page.eval(`!!document.getElementById("vu-analyse")`), false);
});

test("monitor: DOM, clicks, network and video, then everything restored", async () => {
  await inspect("portal.html");
  await clickPanel(t("inspect.button.monitor"));
  assert.equal(await page.eval(`${panelButton(t("inspect.button.stop"))} !== undefined`), true);
  assert.equal(await page.eval(`window.fetch === window.__orig.fetch`), false);
  await page.click("#qbtn");
  await page.sleep(300);
  await page.click('.tooltip [data-resolution="720p"]');
  await page.waitFor(`document.getElementById("vid").videoHeight === 720`, 4000);
  await page.eval(`fetch("/streams/master.m3u8").then((r) => r.text())`);
  await page.eval(`new Promise((ok) => { const x = new XMLHttpRequest(); x.open("GET", "/streams/stream.mpd"); x.onload = ok; x.send(); })`);
  await page.eval(`document.getElementById("vid").dispatchEvent(new MouseEvent("click", { bubbles: true }))`);
  await page.sleep(400);
  assert.match(await page.eval(`document.querySelector("#vu-analyse div:nth-child(2)").textContent`), /^\d+ events recorded$/);
  await clickPanel(t("inspect.button.stop"));
  const r = await report();
  assert.match(r, /\n== Monitor\n\+\d+\.\d s {2}#0 start: video 640x360\n/);
  assert.match(r, /\n {3}box: 40,40 640x360; display block, visibility visible, opacity 1, transform none; ended: no\n/);
  assert.match(r, /pointerdown on "⚙" {2}button#qbtn/);
  assert.match(r, /\+ click\n/);
  assert.match(r, /appeared: Auto 1080p720p360p \| Auto \| 1080p \| 720p \| 360p\n\+\d+\.\d s {5}location: div\.tooltip/);
  assert.match(r, /pointerdown on "720p" {2}div\.item\n\+\d+\.\d s {5}attributes: data-resolution=720p/);
  assert.match(r, /#0 picture now 1280x720/);
  assert.match(r, /manifest content http:\/\/127\.0\.0\.1:\d+\/streams\/master\.m3u8:\n\+\d+\.\d s {5}HLS master playlist with 3 variants:/);
  assert.match(r, /manifest content http:\/\/127\.0\.0\.1:\d+\/streams\/stream\.mpd:\n\+\d+\.\d s {5}DASH manifest with 3 video representations/);
  assert.match(r, /click on "" {2}video#vid {2}\(from code\)/);
  assert.equal(await page.eval(`window.fetch === window.__orig.fetch`), true);
  assert.equal(await page.eval(`XMLHttpRequest.prototype.open === window.__orig.open && XMLHttpRequest.prototype.send === window.__orig.send`), true);
  assert.deepEqual(await page.eval("window.__track.leaks()"), { listeners: [], intervals: 0 });
});

test("monitor stops on close", async () => {
  await inspect("video.html");
  await clickPanel(t("inspect.button.monitor"));
  await clickPanel(t("inspect.button.close"));
  assert.equal(await page.eval(`window.fetch === window.__orig.fetch`), true);
  assert.deepEqual(await page.eval("window.__track.leaks()"), { listeners: [], intervals: 0 });
});

test("together with Direct: the panel stays clickable over the video", async () => {
  await page.open("video.html");
  await page.run("direct");
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`);
  await page.waitFor(`!document.getElementById("vid").paused`);
  const [x, y] = await page.eval(`(() => { const a = document.querySelector("#vu-analyse textarea").getBoundingClientRect(), v = document.getElementById("vid").getBoundingClientRect(); return [(Math.max(a.left, v.left) + Math.min(a.right, v.right)) / 2, (Math.max(a.top, v.top) + Math.min(a.bottom, v.bottom)) / 2]; })()`);
  assert.equal(await page.eval(`document.elementFromPoint(${x}, ${y}).tagName`), "TEXTAREA", "the panel lies over the video");
  await page.clickAt(x, y);
  await page.sleep(450);
  assert.equal(await page.eval(`document.getElementById("vid").paused`), false, "the click did not go to Direct");
  assert.equal(await page.eval(`document.activeElement.tagName`), "TEXTAREA");
  await clickPanel(t("inspect.button.close"));
  assert.equal(await page.eval(`!!document.getElementById("vu-analyse")`), false);
});

test("report: tracks per video with their source, and what Direct found", async () => {
  const r = await inspect("tracks.html?type=plyr");
  assert.ok(r.includes("== " + t("inspect.report.tracks.title") + "\n" + t("inspect.report.tracks.text", { index: 0, source: "Plyr", list: "English [en], Nederlands [nl]" })), r);
  await page.open("players.html?type=jwplayer");
  await page.run("direct");
  await page.waitFor(`document.querySelector("#video-ultimate-top .q")?.textContent === "1080p"`, 12000);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  const d = await report();
  assert.ok(d.includes("   " + t("inspect.report.direct.quality", { source: "JW Player", list: "[1080p], 720p, 360p" })), d);
  assert.ok(d.includes(t("inspect.report.tracks.none", { index: 0 })), d);
  assert.match(d, /\n {3}top bar \d+–\d+, bottom bar \d+–\d+ \(window height \d+\), z-index \d+\n/);
  await page.eval("window.__vuClose()");
});

async function withDirect(file, ready = "true") {
  await page.open(file);
  await page.run("direct");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await page.waitFor(`!document.getElementById("vid").paused`, 5000);
  await page.waitFor(ready, 8000);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  return report();
}

test("report: what Direct itself knows about the video", async () => {
  const r = await withDirect("video.html");
  const line = (text) => assert.ok(r.includes("\n   " + text + "\n"), text + "\n\n" + r);
  assert.match(r, /\n {3}Direct \d\d-\d\d-\d{4} \d\d:\d\d from the bookmarklet, capture active: yes\n/);
  line(t("inspect.report.direct.errors.none"));
  assert.match(r, /\n {3}live: no \(playable window 0\.0–\d+\.\d\)\n/);
  assert.match(r, /\n {3}same level: off \(audio \w+\)\n/);
  line(t("inspect.report.direct.qualityState", { max: "yes", user: "no", bad: t("inspect.report.nothing") }));
  line(t("inspect.report.direct.chapters.none"));
  line(t("inspect.report.direct.light", { brightness: 100, contrast: 100 }));
  assert.match(r, /\n {3}playback: pause held no, spinner no, readyState 4, \d+\.\d s buffered ahead, paused by the buffer guard no\n/);
  line(t("inspect.report.direct.nav.page", { count: 1, prev: "no", next: "no" }));
  assert.ok(r.includes("\n   " + t("inspect.report.direct.share.system") + "\n") || r.includes("\n   " + t("inspect.report.direct.share.copy") + "\n"), r);
  await page.eval("window.__vuClose()");
});

test("report: why Direct takes a stream for live, and chapters with their source", async () => {
  let r = await withDirect("live.html?flag");
  assert.match(r, /\n {3}live: yes, the player marks it live; playable window [\d.]+–[\d.]+, the player's own delay ([\d.]+|\?) s, behind live ([\d.]+|\?) s\n/);
  await page.eval("window.__vuClose()");
  r = await withDirect("live.html");
  assert.match(r, /\n {3}live: yes, the duration is Infinity;/);
  await page.eval("window.__vuClose()");
  r = await withDirect("tracks.html?type=jwplayer&chapters=jwplayer", `document.querySelectorAll("#video-ultimate-bar .chaps i").length === 2`);
  assert.ok(r.includes("\n   " + t("inspect.report.direct.chapters", { source: "JW Player", count: 3 }) + "\n"), r);
  await page.eval("window.__vuClose()");
});

test("monitor: also what Direct does, and seeking and the speed", async () => {
  await withDirect("video.html");
  await clickPanel(t("inspect.button.monitor"));
  await page.hover("#vid");
  await page.key(">");
  await page.key("l");
  await page.sleep(400);
  await clickPanel(t("inspect.button.stop"));
  const r = await report();
  assert.match(r, /#0 Direct: message: 1\.25×\n/);
  assert.match(r, /#0 speed now 1\.25×\n/);
  assert.match(r, /#0 seeks to [\d.]+ s\n/);
  assert.match(r, /#0 seek done at [\d.]+ s(\n|$)/);
  await page.eval("window.__vuClose()");
});

test("monitor: every error and warning of the page, also the unexpected ones, then the console restored", async () => {
  await inspect("video.html");
  await page.eval("window.__ce = console.error; window.__cw = console.warn");
  await clickPanel(t("inspect.button.monitor"));
  await page.eval(`setTimeout(() => { throw new Error("boom in a timer"); }, 0)`);
  await page.eval(`setTimeout(() => { Promise.reject(new Error("nobody catches this")); }, 0)`);
  await page.eval(`console.warn("careful", { a: 1 }); console.error(new TypeError("bad thing")); console.error("Failed to load https://cdn.example.com/a.m3u8?token=secret123 now")`);
  await page.eval(`(() => { const i = document.createElement("img"); i.src = "/missing.png"; document.body.appendChild(i); })()`);
  await page.sleep(600);
  await clickPanel(t("inspect.button.stop"));
  const r = await report();
  // Code run through the test harness has no file; a script of the page would show file and line.
  assert.match(r, /page error: Error: boom in a timer( \(\S+:\d+\))?\n/);
  assert.match(r, /unhandled promise rejection: Error: nobody catches this/);
  assert.match(r, /console\.warn: careful \{"a":1\}/);
  assert.match(r, /console\.error: TypeError: bad thing/);
  assert.match(r, /console\.error: Failed to load https:\/\/cdn\.example\.com\/a\.m3u8\?… now/);
  assert.doesNotMatch(r, /secret123/);
  assert.match(r, /failed to load: img \S*missing\.png/);
  assert.equal(await page.eval("console.error === window.__ce && console.warn === window.__cw"), true);
  assert.deepEqual(await page.eval("window.__track.leaks()"), { listeners: [], intervals: 0 });
});

test("an error in a handler of Direct is caught, kept per part and told to the monitor", async () => {
  await withDirect("video.html");
  await page.eval(`Object.defineProperty(document.getElementById("vid"), "playbackRate", { configurable: true, get: () => 1, set() { throw new Error("rate broken"); } })`);
  await clickPanel(t("inspect.button.monitor"));
  await page.hover("#vid");
  await page.key(">");
  await page.sleep(300);
  await clickPanel(t("inspect.button.stop"));
  let r = await report();
  assert.match(r, /#0 Direct: error in keyboard: rate broken/);
  assert.match(r, /console\.error: \[Gaffer Direct\] keyboard Error: rate broken/);
  await clickPanel(t("inspect.button.close"));
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  r = await report();
  assert.ok(r.includes("\n   " + t("inspect.report.direct.errors", { list: "keyboard: rate broken (1×)" }) + "\n"), r);
  await page.eval(`delete document.getElementById("vid").playbackRate`);
  await page.eval("window.__vuClose()");
});

test("monitor: Direct's clicks on the site's buttons", async () => {
  await page.open("feed-sound.html");
  await page.waitFor(`document.getElementById("v0").currentTime > 0.1`, 5000);
  await page.run("direct");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  await clickPanel(t("inspect.button.monitor"));
  await page.hover("#v0");
  await page.key("m");
  await page.waitFor(`!document.getElementById("v0").muted`, 2000);
  await page.sleep(300);
  await clickPanel(t("inspect.button.stop"));
  const r = await report();
  assert.match(r, /#0 Direct: clicks the site's button "[^"]+"/);
  assert.match(r, /#0 volume now \d+/);
  await page.eval("window.__vuClose()");
});

test("a report too long for an issue is saved as a file to attach", async () => {
  await inspect("video.html");
  await clickPanel(t("inspect.button.monitor"));
  await page.eval(`for (let i = 0; i < 400; i++) console.warn("line " + i + " " + "x".repeat(250))`);
  await page.sleep(300);
  await clickPanel(t("inspect.button.stop"));
  await page.eval(`window.open = (url) => { window.__opened = url; return null; }; HTMLAnchorElement.prototype.click = function () { window.__saved = { name: this.download, href: this.href }; }`);
  await clickPanel(t("inspect.button.report"));
  await page.waitFor("!!window.__opened", 3000);
  const saved = await page.eval("window.__saved");
  assert.equal(new URL(await page.eval("window.__opened")).searchParams.get("report"), t("inspect.issue.reportFile", { name: saved.name }));
  assert.match(saved.name, /^gaffer-inspect-127\.0\.0\.1-\d{4}-\d\d-\d\d\.txt$/);
  assert.match(saved.href, /^blob:/);
  assert.equal(await page.eval(`[...document.querySelectorAll("#vu-analyse button")][1].textContent`), t("inspect.button.saved"));
});

test("errors since the page loaded: not known without Gaffer, kept by capture from its start, and gone on close", async () => {
  let r = await inspect("video.html");
  assert.ok(r.includes("== " + t("inspect.report.pageErrors.title") + "\n" + t("inspect.report.pageErrors.unknown")), r);
  await page.open("video.html");
  await page.run("direct");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await page.eval(`setTimeout(() => { throw new Error("kept by capture https://cdn.example.com/x.m3u8?token=secret123"); }, 0)`);
  await page.sleep(300);
  await page.run("inspect");
  await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  r = await report();
  assert.match(r, /\n\+\d+\.\d s {2}page error: Error: kept by capture https:\/\/cdn\.example\.com\/x\.m3u8\?…/);
  assert.doesNotMatch(r, /secret123/);
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval("window.__gafferErrors"), null);
});

test("monitor: addresses in the attributes of a clicked element lose their query", async () => {
  await inspect("video.html");
  await page.eval(`document.body.insertAdjacentHTML("beforeend", '<button id="tok" data-url="https://cdn.example.com/a.mp4?sig=secret123" style="position:fixed;left:10px;bottom:10px">Go</button>')`);
  await clickPanel(t("inspect.button.monitor"));
  await page.click("#tok");
  await page.sleep(300);
  await clickPanel(t("inspect.button.stop"));
  const r = await report();
  assert.match(r, /attributes: data-url=https:\/\/cdn\.example\.com\/a\.mp4\?…/);
  assert.doesNotMatch(r, /secret123/);
});
