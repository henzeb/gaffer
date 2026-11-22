import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, osd, visible, popLabels, popButton, clickEl, preferred, WITH_AUDIO } from "./direct-helpers.js";

for (const type of [...WITH_AUDIO, "plyr", "native"]) {
  test(`tracks: ${type}, captions through C and the row`, async () => {
    await start("tracks.html?type=" + type);
    await page.waitFor(visible("cc"), 6000);
    const want = await preferred();
    await page.key("c");
    await page.waitFor(`window.__state.text === ${JSON.stringify(want)}`, 2000);
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .cc").classList.contains("on")`), true);
    await clickEl("#video-ultimate-bar .cc");
    assert.deepEqual(await popLabels("cpop"), [t("direct.captions.off"), "English", "Nederlands"]);
    const other = want === "nl" ? "English" : "Nederlands";
    await popButton("cpop", other);
    await page.waitFor(`window.__state.text === ${JSON.stringify(want === "nl" ? "en" : "nl")}`, 2000);
    assert.equal(await osd(), other);
    await page.key("c");
    await page.waitFor(`window.__state.text === null`, 2000);
    assert.equal(await osd(), t("direct.captions.off.osd"));
    await page.key("c");
    await page.waitFor(`window.__state.text === ${JSON.stringify(want === "nl" ? "en" : "nl")}`, 2000);
    assert.equal(await page.eval(visible("aud")), WITH_AUDIO.includes(type));
  });
}

test("tracks: the captions popup opens above CC in the bottom bar and closes after a choice", async () => {
  await start("tracks.html?type=jwplayer");
  await page.waitFor(visible("cc"), 6000);
  await clickEl("#video-ultimate-bar .cc");
  const [pop, cc] = await page.eval(`[document.querySelector("#video-ultimate-bar .cpop").getBoundingClientRect().bottom, document.querySelector("#video-ultimate-bar .cc").getBoundingClientRect().top]`);
  assert.ok(pop <= cc, pop + " > " + cc);
  await popButton("cpop", "English");
  await page.waitFor(`window.__state.text === "en"`, 2000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .cpop").classList.contains("open")`), false);
});

test("tracks: one popup at a time, and Audio sits next to CC in the bottom bar", async () => {
  await start("hls-tracks.html");
  await page.waitFor(visible("cc") + " && " + visible("aud"), 15000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .cc").nextElementSibling === document.querySelector("#video-ultimate-bar .aud")`), true);
  await clickEl("#video-ultimate-bar .cc");
  await clickEl("#video-ultimate-bar .aud");
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .cpop").classList.contains("open")`), false);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .apop").classList.contains("open")`), true);
});

test("tracks: real hls.js, subtitles and a second audio track", async () => {
  await start("hls-tracks.html");
  await page.waitFor(visible("cc") + " && " + visible("aud"), 15000);
  const want = await preferred();
  await page.key("c");
  await page.waitFor(`window.__hls.subtitleTrack === ${want === "nl" ? 1 : 0}`, 3000);
  await clickEl("#video-ultimate-bar .aud");
  assert.deepEqual(await popLabels("apop"), ["English", "Nederlands"]);
  await popButton("apop", "Nederlands");
  await page.waitFor(`window.__hls.audioTrack === 1`, 3000);
  await page.key("c");
  await page.waitFor(`window.__hls.subtitleTrack === -1`, 3000);
});
