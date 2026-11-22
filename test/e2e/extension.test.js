import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { launch } from "./harness.js";
import { t } from "../../src/shared/i18n.js";
import { buildExtension } from "../../build/extension.js";

const root = path.join(import.meta.dirname, "..", "..");
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-ext-"));
const out = path.join(extDir, "gaffer");
const bundle = (name) => fs.readFileSync(path.join(root, "dist", name + ".js"), "utf8").trim();
// Direct marked with a number, to see which version of the extension runs.
const marked = (n) => (name) => (name === "direct" ? bundle("direct") + ";window.__gafferRelease=" + n + ";" : bundle(name)) + "\n";

let page;

before(async () => {
  page = await launch({
    extension: () => buildExtension(out, { grantAllSites: true, modules: marked(1) }),
    args: ["--host-resolver-rules=MAP *.test 127.0.0.1", "--disable-features=HttpsUpgrades"],
  });
});

after(async () => {
  await page?.close();
  fs.rmSync(extDir, { recursive: true, force: true });
});

// A new version of the extension from the Web Store (§4.6): the new files are
// in place, Chrome says an update is available, and Gaffer reloads itself when
// no recording runs.
async function newVersion(n) {
  fs.writeFileSync(path.join(out, "modules", "direct.js"), marked(n)("direct"));
  await page.inWorker(`(chrome.runtime.onUpdateAvailable.dispatch({ version: "1.0.${n}" }), true)`).catch(() => {});
}

const hasDirect = (p = page) => p.eval(`!!document.getElementById("video-ultimate-bar")`);
const registered = () => page.inWorker(`chrome.scripting.getRegisteredContentScripts().then((s) => s.map((x) => x.id + ":" + x.runAt).sort())`);
const badge = (url) => page.inWorker(`chrome.tabs.query({}).then((t) => chrome.action.getBadgeText({ tabId: t.find((x) => x.url === ${JSON.stringify(url)}).id }))`);
const watchIcons = () => page.inWorker(`globalThis.__icons ??= (() => { const icons = {}; const set = chrome.action.setIcon.bind(chrome.action); chrome.action.setIcon = (d) => { icons[d.tabId] = d.path[16]; return set(d); }; return icons; })(), true`);
const icon = (url) => page.inWorker(`chrome.tabs.query({}).then((t) => ({ "icons/icon-16.png": "on", "icons/icon-off-16.png": "off" })[globalThis.__icons?.[t.find((x) => x.url === ${JSON.stringify(url)}).id]] ?? null)`);
const inFrames = (url, code) => page.inWorker(`chrome.tabs.query({}).then((t) => chrome.scripting.executeScript({ target: { tabId: t.find((x) => x.url === ${JSON.stringify(url)}).id, allFrames: true }, world: "MAIN", func: (c) => (0, eval)(c), args: [${JSON.stringify(code)}] })).then((r) => r.map((x) => x.result))`);
const framesWithDirect = async (url) => (await inFrames(url, "location.hostname + ':' + (typeof window.__vuClose === 'function')")).sort();

const settled = () => page.sleep(500);

async function until(fn, timeout = 5000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await page.sleep(50);
  }
  throw new Error("timeout, last value: " + JSON.stringify(last));
}

async function popupFor(url, fn) {
  const popup = await page.popup(url);
  try {
    return await fn(popup);
  } finally {
    await popup.close();
  }
}

async function toggle(url, on) {
  await popupFor(url, async (popup) => {
    assert.equal(await popup.eval(`document.getElementById("toggle").checked`), !on);
    await popup.click("#toggle");
    await popup.waitFor(`document.getElementById("toggle").checked === ${on}`);
  });
}

