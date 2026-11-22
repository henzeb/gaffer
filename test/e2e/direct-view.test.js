import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "../../src/shared/i18n.js";
import { page, start, vid, osd } from "./direct-helpers.js";

test("start: panel, bar and marker on the video", async () => {
  await start("video.html");
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-bar").length`), 1);
  assert.equal(await page.eval(`!!document.getElementById("video-ultimate-ui")`), true);
  assert.equal(await page.eval(`document.getElementById("vid").getAttribute("data-vu")`), "1");
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-off")`), false);
  assert.match(await page.eval(`document.querySelector("#video-ultimate-top .help .ver").textContent`), /^Gaffer Direct \d\d-\d\d-\d{4} \d\d:\d\d$/);
});

test("site controls and native controls are hidden", async () => {
  await start("video.html");
  assert.equal(await page.eval(`document.getElementById("vid").controls`), false);
  const st = await page.eval(`document.getElementById("site-controls").style.cssText`);
  assert.match(st, /visibility: hidden !important/);
  assert.match(st, /pointer-events: none !important/);
});

test("rotate: [ ] (Shift 1°) and R for a quarter turn", async () => {
  await start("video.html");
  await page.key("]");
  assert.match(await page.dyn(), /rotate\(5deg\)/);
  await page.key("[", { shift: true });
  assert.match(await page.dyn(), /rotate\(4deg\)/);
  await page.key("r");
  assert.match(await page.dyn(), /rotate\(90deg\) scale\(0\.5625\)/);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-ui .val").textContent`), "90°");
  await page.key("r"); await page.key("r"); await page.key("r");
  assert.doesNotMatch(await page.dyn(), /transform:/);
});

test("mirror H / V", async () => {
  await start("video.html");
  await page.key("h");
  assert.match(await page.dyn(), /scale\(-1,1\)/);
  await page.key("v");
  assert.match(await page.dyn(), /scale\(-1,-1\)/);
});

test("zoom: + / − and Ctrl + scroll towards the point under the mouse", async () => {
  await start("video.html");
  await page.key("+");
  assert.match(await page.dyn(), /rotate\(0deg\) scale\(1\.1\)/);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-ui .zm").textContent`), "1.1×");
  await page.key("-");
  assert.doesNotMatch(await page.dyn(), /transform:/);
  const before = await page.eval("scrollY");
  await page.wheel(100, 100, -100, 2);
  const d = await page.dyn();
  assert.match(d, /scale\(1\.1\)/);
  assert.doesNotMatch(d, /translate\(0px,0px\)/, "zooming towards the point under the mouse moves the picture");
  assert.equal(await osd(), t("direct.osd.zoom", { zoom: "1.1" }));
  assert.equal(await page.eval("scrollY"), before, "Ctrl + scroll does not scroll the page");
});

test("scrolling without Ctrl does not zoom and scrolls the page", async () => {
  await start("video.html");
  await page.wheel(300, 200, 200);
  await page.sleep(200);
  assert.doesNotMatch(await page.dyn(), /transform:/);
  assert.ok((await page.eval("scrollY")) > 0);
});

test("a video that fills the window zooms on scrolling without Ctrl", async () => {
  await start("window-fill.html");
  await page.wheel(400, 300, -100);
  assert.match(await page.dyn(), /scale\(1\.1\)/);
  assert.equal(await page.eval("scrollY"), 0);
});

test("pan with arrows (30 px, Shift 90 px) within the bounds of the zoom", async () => {
  await start("video.html");
  await page.key("ArrowLeft");
  assert.doesNotMatch(await page.dyn(), /transform:/, "without zoom the picture can't move");
  for (let i = 0; i < 8; i++) await page.key("+");
  await page.key("ArrowLeft");
  assert.match(await page.dyn(), /translate\(30px,0px\)/);
  await page.key("ArrowUp", { shift: true });
  assert.match(await page.dyn(), /translate\(30px,90px\)/);
});

test("dragging pans without toggling play/pause", async () => {
  await start("video.html");
  for (let i = 0; i < 8; i++) await page.key("+");
  const paused = await vid("v.paused");
  await page.drag(360, 220, 300, 180);
  await page.sleep(450);
  assert.match(await page.dyn(), /translate\(-60px,-40px\)/);
  assert.equal(await vid("v.paused"), paused);
});

