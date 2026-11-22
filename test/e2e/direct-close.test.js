import { test } from "node:test";
import assert from "node:assert/strict";
import { page, start, vid, firstDiff, leaks, transformOf } from "./direct-helpers.js";

test("close: __vuClose() restores the page completely", async () => {
  await page.open("video.html");
  const before = await page.eval("__snapshot()");
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.hover("#vid");
  await page.key("]"); await page.key("+"); await page.key("h");
  await page.key("f");
  await page.key("f");
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  await page.hover("#vid");
  await page.key("t");
  await page.eval("window.__vuClose()");
  await page.waitFor("!window.__vuClose");
  const afterSnap = await page.eval("__snapshot()");
  assert.ok(afterSnap.html === before.html, "DOM differs after closing:\n" + firstDiff(afterSnap.html, before.html));
  assert.deepEqual(afterSnap.vids, before.vids);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
  assert.equal(await page.eval("window.__vuClose"), null);
});

test("close: preload and the site's classes on <html> stay as they were", async () => {
  await page.open("video.html");
  await page.eval(`document.getElementById("vid").setAttribute("preload", "metadata"); document.documentElement.className = "site"`);
  const before = await page.eval("__snapshot()");
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.hover("#vid");
  assert.equal(await page.eval(`document.getElementById("vid").preload`), "auto");
  await page.key("f");
  await page.key("f");
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  await page.eval("window.__vuClose()");
  const afterSnap = await page.eval("__snapshot()");
  assert.ok(afterSnap.html === before.html, "DOM differs after closing:\n" + firstDiff(afterSnap.html, before.html));

  await page.open("video.html");
  await page.eval(`document.getElementById("vid").removeAttribute("preload")`);
  const plain = await page.eval("__snapshot()");
  await page.run("direct");
  await page.hover("#vid");
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  await page.eval("window.__vuClose()");
  const plainAfter = await page.eval("__snapshot()");
  assert.ok(plainAfter.html === plain.html, "DOM differs after closing:\n" + firstDiff(plainAfter.html, plain.html));
});

test("quiet mode: no panel without a video, but as soon as one appears", async () => {
  await page.open("novideo.html");
  await page.eval("window.__gafferAuto = true");
  await page.run("direct");
  assert.equal(await page.eval("typeof window.__vuClose"), "function");
  assert.equal(await page.eval("window.__gafferAuto"), undefined);
  assert.equal(await page.eval(`!!document.getElementById("video-ultimate-bar")`), false);
  await page.eval(`window.addVideo(360)`);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar") && !document.getElementById("video-ultimate-bar").classList.contains("v-ui-off")`, 4000);
  await page.eval("window.__vuClose()");
});

test("quiet mode: an error logs to the console, no banner", async () => {
  await page.open("video.html");
  await page.eval(`window.__gafferAuto = true; window.__realSetAttribute = Element.prototype.setAttribute; Element.prototype.setAttribute = function (n, v) { if (n === "data-vu") throw new Error("attach broken"); return window.__realSetAttribute.call(this, n, v); }`);
  await page.run("direct");
  await page.sleep(300);
  assert.equal(await page.eval(`[...document.body.children].some((e) => /error/.test(e.textContent) && e.style.background.includes("220, 38, 38"))`), false);
  assert.ok(page.logs.some((l) => /attach broken/.test(l)), page.logs.join("\n"));
  await page.eval("Element.prototype.setAttribute = window.__realSetAttribute; window.__vuClose()");
});