test("install: the modules are in the package and the popup shows the version", async () => {
  await page.open("video.html");
  await popupFor(page.url("video.html"), async (popup) => {
    assert.equal(await popup.eval(`document.getElementById("version").textContent`), "1.0.0");
    assert.equal(await popup.eval(`document.getElementById("versions").hidden`), false);
    assert.equal(await popup.eval(`document.getElementById("dev").hidden`), true);
    assert.equal(await popup.eval(`document.getElementById("noscripts").hidden`), true);
    assert.equal(await popup.eval(`document.getElementById("update").hidden`), true);
    assert.equal(await popup.eval(`document.getElementById("host").textContent`), "127.0.0.1");
    assert.equal(await popup.eval(`document.getElementById("toggle").disabled`), false);
  });
  assert.deepEqual(await registered(), []);
});

test("off by default: Direct does not start on a page with video", async () => {
  await watchIcons();
  await page.open("video.html");
  await settled();
  assert.equal(await hasDirect(), false);
  assert.equal(await icon(page.url("video.html")), "off");
  assert.equal(await badge(page.url("video.html")), "");
});

test("turning on and off: Direct starts right away and turning it off restores the page completely", async () => {
  await watchIcons();
  await page.open("video.html");
  const before = await page.eval("__snapshot()");
  await page.eval("window.__track.mark()");
  await toggle(page.url("video.html"), true);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`);
  assert.equal(await page.eval("window.__gafferRelease"), 1);
  assert.equal(await icon(page.url("video.html")), "on");
  assert.equal(await badge(page.url("video.html")), "");
  await page.hover("#vid");
  await page.key("r");
  await toggle(page.url("video.html"), false);
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`);
  const afterSnap = await page.eval("__snapshot()");
  assert.equal(afterSnap.html, before.html);
  assert.deepEqual(afterSnap.vids, before.vids);
  assert.deepEqual(await page.eval("window.__track.leaks()"), { listeners: [], intervals: 0 });
  assert.equal(await page.eval("window.__vuClose"), null);
  assert.equal(await icon(page.url("video.html")), "off");
});

test("turning on: Direct starts again after a reload, also in an iframe from another domain, and not on another site", async () => {
  await page.open("video.html");
  await toggle(page.url("video.html"), true);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`);
  await page.open("video.html");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await page.open("iframe.html");
  await until(async () => JSON.stringify(await framesWithDirect(page.url("iframe.html"))) === JSON.stringify(["127.0.0.1:true", "localhost:true"]));
  await page.open("video.html", { cross: true });
  await settled();
  assert.equal(await hasDirect(), false);
});

test("turning off: after a reload Direct no longer starts", async () => {
  await page.open("video.html");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`);
  await toggle(page.url("video.html"), false);
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`);
  await page.open("video.html");
  await settled();
  assert.equal(await hasDirect(), false);
  assert.deepEqual(await registered(), []);
});

test("a frame of a site that is on, inside a page that is off: Direct does not start there", async () => {
  await page.inWorker(`chrome.storage.sync.set({ "site:localhost": true })`);
  try {
    await page.open("iframe.html");
    await settled();
    assert.deepEqual(await framesWithDirect(page.url("iframe.html")), ["127.0.0.1:false", "localhost:false"]);
  } finally {
    await page.inWorker(`chrome.storage.sync.remove("site:localhost")`);
  }
});

test("inspect: the panel appears on a site that is off", async () => {
  await page.open("video.html");
  await popupFor(page.url("video.html"), async (popup) => {
    await popup.click("#inspect");
    await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  });
  assert.equal(await hasDirect(), false);
  const shell = JSON.parse(fs.readFileSync(new URL("../../extension/manifest.json", import.meta.url), "utf8")).version;
  const r = await page.eval(`document.querySelector("#vu-analyse textarea").value`);
  assert.ok(r.includes("\n" + t("inspect.report.started", { how: t("inspect.report.started.extension", { shell }) }) + "\n"), r);
  assert.equal(await page.eval(`[...document.querySelectorAll("#vu-analyse button")].some((b) => b.textContent === ${JSON.stringify(t("inspect.button.copy"))})`), false);
});

test("update: a new version is applied right away and Direct then runs the new version", async () => {
  await page.open("video.html");
  await toggle(page.url("video.html"), true);
  await page.waitFor(`window.__gafferRelease === 1`);
  await page.open("iframe.html");
  await until(async () => JSON.stringify(await framesWithDirect(page.url("iframe.html"))) === JSON.stringify(["127.0.0.1:true", "localhost:true"]));
  await newVersion(2);
  await page.waitFor(`window.__gafferRelease === 2`, 10000);
  // The page itself has no video; the frame has one, with one set of bars.
  assert.deepEqual((await inFrames(page.url("iframe.html"), "location.hostname + ':' + window.__gafferRelease + ':' + document.querySelectorAll('#video-ultimate-bar').length")).sort(), ["127.0.0.1:2:0", "localhost:2:1"]);
  await page.open("video.html");
  await page.waitFor(`window.__gafferRelease === 2`, 5000);
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-bar").length`), 1);
  await toggle(page.url("video.html"), false);
});