test("reset with 0 restores everything, including the speed", async () => {
  await start("video.html");
  await page.key("]"); await page.key("+"); await page.key("h"); await page.key(">");
  await page.key("0");
  assert.doesNotMatch(await page.dyn(), /transform:/);
  assert.equal(await vid("v.playbackRate"), 1);
  assert.equal(await osd(), t("direct.osd.reset"));
});

test("shortcuts only work with the mouse over the video or the panel", async () => {
  await start("video.html", { hover: null });
  await page.move(1200, 700);
  await page.key("r");
  assert.doesNotMatch(await page.dyn(), /transform:/);
  await page.hover("#vid");
  await page.key("r");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
});

test("speed: < > steps, , . fine, scroll on the button", async () => {
  await start("video.html");
  await page.key(">");
  assert.equal(await vid("v.playbackRate"), 1.25);
  await page.key(".");
  assert.equal(await vid("v.playbackRate"), 1.3);
  await page.key(",");
  await page.key(",");
  assert.equal(await vid("v.playbackRate"), 1.2);
  await page.key("<");
  assert.equal(await vid("v.playbackRate"), 1);
  assert.equal(await osd(), "1.00×");
  const [x, y] = await page.center('#video-ultimate-bar button.spd');
  await page.wheel(x, y, -100);
  assert.equal(await vid("v.playbackRate"), 1.05);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .spd").textContent`), "1.05×");
});

test("keep pitch with P", async () => {
  await start("video.html");
  assert.equal(await vid("v.preservesPitch"), true);
  await page.key("p");
  assert.equal(await vid("v.preservesPitch"), false);
  assert.equal(await osd(), t("direct.osd.pitchFree"));
});

test("sound: M toggles, PageUp / PageDown volume", async () => {
  await start("video.html");
  assert.equal(await vid("v.muted"), true);
  await page.key("m");
  assert.equal(await vid("v.muted"), false);
  assert.equal(await osd(), t("direct.osd.volume", { volume: 100 }));
  await page.key("PageDown");
  assert.equal(await vid("v.volume"), 0.95);
  await page.key("m");
  assert.equal(await vid("v.muted"), true);
  assert.equal(await osd(), t("direct.osd.muted"));
});

test("fullscreen with the button: the shortcuts keep working and Space does not press the button again", async () => {
  await start("video.html");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.clickButton(t("direct.fullscreen"));
  assert.equal(await page.eval(`document.documentElement.classList.contains("vu-full")`), true);
  assert.equal(await page.eval(`document.activeElement === document.body`), true);
  await page.key("r");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
  await page.key(" ");
  assert.equal(await vid("v.paused"), true);
  assert.equal(await page.eval(`document.documentElement.classList.contains("vu-full")`), true);
  await page.key("f");
  assert.equal(await page.eval(`document.documentElement.classList.contains("vu-full")`), false);
});

test("fullscreen with F, back with the button", async () => {
  await start("video.html");
  await page.key("f");
  assert.equal(await page.eval(`document.documentElement.classList.contains("vu-full")`), true);
  assert.match(await page.dyn(), /position:fixed/);
  assert.equal(await vid(`v.hasAttribute("popover")`), true);
  await page.clickButton(t("direct.fullscreen.exit"));
  assert.equal(await page.eval(`document.documentElement.classList.contains("vu-full")`), false);
  assert.equal(await vid(`v.hasAttribute("popover")`), false);
  assert.doesNotMatch(await page.dyn(), /position:fixed/);
});

test("new URL with the same video: rotation, zoom and mirroring are reset, the speed is not", async () => {
  await start("video.html");
  await page.key("r");
  await page.key("+");
  await page.key("h");
  await page.key(".");
  assert.match(await page.dyn(), /rotate\(90deg\)/);
  await page.eval(`history.pushState({}, "", "?andere")`);
  await page.waitFor(`!/transform:/.test(document.getElementById("vu-dyn").textContent)`, 3000);
  assert.equal(await vid("v.playbackRate.toFixed(2)"), "1.05");
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-ui .zm").textContent`), "1.0×");
});

