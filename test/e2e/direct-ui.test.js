import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, vid, osd, leaks, rect, topTitles } from "./direct-helpers.js";

test("idle: panel and bar disappear after 2 s without mouse movement", async () => {
  await start("video.html", { hover: null });
  await page.move(500, 600);
  await page.move(700, 650);
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  await page.move(400, 300);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`), false);
});

test("no video: no error banner and no bars until a video appears", async () => {
  await start("novideo.html", { hover: null });
  assert.equal(await page.eval(`!!document.getElementById("video-ultimate-bar")`), false);
  assert.equal(await page.eval(`[...document.body.children].filter((e) => e.id !== "slot" && e.tagName !== "SCRIPT").length`), 0);
  await page.eval("addVideo(360)");
  await page.waitFor(`document.getElementById("vid360")?.getAttribute("data-vu") === "1"`, 3000);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-off")`), false);
});

test("new video: settings are reset", async () => {
  await start("novideo.html", { hover: null });
  await page.eval("addVideo(360)");
  await page.waitFor(`document.getElementById("vid360")?.getAttribute("data-vu") === "1"`, 3000);
  await page.hover("#vid360");
  await page.key("r");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
  await page.eval("addVideo(720)");
  await page.waitFor(`document.getElementById("vid720")?.getAttribute("data-vu") === "1"`, 3000);
  assert.doesNotMatch(await page.dyn(), /transform:/);
});

test("Max is on and remembered per site", async () => {
  await start("video.html");
  const maxOn = () => page.eval(`[...document.querySelectorAll("#video-ultimate-ui .txt")].find((b) => b.textContent === ${JSON.stringify(t("direct.panel.max"))}).classList.contains("on")`);
  assert.equal(await maxOn(), true);
  await page.key("t");
  await page.clickButton(t("direct.panel.max.tip"));
  assert.equal(await maxOn(), false);
  assert.equal(await page.eval(`localStorage.getItem("vu-max")`), "0");
  await page.eval(`localStorage.removeItem("vu-max")`);
});

test("top bar: ⚙, Quality and ⛶ at the top of the video, the panel opens below it", async () => {
  await start("sources.html");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone")`, 6000);
  assert.deepEqual(await topTitles(), [t("direct.top.tools"), t("direct.top.quality"), t("direct.download.tip"), t("direct.share.tip"), t("direct.fullscreen")].map((x) => x.split(" (")[0]));
  const video = await rect("#vid");
  const top = await rect("#video-ultimate-top .toprow");
  const bottom = await rect("#video-ultimate-bar .mainrow");
  assert.ok(Math.abs(top.top - video.top) < 20, JSON.stringify({ top, video }));
  assert.ok(Math.abs(bottom.bottom - video.bottom) < 20, JSON.stringify({ bottom, video }));
  assert.equal(await page.eval(`[...document.querySelectorAll("#video-ultimate-bar button")].some((b) => ${JSON.stringify([t("direct.top.tools"), t("direct.top.quality"), t("direct.fullscreen")])}.includes(b.title))`), false);
  await page.key("t");
  // No close button in the panel: it would look like closing the panel (SPEC §11.2).
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#video-ultimate-ui button")].map((b) => b.textContent).filter((x) => x === "✕")`), []);
  assert.equal(await page.eval(`[...document.querySelectorAll("#video-ultimate-ui .grp.end button")].map((b) => b.textContent).join(" ")`), "?");
  const panel = await rect("#video-ultimate-ui");
  assert.ok(panel.top >= top.bottom - 1, JSON.stringify({ panel, top }));
  await page.key("q");
  const row = await rect("#video-ultimate-top .qrow");
  assert.ok(row.top >= top.bottom - 1, JSON.stringify({ row, top }));
  await page.move(700, 650);
  await page.waitFor(`document.getElementById("video-ultimate-top").classList.contains("v-ui-hide")`, 3000);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`), true);
});

test("top bar: the panel and the quality list close each other, by key and by button", async () => {
  await start("sources.html");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone")`, 6000);
  const open = () => page.eval(`[document.querySelector("#video-ultimate-top #video-ultimate-ui"), document.querySelector("#video-ultimate-top .qrow")].map((e) => getComputedStyle(e).display !== "none")`);
  const lit = () => page.eval(`["⚙︎", "q"].map((x) => (x === "q" ? document.querySelector("#video-ultimate-top .q") : [...document.querySelectorAll("#video-ultimate-top .toprow button")].find((b) => b.textContent === x)).classList.contains("on"))`);
  const both = async (want) => { assert.deepEqual(await open(), want); assert.deepEqual(await lit(), want); };
  await page.key("t");
  await both([true, false]);
  await page.key("q");
  await both([false, true]);
  await page.key("t");
  await both([true, false]);
  await page.clickButton(t("direct.top.quality"));
  await both([false, true]);
  await page.clickButton(t("direct.top.tools"));
  await both([true, false]);
  // It stays that way on the next scan, and closing one opens nothing.
  await page.sleep(1200);
  await both([true, false]);
  await page.key("t");
  await both([false, false]);
  await page.key("q");
  await page.key("q");
  await both([false, false]);
});