test("subdomain: with foo.test on Direct runs on player.foo.test, and turning it off there turns foo.test off", async () => {
  const main = page.url("video.html", { host: "foo.test" });
  const sub = page.url("video.html", { host: "player.foo.test" });
  await page.open(main);
  await toggle(main, true);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`);
  await page.open(sub);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await popupFor(sub, async (popup) => {
    assert.equal(await popup.eval(`document.getElementById("host").textContent`), "player.foo.test");
    assert.equal(await popup.eval(`document.getElementById("via").hidden`), false);
    assert.equal(await popup.eval(`document.getElementById("via").textContent`), t("popup.via.on", { site: "foo.test" }));
  });
  await toggle(sub, false);
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`);
  assert.deepEqual(await page.inWorker(`chrome.storage.sync.get(null)`), {});
});

test("on by default: Direct starts on every site, an exception turns one site off, and back to off closes Direct everywhere", async () => {
  const a = page.url("video.html");
  const b = page.url("video.html", { cross: true });
  await page.open(a);
  await popupFor(a, async (popup) => {
    assert.equal(await popup.eval(`document.getElementById("default").checked`), false);
    await popup.click("#default");
    await popup.waitFor(`document.getElementById("default").checked && document.getElementById("toggle").checked`);
    assert.equal(await popup.eval(`document.getElementById("via").textContent`), t("popup.via.default"));
  });
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await page.open(b);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await toggle(b, false);
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`);
  assert.deepEqual(await page.inWorker(`chrome.storage.sync.get(null)`), { default: true, "site:localhost": false });
  await page.open(b);
  await settled();
  assert.equal(await hasDirect(), false);
  await page.open(a);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  await popupFor(a, async (popup) => {
    await popup.click("#default");
    await popup.waitFor(`!document.getElementById("default").checked && !document.getElementById("toggle").checked`);
  });
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`, 5000);
  await page.open(a);
  await settled();
  assert.equal(await hasDirect(), false);
  await page.inWorker(`chrome.storage.sync.clear()`);
});

