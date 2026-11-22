import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { page, start, leaks } from "./direct-helpers.js";

const CAPTURE = path.join(import.meta.dirname, "..", "..", "dist", "capture.js");

// A closed shadow root is only known when capture runs before the page (the
// extension, SPEC §4.5); an open one is also found by walking the page.
for (const [name, query, early] of [["open", "mode=open", false], ["closed", "mode=closed", true], ["slotted", "slot", false]]) {
  test(`shadow DOM: a video ${name === "slotted" ? "shown through a slot" : "in " + (name === "open" ? "an" : "a") + " " + name + " shadow root"} gets Direct, and closing leaves nothing behind`, async () => {
    let script = null;
    if (early) script = (await page.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(CAPTURE, "utf8") })).identifier;
    try {
      await start("shadow.html?" + query, { hover: "shadow-player" });
    } finally {
      if (script) await page.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script });
    }
    await page.waitFor(`window.__video.getAttribute("data-vu-id") !== null && !!document.querySelector("#video-ultimate-bar")`, 6000);
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar").getRootNode() === document`), true, "the bars lie in the page itself");
    await page.waitFor(`window.__bar.hasAttribute("data-vu-hide") && getComputedStyle(window.__bar).visibility === "hidden"`, 3000);
    await page.hover("shadow-player");
    await page.key("r");
    await page.waitFor(`getComputedStyle(window.__video).transform !== "none"`, 2000);
    const was = await page.eval("window.__video.paused");
    await page.click("shadow-player");
    await page.waitFor(`window.__video.paused === ${!was}`, 2000);
    await page.key("m");
    await page.waitFor(`window.__muteClicks === 1`, 2000);
    await page.eval("window.__vuClose()");
    assert.equal(await page.eval(`window.__root.adoptedStyleSheets.length`), 0);
    assert.equal(await page.eval(`getComputedStyle(window.__video).transform`), "none");
    assert.equal(await page.eval(`window.__bar.hasAttribute("data-vu-hide") || window.__bar.getAttribute("style") !== null || window.__video.hasAttribute("data-vu")`), false);
    assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
  });
}