test("top bar: a click outside the panel closes it, a click in it, a drag and the shortcuts card do not", async () => {
  await start("video.html");
  const open = () => page.eval(`document.getElementById("video-ultimate-top").classList.contains("tools")`);
  await page.key("t");
  await page.clickButton(t("direct.panel.quarter"));
  assert.equal(await open(), true);
  const gap = await page.eval(`(() => { const r = document.getElementById("video-ultimate-ui").getBoundingClientRect(); return [r.left + 2, r.top + r.height / 2]; })()`);
  await page.clickAt(...gap);
  assert.equal(await open(), true);
  await page.clickButton(t("direct.help.title"));
  const card = await rect("#video-ultimate-top .htitle");
  await page.clickAt(card.left + 3, card.top + 3);
  assert.equal(await open(), true);
  await page.clickButton(t("direct.help.close"));
  assert.equal(await open(), true);
  const v = await rect("#vid");
  const [x, y] = [v.left + 320, v.top + 230];
  await page.drag(x, y, x + 60, y);
  assert.equal(await open(), true);
  await page.drag(900, 600, 960, 600);
  assert.equal(await open(), true);
  await page.clickAt(x, y);
  assert.equal(await open(), false);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .toprow .ico").classList.contains("on")`), false);
  // The button itself, another button, and next to the video.
  await page.clickButton(t("direct.top.tools"));
  assert.equal(await open(), true);
  await page.clickButton(t("direct.top.tools"));
  assert.equal(await open(), false);
  await page.key("t");
  await page.clickButton(t("direct.volume"));
  assert.equal(await open(), false);
  await page.key("t");
  assert.equal(await open(), true);
  await page.clickAt(900, 600);
  assert.equal(await open(), false);
});

test("click on the video: closes what is open first, only then pauses", async () => {
  await start("video.html");
  const v = await rect("#vid");
  const [x, y] = [v.left + 320, v.top + 200];
  await page.waitFor(`!document.getElementById("vid").paused`, 3000);
  const opened = () => page.eval(`[document.querySelector("#video-ultimate-bar .pop.open") !== null, document.getElementById("video-ultimate-top").classList.contains("tools"), document.getElementById("video-ultimate-top").classList.contains("show-help")]`);
  const openers = [
    () => page.clickButton(t("direct.volume")),
    () => page.clickButton(t("direct.speed")),
    () => page.key("t"),
    async () => { await page.key("t"); await page.clickButton(t("direct.help.title")); },
  ];
  for (const open of openers) {
    await open();
    assert.ok((await opened()).some(Boolean));
    // Beside the shortcuts card, which lies over the video.
    const at = await page.eval(`(() => { const h = document.querySelector("#video-ultimate-top.show-help .help"); if (!h) return [${x}, ${y}]; const r = h.getBoundingClientRect(); return r.left > ${v.left} + 20 ? [${v.left} + 10, r.top + 20] : [${x}, r.bottom + 12]; })()`);
    await page.clickAt(at[0], at[1]);
    assert.deepEqual(await opened(), [false, false, false]);
    await page.sleep(300);
    assert.equal(await vid("v.paused"), false);
  }
  // A drag with the panel open pans and leaves it open.
  await page.key("t");
  await page.drag(x, y, x + 60, y);
  assert.equal((await opened())[1], true);
  await page.clickAt(x, y);
  assert.equal((await opened())[1], false);
  assert.equal(await vid("v.paused"), false);
  await page.clickAt(x, y);
  await page.waitFor(`document.getElementById("vid").paused`, 2000);
});

test("cast: button when a device is available, choice through Chrome and the status in the top bar", async () => {
  await start("cast.html");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .cast").classList.contains("gone")`, 3000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .cast").textContent`), t("direct.cast"));
  await page.clickButton(t("direct.cast.tip"));
  await page.waitFor(`document.querySelector("#video-ultimate-top .cast").textContent === ${JSON.stringify(t("direct.cast.active"))}`, 2000);
  assert.equal(await page.eval("window.__cast.prompts"), 1);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await page.eval("window.__cast.cancels"), [1]);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

for (const [name, query] of [["no device", "?none"], ["disableRemotePlayback", "?disabled"]]) {
  test(`cast: no button with ${name}`, async () => {
    await start("cast.html" + query);
    await page.sleep(300);
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .cast").classList.contains("gone")`), true);
  });
}

test("cast: with an MSE stream the button is off with an explanation", async () => {
  await start("cast.html?mse");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .cast").classList.contains("gone")`, 3000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .cast").classList.contains("off")`), true);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .cast").title`), t("direct.cast.unsupported"));
  await page.clickButton(t("direct.cast.unsupported"));
  assert.equal(await osd(), t("direct.cast.unsupported"));
  assert.equal(await page.eval("window.__cast.prompts"), 0);
});