test("level: the same on every site, changed only by the user, and kept in the extension", async () => {
  const at = (host) => page.url("level.html?src=loud").replace("127.0.0.1", host);
  const value = `document.querySelector("#video-ultimate-bar .pval")?.textContent`;
  const stored = () => page.inWorker(`chrome.storage.local.get("level").then((r) => r.level ?? null)`);
  await page.inWorker(`Promise.all([chrome.storage.sync.set({ "site:a.test": true, "site:b.test": true }), chrome.storage.local.set({ level: JSON.stringify({ on: true, value: 40, ref: -20 }) })])`);
  await settled();
  await page.open(at("a.test"));
  await page.waitFor(`${value} === "40"`, 8000);
  // A page that sends the event itself, without an action of the user, changes nothing.
  await page.eval(`document.dispatchEvent(new CustomEvent("gaffer:level-set", { detail: JSON.stringify({ on: true, value: 90 }) }))`);
  await settled();
  assert.equal(await stored(), '{"on":true,"value":40,"ref":-20}');
  await page.open(at("b.test"));
  await page.waitFor(`${value} === "40"`, 8000);
  await page.hover("#vid");
  await page.key("PageDown");
  await until(async () => (await stored()) === '{"on":true,"value":35,"ref":-20}');
  await page.open(at("a.test"));
  await page.waitFor(`${value} === "35"`, 8000);
  // Only the loudness comes later than the action, from the page where it was switched on.
  const spoof = (x) => page.eval(`document.dispatchEvent(new CustomEvent("gaffer:level-set", { detail: ${JSON.stringify(JSON.stringify(x))} }))`);
  await page.sleep(3200);
  await spoof({ on: true, value: 35, ref: -5 });
  await settled();
  assert.equal(await stored(), '{"on":true,"value":35,"ref":-20}');
  await page.hover("#vid");
  await page.click("#video-ultimate-bar .volbtn");
  await page.click("#video-ultimate-bar .lev");
  await until(async () => /"on":false/.test(await stored()));
  await page.click("#video-ultimate-bar .lev");
  await until(async () => /"on":true,"value":35,"ref":-[789]/.test(await stored()));
  await page.sleep(3200);
  await spoof({ on: true, value: 90, ref: -11 });
  await until(async () => (await stored()) === '{"on":true,"value":35,"ref":-11}');
  await page.inWorker(`chrome.storage.local.set({ level: '{"on":true,"value":35,"ref":-20}' })`);
  // Switched on while the page is open: the bridge is there as well.
  await page.inWorker(`chrome.storage.sync.remove("site:a.test")`);
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`, 5000);
  await page.open(at("a.test"));
  await page.eval("localStorage.clear()");
  await page.inWorker(`chrome.storage.sync.set({ "site:a.test": true })`);
  await page.waitFor(`${value} === "35"`, 8000);
  await page.inWorker(`Promise.all([chrome.storage.sync.clear(), chrome.storage.local.remove("level")])`);
});

test("recording: capture runs from the start of the page, an update waits for the recording, and turning off closes the file", async () => {
  const url = page.url("hls-live.html");
  const writer = `(() => { window.__gafferFiles = {}; window.__gafferWriter = (name) => { const f = (window.__gafferFiles[name] = { size: 0, closed: false }); return { name, memory: false, get size() { return f.size; }, write(b) { f.size += b.length; return Promise.resolve(); }, close() { f.closed = true; return Promise.resolve(); }, abort() { return Promise.resolve(); } }; }; localStorage.setItem("vu-rec-ok", "1"); })()`;
  const record = async () => {
    await page.waitFor(`document.querySelector("#video-ultimate-top .rec")?.title === ${JSON.stringify(t("direct.record.tip"))}`, 8000);
    await page.hover("#vid");
    await page.click("#video-ultimate-top .rec");
    // The first bytes can take a while: the live stream gets a segment every 4 s
    // and stalls at its edge until the next one, and MediaRecorder gives data
    // only once the video moves on. How long depends on where the test is
    // against that 4 s clock, so a slow machine needs the room.
    await page.waitFor(`window.__gafferRecording === 1 && Object.values(window.__gafferFiles).some((f) => f.size > 0)`, 30000);
  };
  await page.open(url);
  await toggle(url, true);
  const scripts = ["gaffer-bridge:document_start", "gaffer-capture:127.0.0.1:document_start", "gaffer-direct:127.0.0.1:document_idle"];
  await until(async () => JSON.stringify(await registered()) === JSON.stringify(scripts));
  await page.open(url);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar") && document.getElementById("vid").currentTime > 1`, 15000);
  assert.equal(await page.eval(`(() => { const b = window.__gafferCapture.buffers(document.getElementById("vid")); return b.length === 2 && b.every((e) => !e.late && e.init); })()`), true);
  await page.eval(writer);
  await record();

  await newVersion(5);
  await page.inWorker(`chrome.storage.session.get("updateWaiting").then((r) => r.updateWaiting === true)`).then((w) => assert.equal(w, true));
  assert.equal(await page.eval("window.__gafferRelease"), 2);
  assert.equal(await page.eval("window.__gafferRecording"), 1);
  await page.hover("#vid");
  await page.click("#video-ultimate-top .rec");
  await page.waitFor(`!!document.querySelector("#vu-notice button.go")`, 2000);
  await page.click("#vu-notice button.go");
  await page.waitFor(`window.__gafferRelease === 5`, 10000);
  assert.equal(await page.eval(`Object.values(window.__gafferFiles).every((f) => f.closed)`), true);

  await page.eval(writer);
  await record();
  await toggle(url, false);
  await page.waitFor(`Object.values(window.__gafferFiles).every((f) => f.closed) && !window.__gafferRecording`, 5000);
  assert.equal(await page.eval("window.__vuClose"), null);
  assert.equal(await page.eval("window.__gafferCapture"), null);
});

