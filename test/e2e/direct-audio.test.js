import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, visible, popLabels, popButton, clickEl, WITH_AUDIO } from "./direct-helpers.js";

for (const type of WITH_AUDIO) {
  test(`tracks: ${type}, audio track from the popup`, async () => {
    await start("tracks.html?type=" + type);
    await page.waitFor(visible("aud"), 6000);
    await clickEl("#video-ultimate-bar .aud");
    assert.deepEqual(await popLabels("apop"), ["English", "Nederlands"]);
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .apop button.on")?.textContent`), "English");
    await popButton("apop", "Nederlands");
    await page.waitFor(`window.__state.audio === "nl"`, 2000);
    await page.waitFor(`document.querySelector("#video-ultimate-bar .aud").title === ${JSON.stringify(t("direct.audio.current", { label: "Nederlands" }))}`, 2000);
  });
}

test("speed: YouTube presets go through setPlaybackRate, other speeds on the video", async () => {
  await start("tracks.html?type=youtube");
  await page.waitFor(visible("cc"), 6000);
  await page.key(">");
  await page.waitFor(`window.__ytRates.length === 1`, 2000);
  assert.deepEqual(await page.eval("window.__ytRates"), [1.25]);
  for (let i = 0; i < 4; i++) await page.key(">");
  await page.waitFor(`document.getElementById("vid").playbackRate === 2.5`, 2000);
  assert.deepEqual(await page.eval("window.__ytRates"), [1.25, 1.5, 1.75, 2]);
});
