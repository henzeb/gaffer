import { test } from "node:test";
import assert from "node:assert/strict";
import { page, vid, leaks } from "./direct-helpers.js";

const el = (id) => `document.getElementById("${id}")`;
const state = (id) => page.eval(`[${el(id)}.muted, +${el(id)}.volume.toFixed(2)]`);
const site = () => page.eval(`[__site.muted, __site.clicks]`);

async function open(file) {
  await page.open(file);
  await page.eval(`localStorage.removeItem("vu-level")`);
  await page.waitFor(`${el("v0")}.currentTime > 0.1`, 5000);
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.hover("#v0");
}

test("sound: M goes through the site's own mute button, so the next video has sound too", async () => {
  await open("feed-sound.html");
  assert.deepEqual(await state("v0"), [true, 0.7]);
  await page.key("m");
  await page.waitFor(`!${el("v0")}.muted`, 2000);
  assert.deepEqual(await site(), [false, 1]);
  await page.eval("window.__next()");
  await page.waitFor(`!${el("v1")}.paused`, 3000);
  assert.deepEqual(await state("v1"), [false, 0.7]);
  // And back: muted for both.
  await page.hover("#v1");
  await page.key("m");
  await page.waitFor(`${el("v1")}.muted`, 2000);
  assert.deepEqual(await site(), [true, 2]);
});

test("sound: the volume set in Direct goes with the next video, also when the site sets its own", async () => {
  await open("feed-sound.html");
  await page.key("m");
  await page.waitFor(`!${el("v0")}.muted`, 2000);
  await page.key("PageDown");
  await page.key("PageDown");
  assert.deepEqual(await state("v0"), [false, 0.6]);
  await page.eval("window.__next()");
  await page.waitFor(`${el("v1")}.volume === 0.6`, 3000);
  assert.deepEqual(await state("v1"), [false, 0.6]);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("sound: a site button that does nothing, or no button: Direct sets it itself", async () => {
  await open("feed-sound.html?dead");
  await page.key("m");
  await page.waitFor(`!${el("v0")}.muted`, 2000);
  assert.deepEqual(await site(), [true, 1]);
  await page.open("video.html");
  await page.run("direct");
  await page.hover("#vid");
  assert.equal(await vid("v.muted"), true);
  await page.key("m");
  assert.equal(await vid("v.muted"), false);
});

test("sound: a site that keeps starting its videos muted gets the choice once per video", async () => {
  await open("feed-sound.html?dead");
  await page.key("m");
  await page.waitFor(`!${el("v0")}.muted`, 2000);
  await page.eval("window.__next()");
  await page.waitFor(`!${el("v1")}.paused && !${el("v1")}.muted`, 3000);
  // The site mutes it again later: that is not undone.
  await page.eval(`${el("v1")}.muted = true, ${el("v1")}.pause(), ${el("v1")}.play()`);
  await page.sleep(600);
  assert.equal(await page.eval(`${el("v1")}.muted`), true);
});

test("sound: not for a video that starts while another one plays with sound", async () => {
  await open("feed-sound.html?dead");
  await page.key("m");
  await page.waitFor(`!${el("v0")}.muted`, 2000);
  await page.eval(`${el("v1")}.play()`);
  await page.sleep(600);
  assert.deepEqual(await state("v1"), [true, 0.7]);
  assert.equal(await page.eval(`${el("v0")}.muted`), false);
});