test("update: a tab that never finishes loading does not hold it up", async () => {
  const stuck = http.createServer((q, r) => {
    r.writeHead(200, { "Content-Type": "text/html" });
    r.write(q.url === "/never" ? "<p>waiting" : "<iframe src=/never></iframe>");
    if (q.url !== "/never") r.end();
  });
  await new Promise((ok) => stuck.listen(0, "127.0.0.1", ok));
  await page.inWorker(`chrome.storage.sync.set({ "site:a.test": true, "site:b.test": true })`);
  const id = await page.inWorker(`chrome.tabs.create({ url: "http://a.test:${stuck.address().port}/", active: false }).then((t) => t.id)`);
  try {
    await page.open(page.url("video.html").replace("127.0.0.1", "b.test"));
    await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 8000);
    await newVersion(6);
    await page.waitFor(`window.__gafferRelease === 6`, 15000);
  } finally {
    await page.inWorker(`chrome.tabs.remove(${id})`);
    stuck.closeAllConnections();
    stuck.close();
    await page.inWorker(`chrome.storage.sync.clear()`);
  }
});

// After the popup (its own tab) the mouse of the harness does not reach the
// page; the panel does not need a real click.
const panelClick = (text) => page.eval(`[...document.querySelectorAll("#vu-analyse button")].find((b) => b.textContent === ${JSON.stringify(text)}).click()`);

test("inspect: the errors since the page loaded, and the monitor also in an iframe with a video", async () => {
  await page.inWorker(`chrome.storage.sync.set({ "site:127.0.0.1": true })`);
  await settled();
  const url = page.url("errors.html");
  try {
    await page.open("errors.html");
    await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 8000);
    await popupFor(url, async (popup) => {
      await popup.click("#inspect");
      await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
    });
    let r = await page.eval(`document.querySelector("#vu-analyse textarea").value`);
    assert.ok(r.includes("== " + t("inspect.report.pageErrors.title") + "\n"), r);
    assert.match(r, /\n\+\d+\.\d s {2}page error: Error: boom while loading/);
    assert.match(r, /\n\+\d+\.\d s {2}failed to load: img http:\/\/127\.0\.0\.1:\d+\/missing-at-load\.png\?…/);
    assert.doesNotMatch(r, /secret123/);
    assert.doesNotMatch(r, /Gaffer started later/);

    await panelClick(t("inspect.button.monitor"));
    await page.waitFor(`[...document.querySelectorAll("#vu-analyse button")].some((b) => b.textContent === ${JSON.stringify(t("inspect.button.stop"))})`, 3000);
    await inFrames(url, `if (location.hostname === "localhost") { document.querySelector("video").pause(); setTimeout(() => { throw new Error("boom in the frame"); }, 0); }`);
    await page.sleep(800);
    await panelClick(t("inspect.button.stop"));
    r = await page.eval(`document.querySelector("#vu-analyse textarea").value`);
    assert.match(r, /\[frame localhost:\d+\] #0 paused/);
    assert.match(r, /\[frame localhost:\d+\] page error: Error: boom in the frame/);
    await panelClick(t("inspect.button.close"));
    await page.sleep(300);
    assert.deepEqual(await inFrames(url, `typeof window.__gafferInspectFrame === "function"`), [false, false]);
  } finally {
    await page.inWorker(`chrome.storage.sync.clear()`);
    await settled();
  }
});