test("layers: the bars lie in the player, a site popup outside the player goes over them", async () => {
  await start("layers.html");
  await page.waitFor(`document.getElementById("video-ultimate-bar").style.getPropertyValue("--vu-z") === "0"`, 3000);
  await page.hover("#vid");
  const at = `(() => { const r = document.querySelector("#video-ultimate-bar .pp").getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); })()`;
  assert.equal(await page.eval(`!!${at}.closest("#video-ultimate-bar")`), true, "the captions with z-index 50 catch no clicks");
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").hasAttribute("popover")`), false);
  await page.eval("showBalloon()");
  await page.hover("#vid");
  const onBalloon = `(() => { const r = document.querySelector("#video-ultimate-bar .pp").getBoundingClientRect(); const b = document.getElementById("balloon").getBoundingClientRect(); return document.elementFromPoint(Math.max(r.left, b.left) + 5, r.top + r.height / 2); })()`;
  assert.equal(await page.eval(`${onBalloon}.id`), "balloon", "a balloon from a button below the video goes over the bars, despite a hidden menu with z-index 2000 in the player");
  await page.eval(`document.getElementById("balloon").style.display = "none"`);
  await page.eval("showTipIn()");
  await page.sleep(1300);
  await page.hover("#vid");
  assert.equal(await page.eval(`document.getElementById("video-ultimate-bar").style.getPropertyValue("--vu-z")`), "0", "a popup inside the player does not raise the bars");
  assert.equal(await page.eval(`${at}.id`), "tipIn", "a popup inside the player goes over the bars");
  await page.waitFor(`!document.getElementById("vid").paused`);
  await page.click("#tipIn");
  await page.sleep(450);
  assert.equal(await page.eval(`document.getElementById("vid").paused`), false, "a click on the popup does not pause the video");
  await page.eval(`document.getElementById("tipIn").style.display = "none"`);
  await page.eval("showCarousel()");
  await page.hover("#vid");
  assert.equal(await page.eval(`${at}.closest("#carousel") !== null`), true, "the popup covers the bars");
});

const full = `document.documentElement.classList.contains("vu-full")`;
const barUsable = `(() => { const b = document.getElementById("video-ultimate-bar"); const r = b.querySelector(".pp").getBoundingClientRect(); const hit = r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !b.classList.contains("v-ui-hide") && !!hit && b.contains(hit); })()`;
const barsParent = `["video-ultimate-bar", "video-ultimate-top"].map((id) => document.getElementById(id).parentElement.id || document.getElementById(id).parentElement.tagName).join()`;
const wiggle = async () => { await page.move(300, 250); await page.move(320, 260); };

async function realFullscreen(fn) {
  await page.send("Browser.setPermission", { permission: { name: "fullscreen", allowWithoutGesture: true }, setting: "granted" });
  try {
    await fn();
  } finally {
    await page.eval(`document.fullscreenElement && document.exitFullscreen().catch(() => {})`);
    await page.send("Browser.resetPermissions");
  }
}

test("fullscreen: the bars stay when the site moves the video and hides the player's box", async () => {
  await realFullscreen(async () => {
    await start("fullscreen-move.html");
    await page.waitFor(`${barsParent} === "player,player" || ${barsParent} === "movie,movie"`, 3000);
    const before = await page.eval(barsParent);
    await page.key("f");
    await page.waitFor(`!!document.fullscreenElement && document.getElementById("player").style.display === "none"`, 3000);
    await wiggle();
    await page.waitFor(barUsable, 3000);
    assert.equal(await page.eval(barsParent), "BODY,BODY");
    assert.equal(await page.eval(`document.getElementById("vid").matches(":popover-open")`), true);
    await page.sleep(1200);
    await wiggle();
    assert.equal(await page.eval(barUsable), true);
    await page.key("f");
    await page.waitFor(`!document.fullscreenElement && !(${full})`, 3000);
    await page.waitFor(`${barsParent} === ${JSON.stringify(before)}`, 3000);
    await page.hover("#vid");
    await page.waitFor(barUsable, 3000);
  });
});

test("fullscreen: a site window behind the video does not hide the bars, one above it does", async () => {
  await start("fullscreen-move.html");
  await page.eval(`document.getElementById("site-dialog").classList.add("on")`);
  await wiggle();
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  await page.eval(`document.getElementById("site-dialog").classList.remove("on")`);
  await page.hover("#vid");
  await page.waitFor(barUsable, 3000);
  await page.key("f");
  await page.waitFor(full, 3000);
  await page.eval(`document.getElementById("site-dialog").classList.add("on")`);
  await page.sleep(400);
  await wiggle();
  await page.waitFor(barUsable, 3000);
  await page.eval(`document.getElementById("modal").showModal()`);
  await page.waitFor(`document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`, 3000);
  await page.eval(`document.getElementById("modal").close()`);
  await page.sleep(400);
  await wiggle();
  await page.waitFor(barUsable, 3000);
  await page.key("f");
});

