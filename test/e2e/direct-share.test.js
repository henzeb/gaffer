import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, vid, osd, leaks } from "./direct-helpers.js";

const shared = () => page.eval("window.__shared");
const copied = () => page.eval("window.__copied");

// Direct's share button over the given video.
async function shareOver(id, opts) {
  await page.hover("#" + id);
  const pos = await page.eval(`(() => { const v = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); const b = [...document.querySelectorAll("#video-ultimate-top .share")].find((b) => { const r = b.getBoundingClientRect(); return r.top >= v.top - 1 && r.bottom <= v.bottom + 1 && r.left >= v.left - 1 && r.right <= v.right + 1; }); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  assert.ok(pos, "share button over " + id);
  await page.clickAt(pos[0], pos[1], opts);
}

test("share: clicks the site's button in the player, keeps its panel visible and leaves fullscreen for it", async () => {
  await start("share.html?in");
  await page.waitFor(`document.querySelector(".controls").hasAttribute("data-vu-hide")`, 3000);
  await page.clickButton(t("direct.share.tip"));
  assert.deepEqual(await shared(), [0]);
  // The panel the site opened lies over the video: a later look leaves it.
  await page.sleep(1500);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector(".panel")).visibility`), "visible");
  assert.equal(await page.eval(`document.querySelector(".panel").hasAttribute("data-vu-hide")`), false);
  assert.equal(await vid("v.paused"), false);
  await page.eval(`document.querySelector(".panel").classList.remove("open")`);
  await page.key("f");
  await page.waitFor(`document.documentElement.classList.contains("vu-full")`, 2000);
  await page.clickButton(t("direct.share.tip"));
  await page.waitFor(`window.__shared.length === 2`, 2000);
  assert.equal(await page.eval(`document.documentElement.classList.contains("vu-full")`), false);
  // Closing removes the marks.
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval(`document.querySelectorAll("[data-vu-share],[data-vu-hide]").length`), 0);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

test("share: in a feed the button next to the video, not the one of the next video", async () => {
  await start("share.html?beside");
  await page.waitFor(`document.querySelectorAll("#video-ultimate-top").length === 2`, 3000);
  await shareOver("vid1");
  assert.deepEqual(await shared(), [1]);
  await shareOver("vid");
  assert.deepEqual(await shared(), [1, 0]);
});

test("share: without a site button the link is copied, and Shift copies it too", async () => {
  await start("share.html?none");
  await page.clickButton(t("direct.share.tip"));
  await page.waitFor(`window.__copied !== null`, 2000);
  assert.equal(await copied(), "https://example.com/watch/42");
  assert.equal(await osd(), t("direct.share.copied"));
  assert.deepEqual(await shared(), []);
  await page.eval("window.__copied = null");
  await page.clickButton(t("direct.share.tip"), { shift: true });
  await page.waitFor(`window.__copied !== null`, 2000);
  assert.equal(await copied(), "https://example.com/watch/42");
});

test("share: Shift does not use the site's button, the system menu comes first when there is one", async () => {
  await start("share.html?in");
  await page.clickButton(t("direct.share.tip"), { shift: true });
  await page.waitFor(`window.__copied !== null`, 2000);
  assert.deepEqual(await shared(), []);
  await start("share.html?none&system");
  await page.clickButton(t("direct.share.tip"));
  await page.waitFor(`window.__system !== null`, 2000);
  assert.deepEqual(await page.eval("window.__system"), { title: "Share buttons", url: "https://example.com/watch/42" });
  assert.equal(await copied(), null);
});
