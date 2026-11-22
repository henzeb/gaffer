import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, vid } from "./direct-helpers.js";

for (const [name, query] of [
  ["data-resolution", ""],
  ["with a delay", "?delay=700"],
  ["only with pointer activity", "?pointer"],
  ["text only", "?list=text"],
  ["aria-label", "?attr=aria-label"],
]) {
  test(`quality: site menu in a portal, ${name}`, async () => {
    await start("portal.html" + query);
    await page.waitFor(`document.getElementById("vid").videoHeight === 1080`, 15000);
    await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 3000);
    const p = await page.eval("window.__portal");
    assert.deepEqual(p.picks, ["1080p"]);
    assert.ok(p.visible.every((x) => x === "hidden"), "the menu does not flash into view: " + p.visible);
    assert.equal(await page.eval("menuOpen()"), false);
  });
}

test("quality: a site menu that is already open is read without opening it", async () => {
  await page.open("portal.html");
  await page.eval(`localStorage.setItem("vu-max", "0")`);
  await page.open("portal.html");
  await page.eval("openMenu()");
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.waitFor(`!document.querySelector("#video-ultimate-top .q").classList.contains("gone") && document.querySelector("#video-ultimate-top .q").textContent !== "…"`, 8000);
  await page.sleep(500);
  const p = await page.eval("window.__portal");
  assert.equal(p.opens, 1, "no extra opening");
  assert.equal(p.clicks, 1, "only the click that closes the visible menu");
  assert.equal(await page.eval("menuOpen()"), false);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .q").textContent`), "360p");
  await page.eval(`localStorage.removeItem("vu-max")`);
});

test("quality: choice in the site menu through the bar, confirmed by the video height", async () => {
  await start("portal.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 15000);
  await page.key("q");
  await page.waitFor(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].some((b) => b.textContent === "720p")`, 3000);
  const [x, y] = await page.eval(`(() => { const b = [...document.querySelectorAll("#video-ultimate-top .qrow button")].find((b) => b.textContent === "720p"); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.clickAt(x, y);
  await page.waitFor(`document.getElementById("vid").videoHeight === 720`, 5000);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "720p"`, 3000);
  assert.deepEqual((await page.eval("window.__portal")).picks, ["1080p", "720p"]);
});

test("quality: an unplayable option of a site menu is marked once, however long the list is open", async () => {
  await start("portal.html?bad");
  const fallback = t("direct.quality.codecFallback", { label: "1080p" });
  await page.waitFor(`document.getElementById("vu-osd").textContent === ${JSON.stringify(fallback)}`, 15000, 50);
  await page.key("q");
  const labels = `[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`;
  await page.waitFor(`${labels}.includes("1080p ✕")`, 3000);
  // A few scans render the open list again.
  await page.sleep(2500);
  assert.deepEqual((await page.eval(labels)).filter((l) => l.startsWith("1080p")), ["1080p ✕"]);
});

test("quality: every JW Player on the page goes with its own video", async () => {
  await start("multi.html?jw", { hover: "#v2" });
  const top = `document.querySelector('#video-ultimate-top[data-vu-for="' + document.getElementById("v2").getAttribute("data-vu-id") + '"] .q')`;
  await page.waitFor(`!!document.getElementById("v2").getAttribute("data-vu-id") && !${top}.classList.contains("gone")`, 6000);
  await page.waitFor(`${top}.textContent === "720p"`, 3000);
});
