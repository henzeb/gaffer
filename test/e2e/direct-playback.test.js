import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, vid, osd, leaks } from "./direct-helpers.js";

test("a click on the video toggles play/pause and does not reach the site", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.click("#vid");
  await page.sleep(450);
  assert.equal(await vid("v.paused"), true);
  await page.click("#vid");
  await page.sleep(450);
  assert.equal(await vid("v.paused"), false);
  assert.equal(await page.eval("window.__clicks.player"), 0);
});

test("panel buttons: play/pause and ±10 s", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.clickButton(t("direct.play"));
  assert.equal(await vid("v.paused"), true);
  const at = await vid("v.currentTime");
  await page.clickButton(t("direct.skip.forward"));
  assert.ok((await vid("v.currentTime")) >= at + 9.5);
  assert.equal(await osd(), t("direct.osd.skip", { seconds: "+10" }));
  assert.equal(await page.eval("window.__clicks.player"), 0, "clicks on the panel do not reach the site");
});

test("Direct ignores generated clicks (isTrusted = false)", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.eval(`document.getElementById("vid").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 360, clientY: 220 }))`);
  await page.sleep(450);
  assert.equal(await vid("v.paused"), false);
  assert.equal(await page.eval("window.__clicks.player"), 1, "the site gets the generated click");
});

test("clicks on a dialog over the video pass through", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.eval("showDialog()");
  await page.click("#dialog-btn");
  await page.sleep(450);
  assert.equal(await page.eval("window.__clicks.dialog"), 1);
  assert.equal(await vid("v.paused"), false);
});

test("the bars step aside while a site dialog lies over the video", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`);
  await page.eval("showDialog()");
  await page.hover("#vid");
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide") && document.getElementById("video-ultimate-top").classList.contains("v-ui-hide")`, 3000);
  await page.move(330, 230);
  await page.sleep(100);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`), true, "a mouse move over the video does not bring the bars back");
  await page.eval(`document.getElementById("dialog").style.display = "none"`);
  await page.move(300, 200);
  await page.sleep(300);
  await page.move(320, 220);
  await page.waitFor(`!document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
});

test("live stream: LIVE button, no seeking or speed", async () => {
  await start("live.html");
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("live")`, 3000);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector("#video-ultimate-bar .spd")).display`), "none");
  assert.equal(await page.eval(`getComputedStyle(document.querySelector("#video-ultimate-bar .lv")).display`), "flex");
  await page.key(">");
  assert.equal(await vid("v.playbackRate"), 1);
  const at = await vid("v.currentTime");
  await page.key("l");
  assert.ok(Math.abs((await vid("v.currentTime")) - at) < 2, "±10 s does nothing on live");
});

test("live stream: the same live stream loaded again keeps the picture settings", async () => {
  await start("live.html");
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("live")`, 3000);
  await page.key("r");
  const deg = `document.querySelector("#video-ultimate-ui .val").textContent`;
  assert.equal(await page.eval(deg), "90°");
  await page.eval(`(() => { const v = document.getElementById("vid"); window.__again = false; v.addEventListener("loadedmetadata", () => (window.__again = true), { once: true }); v.src = v.src; })()`);
  await page.waitFor("window.__again", 5000);
  assert.equal(await page.eval(deg), "90°");
});

test("live stream: pause is a grey dot, LIVE jumps to the live edge", async () => {
  await start("live.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.key(" ");
  await page.sleep(300);
  assert.equal(await vid("v.paused"), true);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .lv").classList.contains("behind")`), true);
  await page.eval(`document.getElementById("vid").currentTime = 5`);
  await page.clickButton(t("direct.live.back"));
  await page.sleep(400);
  assert.equal(await vid("v.paused"), false);
  const behind = await page.eval(`liveEdge() - document.getElementById("vid").currentTime`);
  assert.ok(behind > 1 && behind < 4, "about 2 s behind the edge, was " + behind);
  await page.sleep(300);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .lv").classList.contains("behind")`), false);
});

