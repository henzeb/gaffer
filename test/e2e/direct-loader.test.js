import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { page, start, vid, osd, leaks, rect } from "./direct-helpers.js";

const on = `getComputedStyle(document.getElementById("vu-loader")).display !== "none"`;
const loaderOn = () => page.waitFor(on, 5000);
const loaderOff = () => page.waitFor(`!(${on})`, 5000);
const isOn = () => page.eval(on);
const button = () => page.eval(`document.querySelector("#video-ultimate-bar .pp").dataset.s`);
const middle = (r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
const near = (a, b, d = 2) => assert.ok(Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d, JSON.stringify([a, b]));
// Whether the spinner shows at any moment from now on.
const watch = () => page.eval(`(() => { const l = document.getElementById("vu-loader"); window.__shown = 0; new MutationObserver(() => { if (l.classList.contains("on")) window.__shown++; }).observe(l, { attributes: true }); })()`);

afterEach(() => page.server.release());

// A video of 60 s that loads up to about second 11.
async function stalled({ setup = "", at = 500000, play = true, hover, file = "video.html" } = {}) {
  page.server.stall(at);
  await page.open(file);
  await page.eval(`(() => { const v = document.getElementById("vid"); v.loop = false; v.autoplay = false; v.src = "/stall/v360.mp4"; ${setup} })()`);
  if (at) await page.waitFor(`document.getElementById("vid").readyState >= 2`, 5000);
  await page.eval("window.__track.mark()");
  await page.run("direct");
  if (hover !== null) await page.hover("#vid");
  if (play) await page.eval(`document.getElementById("vid").play().catch(() => {}), 0`);
}

// Close enough to the end of what is loaded to run out of it.
const toEdge = async () => {
  await page.eval(`(() => { const v = document.getElementById("vid"); v.currentTime = v.buffered.end(0) - 2.5; })()`);
  await page.waitFor(`!document.getElementById("vid").seeking`, 5000);
};

test("loader: while playing without data, in the middle of the video, and gone when it continues", async () => {
  await stalled();
  assert.equal(await isOn(), false);
  await toEdge();
  await loaderOn();
  near(middle(await rect("#vu-loader i")), middle(await rect("#vid")), 14);
  near(middle(await rect("#vu-loader")), middle(await rect("#vid")));
  assert.equal(await button(), "wait");
  assert.equal(await vid("v.paused"), false);
  assert.deepEqual(await page.eval(`(() => { const c = getComputedStyle(document.querySelector("#vu-loader i")); return [c.borderRightStyle, parseFloat(c.borderRightWidth) > 2, c.borderTopColor]; })()`), ["solid", true, "rgba(0, 0, 0, 0)"]);
  // Both really turn.
  for (const sel of ["#vu-loader i", "#video-ultimate-bar .pp i"]) {
    const angle = () => page.eval(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).transform`);
    const first = await angle();
    assert.match(first, /^matrix/, sel);
    await page.sleep(120);
    assert.notEqual(await angle(), first, sel);
  }
  // Also without the bars.
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  assert.equal(await isOn(), true);
  page.server.release();
  await loaderOff();
  assert.equal(await button(), "pause");
});

test("loader: clicks go through it, and pausing takes it away", async () => {
  await stalled();
  await toEdge();
  await loaderOn();
  const [x, y] = await page.center("#vid");
  await page.clickAt(x, y);
  await loaderOff();
  assert.equal(await vid("v.paused"), true);
  assert.equal(await button(), "play");
  await page.clickAt(x, y);
  await loaderOn();
  const [bx, by] = await page.center("#video-ultimate-bar .pp");
  await page.move(bx, by);
  await page.clickAt(bx, by);
  await loaderOff();
  assert.equal(await vid("v.paused"), true);
});

test("loader: after seeking to a part that is not there yet, also while paused", async () => {
  await stalled();
  await page.waitFor(`document.getElementById("vid").currentTime > 0.1`, 5000);
  await page.eval(`document.getElementById("vid").pause()`);
  await page.sleep(200);
  assert.equal(await isOn(), false);
  await page.eval(`document.getElementById("vid").currentTime = 40`);
  await loaderOn();
  assert.equal(await button(), "play");
  page.server.release();
  await loaderOff();
});

test("loader: before the start only after play", async () => {
  await stalled({ at: 0, play: false });
  await page.sleep(500);
  assert.equal(await isOn(), false);
  await page.eval(`document.getElementById("vid").play().catch(() => {}), 0`);
  await loaderOn();
  page.server.release();
  await loaderOff();
});

test("loader: while the buffer guard waits, without a message", async () => {
  await stalled();
  await page.eval(`(() => { const v = document.getElementById("vid"); v.playbackRate = 4; v.currentTime = 6; })()`);
  await page.waitFor(`document.getElementById("vid").paused`, 5000);
  await loaderOn();
  assert.equal(await button(), "wait");
  assert.equal(await osd(), "");
  page.server.release();
  await loaderOff();
  await page.waitFor(`!document.getElementById("vid").paused`, 10000);
});

test("loader: when the time stands still although the player says it has data", async () => {
  await stalled();
  await page.eval(`Object.defineProperty(document.getElementById("vid"), "readyState", { get: () => 4 })`);
  await toEdge();
  await loaderOn();
  page.server.release();
  await loaderOff();
});

test("loader: not while playing normally, seeking in what is loaded, or after the end", async () => {
  await page.open("video.html");
  await page.eval(`window.__gafferTiming = 1, document.getElementById("vid").loop = false, 0`);
  await page.waitFor(`document.getElementById("vid").currentTime > 0.2`, 5000);
  await page.run("direct");
  await watch();
  await page.sleep(1500);
  await page.eval(`document.getElementById("vid").currentTime = 3`);
  await page.sleep(700);
  await page.eval(`document.getElementById("vid").currentTime = 59.5`);
  await page.waitFor(`document.getElementById("vid").ended`, 5000);
  await page.sleep(1500);
  assert.equal(await page.eval("window.__shown"), 0);
});

test("loader: only after 0.3 s", async () => {
  await page.open("video.html");
  await page.eval("window.__gafferTiming = 1, 0");
  await page.run("direct");
  await page.waitFor(`document.getElementById("vid").currentTime > 0.5`, 5000);
  await watch();
  // Turned on and off in the page, so a busy test machine cannot stretch it.
  await page.eval(`(() => { const v = document.getElementById("vid"); let on = true; Object.defineProperty(v, "seeking", { configurable: true, get: () => on }); return new Promise((ok) => setTimeout(() => { on = false; ok(0); }, 200)); })()`);
  await page.sleep(600);
  assert.equal(await page.eval("window.__shown"), 0);
  await page.eval(`Object.defineProperty(document.getElementById("vid"), "seeking", { get: () => true }), 0`);
  await loaderOn();
});

test("loader: not with an error, without a source, for a still camera picture or while casting", async () => {
  await stalled({ setup: `const r = new EventTarget(); r.state = "disconnected"; r.watchAvailability = () => Promise.resolve(1); r.cancelWatchAvailability = () => Promise.resolve(); Object.defineProperty(v, "remote", { value: r });` });
  await toEdge();
  await loaderOn();
  await page.eval(`document.getElementById("vid").remote.state = "connected"`);
  await loaderOff();
  await page.eval(`document.getElementById("vid").remote.state = "disconnected"`);
  await loaderOn();
  // An error while the player still looks busy (MSE).
  await page.eval(`Object.defineProperty(document.getElementById("vid"), "error", { configurable: true, get: () => ({ code: 3 }) }), 0`);
  await loaderOff();
  await page.eval(`delete document.getElementById("vid").error`);
  await loaderOn();
  await page.eval(`(() => { const v = document.getElementById("vid"); v.src = "/missing.mp4"; v.play().catch(() => {}); })()`);
  await page.waitFor(`!!document.getElementById("vid").error`, 5000);
  await loaderOff();
  await page.eval(`(() => { const v = document.getElementById("vid"); v.removeAttribute("src"); v.load(); v.play().catch(() => {}); })()`);
  await page.sleep(500);
  assert.equal(await isOn(), false);
  await page.eval(`(() => { const c = document.createElement("canvas"); c.width = 320; c.height = 180; c.getContext("2d").fillRect(0, 0, 9, 9); const v = document.getElementById("vid"); v.srcObject = c.captureStream(); return v.play(); })()`);
  await page.waitFor(`document.getElementById("vid").readyState >= 3`, 5000);
  await page.eval(`Object.defineProperty(document.getElementById("vid"), "currentTime", { get: () => 5 }), 0`);
  await page.sleep(800);
  assert.equal(await isOn(), false);
});

test("loader: in the container of the bars, at their height, scrolling along and smaller on a small video", async () => {
  await stalled();
  await toEdge();
  await loaderOn();
  assert.equal(await page.eval(`document.getElementById("vu-loader").parentElement === document.getElementById("video-ultimate-bar").parentElement`), true);
  assert.equal(await page.eval(`getComputedStyle(document.getElementById("vu-loader")).zIndex === getComputedStyle(document.getElementById("video-ultimate-bar")).zIndex`), true);
  const size = async () => { const r = await rect("#vu-loader"); return r.right - r.left; };
  assert.equal(await size(), 64);
  await page.eval(`window.scrollTo(0, 120)`);
  near(middle(await rect("#vu-loader")), middle(await rect("#vid")));
  await page.eval(`document.getElementById("vid").style.cssText = "width:320px;height:180px", document.getElementById("player").style.cssText = "width:320px;height:180px", 0`);
  await page.waitFor(`document.getElementById("vu-loader").offsetWidth === 32`, 3000);
  near(middle(await rect("#vu-loader")), middle(await rect("#vid")));
});

test("loader: in fullscreen in the middle of the screen, and back", async () => {
  await stalled();
  await toEdge();
  await loaderOn();
  await page.key("f");
  await page.waitFor(`document.documentElement.classList.contains("vu-full")`, 3000);
  const centre = `(() => { const r = document.getElementById("vu-loader").getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 2 && Math.abs((r.top + r.bottom) / 2 - innerHeight / 2) < 2; })()`;
  await page.waitFor(centre, 3000);
  assert.equal(await page.eval(`document.getElementById("vu-loader").matches(":popover-open")`), true);
  assert.equal(await isOn(), true);
  await page.key("f");
  await page.waitFor(`!document.documentElement.classList.contains("vu-full")`, 3000);
  await page.waitFor(`(() => { const a = document.getElementById("vu-loader").getBoundingClientRect(), b = document.getElementById("vid").getBoundingClientRect(); return Math.abs(a.left + a.right - b.left - b.right) < 4 && Math.abs(a.top + a.bottom - b.top - b.bottom) < 4; })()`, 3000);
  // It starts again inside fullscreen.
  page.server.release();
  await loaderOff();
  page.server.stall(0);
  await page.key("f");
  await page.eval(`(() => { const v = document.getElementById("vid"); v.src = "/stall/v360.mp4?2"; v.play().catch(() => {}); })()`);
  await loaderOn();
  await page.waitFor(centre, 3000);
  await page.key("f");
});

test("loader: a message comes below it and goes back afterwards", async () => {
  await stalled();
  await page.eval(`document.getElementById("vid").loop = false`);
  await toEdge();
  await page.key("f");
  await page.waitFor(`document.documentElement.classList.contains("vu-full")`, 3000);
  await loaderOn();
  await page.key("m");
  const l = await rect("#vu-loader");
  const m = await rect("#vu-osd");
  assert.ok(m.top >= l.bottom, JSON.stringify({ l, m }));
  page.server.release();
  await loaderOff();
  await page.key("m");
  assert.equal(await page.eval(`document.getElementById("vu-osd").style.translate`), "");
  await page.key("f");
});

test("loader: the spinner of a known player is hidden and comes back on close", async () => {
  await stalled({ setup: `["ytp-spinner", "vjs-loading-spinner", "shaka-spinner-container"].forEach((c) => { const e = document.createElement("div"); e.className = c; e.style.cssText = "position:absolute;left:300px;top:150px;width:1px;height:1px"; e.style.left = "-5px"; document.getElementById("player").appendChild(e); });` });
  await toEdge();
  await loaderOn();
  for (const c of ["ytp-spinner", "vjs-loading-spinner", "shaka-spinner-container"]) assert.equal(await page.eval(`getComputedStyle(document.querySelector(".${c}")).visibility`), "hidden", c);
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval(`getComputedStyle(document.querySelector(".ytp-spinner")).visibility`), "visible");
  assert.equal(await page.eval(`!!document.getElementById("vu-loader")`), false);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("loader: several videos each have their own", async () => {
  page.server.stall(0);
  await page.open("multi.html");
  await page.run("direct");
  await page.eval(`(() => { const v = document.getElementById("v2"); v.src = "/stall/v360.mp4"; v.muted = true; v.play().catch(() => {}); })()`);
  const of = (id) => `getComputedStyle(document.querySelector("#vu-loader[data-vu-for='" + document.getElementById("${id}").dataset.vuId + "']")).display !== "none"`;
  await page.waitFor(of("v2"), 5000);
  assert.equal(await page.eval(of("v1")), false);
});