test("quiet mode: no second start when Direct already runs, a bookmarklet does restart", async () => {
  await start("video.html");
  await page.key("r");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
  await page.eval("window.__gafferAuto = true");
  await page.run("direct");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-bar").length`), 1);
  assert.equal(await page.eval("window.__gafferAuto"), undefined);
  await page.run("direct");
  assert.doesNotMatch(await page.dyn(), /transform:/);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("close: __vuClose undoes the hls interception", async () => {
  await start("hls.html");
  await page.waitFor(`Hls.prototype.trigger !== window.__hlsTrigger`, 6000);
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval("Hls.prototype.trigger === window.__hlsTrigger"), true);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("starting again replaces the running Direct", async () => {
  await start("video.html");
  await page.key("r");
  await page.run("direct");
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-bar").length`), 1);
  assert.equal(await page.eval(`document.querySelectorAll("#v-rotator-style, #vu-dyn").length`), 2);
  assert.doesNotMatch(await page.dyn(), /transform:/);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("picture before the start: stays visible, rotates along, the bars are already there and it disappears after the start", async () => {
  await page.open("poster.html?overlay");
  const before = await page.eval("__snapshot()");
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.hover("#vid");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar") && !document.getElementById("video-ultimate-bar").classList.contains("v-ui-off")`, 3000);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-top").classList.contains("v-ui-off")`), false);
  assert.equal(await page.eval(`getComputedStyle(document.getElementById("cover")).visibility`), "visible");
  assert.equal(await page.eval(`document.getElementById("cover").hasAttribute("data-vu-poster")`), true);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector(".big-play")).visibility`), "hidden");
  await page.key("r");
  assert.match(await page.eval(`getComputedStyle(document.getElementById("cover")).transform`), /^matrix\(/);
  await page.key("0");
  await page.click("#vid");
  await page.waitFor(`!document.getElementById("vid").paused`, 3000);
  await page.waitFor(`getComputedStyle(document.getElementById("cover")).visibility === "hidden"`, 3000);
  await page.eval("window.__vuClose()");
  const afterSnap = await page.eval("__snapshot()");
  assert.ok(afterSnap.html === before.html, "DOM differs after closing:\n" + firstDiff(afterSnap.html, before.html));
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("picture before the start: without a source a click on the video starts the site's player", async () => {
  await start("poster.html?lazy");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar") && !document.getElementById("video-ultimate-bar").classList.contains("v-ui-off")`, 3000);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-off")`), false);
  assert.equal(await vid("v.getAttribute('src')"), null);
  await page.click("#vid");
  await page.waitFor(`!document.getElementById("vid").paused && !!document.getElementById("vid").getAttribute("src")`, 3000);
});

test("several videos: every video gets its own bars and settings, closing restores everything", async () => {
  await page.open("multi.html");
  const before = await page.eval("__snapshot()");
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.waitFor(`document.querySelectorAll("#video-ultimate-bar").length === 2`, 3000);
  await page.hover("#v1");
  await page.key("r");
  assert.match(await transformOf("v1"), /^matrix/);
  assert.equal(await transformOf("v2"), "none");
  await page.eval(`document.getElementById("v2").scrollIntoView({ block: "center" })`);
  await page.sleep(200);
  await page.hover("#v2");
  await page.key("h");
  assert.match(await transformOf("v2"), /^matrix/);
  assert.match(await transformOf("v1"), /^matrix/);
  await page.eval("window.__vuClose()");
  await page.eval("scrollTo(0, 0)");
  const afterSnap = await page.eval("__snapshot()");
  assert.ok(afterSnap.html === before.html, "DOM differs after closing:\n" + firstDiff(afterSnap.html, before.html));
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("several videos: a grid of small videos gets no bars", async () => {
  await start("multi.html?grid", { hover: null });
  await page.sleep(1100);
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-bar").length`), 0);
  await page.eval("window.__vuClose()");
});

test("several videos: in fullscreen the bars of the other videos disappear", async () => {
  await start("multi.html", { hover: "#v1" });
  await page.waitFor(`document.querySelectorAll("#video-ultimate-bar").length === 2`, 3000);
  await page.key("f");
  await page.sleep(300);
  assert.equal(await page.eval(`[...document.querySelectorAll("#video-ultimate-bar")].filter((b) => b.getBoundingClientRect().top >= 0).length`), 1);
  await page.key("f");
  await page.eval("window.__vuClose()");
});