test("live stream: playing on after a pause goes on from there, LIVE shows how far behind", async () => {
  await start("live.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.sleep(800);
  const lag = () => page.eval(`document.querySelector("#video-ultimate-bar .lv .lag").textContent`);
  const behind = () => page.eval(`document.querySelector("#video-ultimate-bar .lv").classList.contains("behind")`);
  // Playing live: the player's own delay does not count.
  assert.equal(await behind(), false);
  assert.equal(await lag(), "");
  await page.key(" ");
  const at = await vid("v.currentTime");
  await page.eval("window.__ahead = 15");
  await page.key(" ");
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
  assert.ok(Math.abs((await vid("v.currentTime")) - at) < 1, "goes on where it was paused");
  await page.waitFor(`document.querySelector("#video-ultimate-bar .lv .lag").textContent !== ""`, 2000);
  assert.equal(await behind(), true);
  assert.match(await lag(), /^−0:1[3-6]$/);
  await page.clickButton(t("direct.live.back"));
  await page.waitFor(`document.querySelector("#video-ultimate-bar .lv .lag").textContent === ""`, 2000);
  assert.equal(await behind(), false);
  assert.ok((await page.eval(`liveEdge() - document.getElementById("vid").currentTime`)) < 4);
});

test("live stream: a paused moment that left the window goes to live", async () => {
  await start("live.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.key(" ");
  await page.eval("window.__ahead = 20; window.__start = document.getElementById('vid').currentTime + 5");
  await page.key(" ");
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
  assert.ok((await page.eval(`liveEdge() - document.getElementById("vid").currentTime`)) < 4);
});

test("live stream: also with a growing finite duration (a window to rewind) or when the player says so", async () => {
  for (const kind of ["dvr", "flag"]) {
    await start("live.html?" + kind);
    await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("live")`, 5000);
    assert.equal(await page.eval(`getComputedStyle(document.querySelector("#video-ultimate-bar .spd")).display`), "none", kind);
  }
  // A file whose duration does not grow is not live.
  await start("video.html");
  await page.sleep(1500);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("live")`), false);
});

test("live stream: pause holds when the site plays again by itself", async () => {
  await start("live.html?replay");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.key(" ");
  await page.waitFor("window.__sitePlays >= 2", 3000);
  assert.equal(await vid("v.paused"), true);
});

test("pause: the site can't start the video until the user plays it", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.key(" ");
  assert.equal(await vid("v.paused"), true);
  await page.eval(`document.getElementById("vid").play()`);
  await page.sleep(400);
  assert.equal(await vid("v.paused"), true);
  await page.eval(`HTMLMediaElement.prototype.play.call(document.getElementById("vid"))`, { gesture: false });
  await page.sleep(400);
  assert.equal(await vid("v.paused"), true);
  await page.key(" ");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.eval(`document.getElementById("vid").pause()`);
  await page.eval(`document.getElementById("vid").play()`);
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
});

test("pause: a click on the video or on the site's play button lifts the pause", async () => {
  await start("video.html?outside");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.click("#vid");
  await page.sleep(450);
  assert.equal(await vid("v.paused"), true);
  await page.click("#vid");
  await page.sleep(450);
  assert.equal(await vid("v.paused"), false);
  await page.key(" ");
  await page.eval(`document.getElementById("vid").play()`);
  await page.sleep(300);
  assert.equal(await vid("v.paused"), true);
  await page.click("#outside-play");
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
});

test("pause: closing removes the video's own play()", async () => {
  await start("video.html");
  assert.equal(await page.eval(`Object.prototype.hasOwnProperty.call(document.getElementById("vid"), "play")`), true);
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval(`Object.prototype.hasOwnProperty.call(document.getElementById("vid"), "play")`), false);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("pause: a start from outside the page (activation without input in the page) lifts the pause", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.key(" ");
  await page.eval(`document.getElementById("vid").play()`, { gesture: false });
  await page.sleep(300);
  assert.equal(await vid("v.paused"), true);
  await page.sleep(5200);
  await page.eval(`document.getElementById("vid").play()`, { gesture: false });
  await page.sleep(300);
  assert.equal(await vid("v.paused"), true, "without activation the pause holds");
  await page.eval(`document.getElementById("vid").play()`);
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
  await page.sleep(400);
  assert.equal(await vid("v.paused"), false);
});

test("pause: after a media key the site may start the video", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.key(" ");
  await page.sleep(300);
  assert.equal(await vid("v.paused"), true);
  await page.key("MediaPlayPause");
  await page.eval(`document.getElementById("vid").play()`, { gesture: false });
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
  await page.sleep(400);
  assert.equal(await vid("v.paused"), false);
});

test("feed: the site's Previous and Next in the bar, a new item resets the settings", async () => {
  await start("feed.html");
  await page.waitFor(`[...document.querySelectorAll("#video-ultimate-bar .nav")].filter((b) => !b.classList.contains("gone")).length === 2`, 3000);
  await page.key("r");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
  await page.clickButton(t("direct.nav.nextSite"));
  await page.waitFor(`Math.round(document.getElementById("vid").duration) === 10`, 5000);
  await page.waitFor(`!/transform:/.test(document.getElementById("vu-dyn").textContent)`, 3000);
});

test("end of the video: the site's end screen stays visible and clickable, the bars go away with the video", async () => {
  await start("endscreen.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.eval(`document.getElementById("vid").currentTime = 9.3`);
  await page.waitFor(`document.getElementById("vid").ended`, 5000);
  await page.waitFor(`document.getElementById("video-ultimate-bar").style.top === "-9999px"`, 3000);
  assert.equal(await page.eval(`document.getElementById("video-ultimate-top").style.top`), "-9999px");
  await page.sleep(1200);
  assert.equal(await page.eval(`document.getElementById("grid").hasAttribute("data-vu-hide") || getComputedStyle(document.getElementById("grid")).visibility === "hidden"`), false);
  await page.click("#next");
  assert.equal(await page.eval("window.__next"), 1);
});
