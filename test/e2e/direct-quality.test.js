import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, vid, osd, qrowButton, leaks } from "./direct-helpers.js";

test("quality: several <source> elements", async () => {
  await start("sources.html");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone")`, 6000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .q").textContent`), "720p");
  await page.key("q");
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`), ["720p", "360p"]);
  await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].find((b) => b.textContent === "360p").title`);
  const [x, y] = await page.eval(`(() => { const b = [...document.querySelectorAll("#video-ultimate-top .qrow button")].find((b) => b.textContent === "360p"); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.clickAt(x, y);
  await page.waitFor(`document.getElementById("vid").videoHeight === 360`, 4000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "360p"`, 2000);
});

test("quality: hls.js instance (intercepted), Max picks the highest", async () => {
  await start("hls.html");
  await page.waitFor(`document.getElementById("vid").videoHeight === 1080`, 10000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 3000);
  await page.key("q");
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`), ["Auto", "1080p", "720p", "360p"]);
});

test("quality: real hls.js, Max picks the highest and closing undoes the interception", async () => {
  await start("hls-real.html");
  await page.waitFor(`document.getElementById("vid").videoHeight === 360`, 10000);
  await page.waitFor(`document.getElementById("vid").videoHeight === 1080`, 20000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 3000);
  assert.equal(await osd(), t("direct.osd.maxPicked", { label: "1080p" }));
  await page.key("q");
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`), ["Auto", "1080p", "720p", "360p"]);
  await qrowButton("360p");
  await page.waitFor(`document.getElementById("vid").videoHeight === 360`, 10000);
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval("Hls.prototype.trigger === window.__hlsTrigger"), true);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("quality: Auto shows the real height", async () => {
  await page.open("hls.html");
  await page.eval(`localStorage.setItem("vu-max", "0")`);
  await start("hls.html");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone")`, 8000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === ${JSON.stringify(t("direct.quality.withHeight", { label: "Auto", height: 360 }))}`, 3000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-ui .txt").classList.contains("on")`), false);
  await page.eval(`localStorage.removeItem("vu-max")`);
});

test("quality: an unplayable codec is marked and Direct goes back", async () => {
  await start("sources.html?bad");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone")`, 6000);
  await page.key("q");
  await qrowButton("1080p");
  const fallback = t("direct.quality.codecFallback", { label: "1080p" });
  await page.waitFor(`document.getElementById("vu-osd").textContent === ${JSON.stringify(fallback)}`, 10000, 50);
  assert.equal(await osd(), fallback);
  await page.waitFor(`document.getElementById("vid").videoHeight === 720`, 4000);
  await page.key("q");
  const labels = await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`);
  assert.ok(labels.includes("1080p ✕"), labels.join(","));
});

test("quality: Max skips an unplayable hls.js quality and picks the next one", async () => {
  await start("hls.html?bad");
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p" && document.getElementById("vid").videoHeight === 1080`, 20000);
  await page.key("q");
  const labels = await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`);
  assert.ok(labels.includes("2160p ✕"), labels.join(","));
});

test("quality: Original goes above all options with a number and shows the real height", async () => {
  await start("sources.html?orig");
  await page.waitFor(`document.getElementById("vid").videoHeight === 1080`, 10000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "Origineel · 1080p"`, 3000);
});

test("quality: real dash.js, Max picks the highest and a choice in the bar turns off the automatic choice", async () => {
  await start("dash-real.html", { settle: 300 });
  await page.waitFor(`document.getElementById("vid").videoHeight === 1080`, 20000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 3000);
  assert.equal(await page.eval("dashPlayer.getSettings().streaming.abr.autoSwitchBitrate.video"), false);
  await page.key("q");
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`), ["Auto", "1080p", "720p", "360p"]);
  await qrowButton("360p");
  await page.waitFor(`document.getElementById("vid").videoHeight === 360`, 15000);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("quality: picking another quality does not count as a new video", async () => {
  await start("sources.html");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone")`, 6000);
  await page.key("r");
  await page.key("q");
  await qrowButton("360p");
  await page.waitFor(`document.getElementById("vid").videoHeight === 360`, 4000);
  await page.sleep(500);
  assert.match(await page.dyn(), /rotate\(90deg\)/);
});