const filterOf = (sel) => page.eval(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).filter`);

test("exposure: B and N (Shift lower) set brightness and contrast as a filter in Direct's own style rule", async () => {
  await start("video.html");
  const style = await page.eval(`document.getElementById("vid").getAttribute("style")`);
  assert.equal(await filterOf("#vid"), "none");
  for (let i = 0; i < 4; i++) await page.key("b");
  assert.equal(await osd(), t("direct.osd.brightness", { value: 120 }));
  for (let i = 0; i < 2; i++) await page.key("N", { shift: true });
  assert.equal(await osd(), t("direct.osd.contrast", { value: 90 }));
  assert.equal(await filterOf("#vid"), "brightness(1.2) contrast(0.9)");
  assert.match(await page.dyn(), /filter:brightness\(1\.2\) contrast\(0\.9\)/);
  assert.equal(await page.eval(`document.getElementById("vid").getAttribute("style")`), style, "the video's own style is untouched");
  for (let i = 0; i < 30; i++) await page.key("b");
  assert.equal(await filterOf("#vid"), "brightness(2) contrast(0.9)", "at most 200");
  await page.key("0");
  assert.equal(await filterOf("#vid"), "none");
});

test("exposure: the sliders in the panel, their values, ↺ and shortcuts while a slider has the focus", async () => {
  await start("video.html");
  await page.key("t");
  await page.waitFor(`document.getElementById("video-ultimate-top").classList.contains("tools")`);
  const slider = `document.querySelectorAll("#video-ultimate-ui input.lr")`;
  await page.eval(`(() => { const r = ${slider}[1]; r.value = "150"; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  assert.equal(await filterOf("#vid"), "brightness(1) contrast(1.5)");
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-ui .lv")[1].textContent`), "150");
  await page.click("#video-ultimate-ui input.lr");
  await page.waitFor(`document.activeElement && document.activeElement.classList.contains("lr")`, 2000);
  await page.hover("#vid");
  await page.key("n");
  assert.equal(await page.eval(`${slider}[1].value`), "155", "the slider follows the shortcut");
  await page.clickButton(t("direct.panel.light.reset"));
  assert.equal(await filterOf("#vid"), "none");
  assert.deepEqual([await page.eval(`${slider}[0].value`), await page.eval(`${slider}[1].value`)], ["100", "100"]);
});

test("exposure: the picture before the start gets it along, a new item resets it, and closing leaves nothing", async () => {
  await page.open("poster.html?overlay");
  await page.run("direct");
  await page.hover("#vid");
  await page.waitFor(`document.getElementById("cover").hasAttribute("data-vu-poster")`, 3000);
  await page.key("b");
  assert.equal(await filterOf("#cover"), "brightness(1.05) contrast(1)");
  await page.eval("window.__vuClose()");
  assert.equal(await filterOf("#cover"), "none");
  await start("feed.html");
  await page.key("b");
  assert.match(await page.dyn(), /brightness\(1\.05\)/);
  await page.clickButton(t("direct.nav.nextSite"));
  await page.waitFor(`Math.round(document.getElementById("vid").duration) === 10`, 5000);
  await page.waitFor(`!/filter:/.test(document.getElementById("vu-dyn").textContent)`, 3000);
  assert.equal(await filterOf("#vid"), "none");
});

test("exposure: a filter of the site stays while exposure is 100, and is back after closing", async () => {
  await page.open("video.html");
  await page.eval(`document.getElementById("vid").style.filter = "grayscale(1)"`);
  await page.run("direct");
  await page.hover("#vid");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`);
  assert.equal(await filterOf("#vid"), "grayscale(1)");
  await page.key("b");
  assert.equal(await filterOf("#vid"), "brightness(1.05) contrast(1)");
  await page.eval("window.__vuClose()");
  assert.equal(await filterOf("#vid"), "grayscale(1)");
});

test("exposure: the sliders leave the panel on a narrow video, the shortcuts keep working", async () => {
  await start("video.html");
  await page.eval(`document.getElementById("vid").style.width = "420px"`);
  await page.key("t");
  await page.waitFor(`document.getElementById("video-ultimate-top").classList.contains("p1")`, 3000);
  assert.equal(await page.eval(`getComputedStyle(document.querySelector("#video-ultimate-ui .grp.light")).display`), "none");
  await page.hover("#vid");
  await page.key("b");
  assert.equal(await filterOf("#vid"), "brightness(1.05) contrast(1)");
});
