import { test } from "node:test";
import assert from "node:assert/strict";
import { page, start, vid, leaks, osd } from "./direct-helpers.js";
import { t } from "../../src/shared/i18n.js";

for (const type of ["youtube", "jwplayer", "videojs", "videojs-sources", "radiant", "shaka", "dommenu", "dashjs3", "bitmovin", "theoplayer", "plyr", "flowplayer", "clappr", "kaltura", "brightcove", "vimeo", "vidstack", "mediatracks"]) {
  test(`quality: ${type}, Max picks 1080p`, async () => {
    await start("players.html?type=" + type);
    await page.waitFor(`document.getElementById("vid").videoHeight === 1080`, 12000);
    await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 3000);
    assert.deepEqual(await page.eval("window.__sets"), [1080]);
    await page.key("q");
    const labels = await page.eval(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].map((b) => b.textContent)`);
    assert.ok(labels.includes("720p") && labels.includes("360p"), labels.join(","));
  });
}

const ADS = "players.html?type=youtube&ad";
const UNAVAILABLE = t("direct.ad.unavailable");
const isFull = `document.documentElement.classList.contains("vu-full")`;
const locked = `document.querySelector("#video-ultimate-bar .seek").disabled`;
const LOCKED = [".skip", ".nav", ".seek", ".spd", ".cc", ".aud"].map((c) => "#video-ultimate-bar " + c);
const transform = () => page.eval(`getComputedStyle(document.getElementById("vid")).transform`);

async function startAd() {
  await page.eval("window.__ad.start()");
  await page.waitFor(locked, 3000);
  await page.waitFor(`document.getElementById("vid").duration < 20`, 5000);
}

async function endAd() {
  await page.eval("window.__ad.end()");
  await page.waitFor(`document.getElementById("vid").duration > 20`, 5000);
  await page.waitFor(`!${locked}`, 3000);
}

test("ads on YouTube: Direct works on the ad, but skipping, seeking and speed are locked", async () => {
  const shown = (sel) => page.eval(`(() => { for (let e = document.querySelector(${JSON.stringify(sel)}); e; e = e.parentElement) { const c = getComputedStyle(e); if (c.visibility !== "visible" || c.opacity === "0" || c.display === "none") return false; } return true; })()`);
  const titles = () => page.eval(`${JSON.stringify(LOCKED)}.map((x) => document.querySelector(x).title)`);
  await start(ADS);
  await page.waitFor(`document.querySelector("#video-ultimate-top .q").textContent === "1080p"`, 12000);
  await page.waitFor(`document.querySelector(".ytp-chrome-bottom").hasAttribute("data-vu-hide")`, 3000);
  await page.key("r");
  await page.key(">");
  await page.waitFor(`document.getElementById("vid").playbackRate === 1.25`, 2000);
  const tips = await titles();
  const turned = await transform();
  assert.notEqual(turned, "none");

  await startAd();
  await page.hover("#vid");
  assert.equal(await page.eval(`getComputedStyle(document.getElementById("video-ultimate-bar")).display === "none"`), false);
  assert.equal(await shown(".ytp-chrome-bottom"), false);
  await page.waitFor(`getComputedStyle(document.querySelector(".ytp-ad-persistent-progress-bar-container")).visibility === "hidden"`, 3000);
  for (const sel of [".video-ads", ".ytp-skip-ad-button", ".ytp-ad-badge"]) assert.ok(await shown(sel), sel);
  assert.equal(await vid("v.playbackRate"), 1);
  assert.equal(await transform(), turned);
  assert.deepEqual(await titles(), LOCKED.map(() => UNAVAILABLE));
  assert.ok(await page.eval(`${JSON.stringify(LOCKED)}.every((x) => [...document.querySelectorAll(x)].every((b) => b.disabled))`));

  const before = await vid("v.currentTime");
  for (const k of ["l", "j", ">", "<", ".", ",", "q", "c"]) {
    await page.key(k);
    assert.equal(await osd(), UNAVAILABLE, k);
    assert.equal(await vid("v.playbackRate"), 1, k);
  }
  await page.eval(`[...document.querySelectorAll("#video-ultimate-bar .nav,#video-ultimate-bar .skip")].forEach((b) => b.click())`);
  await page.eval(`(() => { const k = document.querySelector("#video-ultimate-bar .seek"); k.value = "900"; k.dispatchEvent(new Event("input")); const w = document.querySelector("#video-ultimate-bar .spd"); w.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true })); const r = document.querySelector("#video-ultimate-bar .spdr"); r.value = r.max; r.dispatchEvent(new Event("input")); })()`);
  const after = await vid("v.currentTime");
  assert.ok(after >= before && after < before + 5, before + " → " + after);
  assert.equal(await vid("v.playbackRate"), 1);
  assert.equal(await page.eval("window.__nextClicks"), 0);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .qrow").classList.contains("open")`), false);

  await page.key(" ");
  await page.waitFor(`document.getElementById("vid").paused`, 2000);
  await page.key(" ");
  await page.waitFor(`!document.getElementById("vid").paused`, 2000);
  const muted = await vid("v.muted");
  await page.key("m");
  assert.equal(await vid("v.muted"), !muted);
  await page.key("h");
  const flipped = await transform();
  assert.notEqual(flipped, turned);
  await page.click(".ytp-skip-ad-button");
  assert.equal(await page.eval("window.__adClicks"), 1);
  assert.equal(await vid("v.paused"), false);
  await page.sleep(1200);
  assert.ok(await page.eval(locked));
  assert.deepEqual(await titles(), LOCKED.map(() => UNAVAILABLE));
  assert.deepEqual(await page.eval("window.__sets"), [1080]);

  await endAd();
  await page.waitFor(`document.getElementById("vid").playbackRate === 1.25`, 5000);
  assert.equal(await transform(), flipped);
  assert.deepEqual(await titles(), tips);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-top .q").textContent`), "1080p");
  assert.deepEqual(await page.eval("window.__sets"), [1080]);
  const t0 = await vid("v.currentTime");
  await page.hover("#vid");
  await page.key("l");
  assert.ok((await vid("v.currentTime")) >= t0 + 9);
});

test("ads on YouTube: a drag on the seek bar that was going on stops at the ad", async () => {
  await start(ADS);
  const r = await page.eval(`(() => { const b = document.querySelector("#video-ultimate-bar .seek").getBoundingClientRect(); return { x: b.left, y: b.top + b.height / 2, w: b.width }; })()`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + r.w * 0.2, y: r.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x + r.w * 0.2, y: r.y, button: "left", clickCount: 1 });
  await page.waitFor(`document.getElementById("vid").currentTime > 8`, 2000);
  await startAd();
  const before = await vid("v.currentTime");
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + r.w * 0.9, y: r.y, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x + r.w * 0.9, y: r.y, button: "left", clickCount: 1 });
  await page.sleep(200);
  assert.ok((await vid("v.currentTime")) < before + 3);
  await endAd();
});

test("ads on YouTube: reset during an ad also clears the speed for the video", async () => {
  await start(ADS);
  await page.key(">");
  await page.waitFor(`document.getElementById("vid").playbackRate === 1.25`, 2000);
  for (let i = 0; i < 2; i++) {
    await startAd();
    await page.hover("#vid");
    if (!i) await page.key("0");
    await endAd();
    await page.sleep(300);
    assert.equal(await vid("v.playbackRate"), 1);
  }
});

test("ads on YouTube: fullscreen stays on, with the same locks", async () => {
  await start(ADS);
  await page.key("f");
  await page.waitFor(isFull, 3000);
  await startAd();
  assert.equal(await page.eval(isFull), true);
  const before = await vid("v.currentTime");
  await page.key("l");
  assert.ok((await vid("v.currentTime")) < before + 5);
  await endAd();
  assert.equal(await page.eval(isFull), true);
  await page.key("f");
  await page.waitFor(`!(${isFull})`, 3000);
});

test("ads on YouTube: closing during an ad leaves nothing behind", async () => {
  await start(ADS);
  await startAd();
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
  assert.equal(await page.eval(`document.querySelectorAll("[data-vu-hide],#video-ultimate-bar,#video-ultimate-top").length`), 0);
});

test("ads on YouTube: the Skip button lies over Direct's bar", async () => {
  await start(ADS + "&stack");
  await page.waitFor(`document.getElementById("video-ultimate-bar").parentElement.id === "player"`, 3000);
  await startAd();
  await page.hover("#vid");
  await page.waitFor(`document.getElementById("video-ultimate-bar").parentElement.id === "player"`, 3000);
  const top = await page.eval(`(() => { const k = document.querySelector(".ytp-skip-ad-button"); const r = k.getBoundingClientRect(); const b = document.querySelector("#video-ultimate-bar .spd").getBoundingClientRect(); return { over: r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === k }; })()`);
  assert.deepEqual(top, { over: true, hit: true });
  await page.click(".ytp-skip-ad-button");
  assert.equal(await page.eval("window.__adClicks"), 1);
  const [x, y] = await page.center("#video-ultimate-bar .pp");
  assert.ok(await page.eval(`!!document.elementFromPoint(${x}, ${y}).closest("#video-ultimate-bar .pp")`));
  await endAd();
  await page.waitFor(`document.getElementById("video-ultimate-bar").parentElement.id === "player"`, 3000);
});

test("embed: the bars are there before the start, also while the video lies outside its player, and YouTube's own controls next to the player disappear", async () => {
  const controls = `(getComputedStyle(document.getElementById("player-controls")).display === "none" ? "hidden" : "visible")`;
  await start("embed.html", { hover: null });
  await page.move(400, 100);
  await page.move(410, 110);
  await page.waitFor(`(() => { const b = document.getElementById("video-ultimate-bar"); const r = b.getBoundingClientRect(); const p = document.getElementById("player").getBoundingClientRect(); return !b.classList.contains("v-ui-hide") && r.top > p.top && Math.abs(r.bottom - p.bottom) < 2 && Math.abs(r.width - p.width) < 2; })()`, 3000);
  assert.equal(await page.eval(controls), "visible");
  // At the start, not at the next scan.
  await page.eval(`document.getElementById("vid").addEventListener("playing", () => (window.__atStart = ${controls}))`);
  await page.eval(`document.querySelector("#video-ultimate-bar .pp").click()`);
  await page.waitFor(`document.getElementById("vid").currentTime > 0.2`, 5000);
  assert.equal(await page.eval("window.__atStart"), "hidden");
  await page.eval(`document.getElementById("player-controls").style.display = ""`);
  assert.equal(await page.eval(controls), "hidden");
  await page.hover("#vid");
  await page.waitFor(`Math.abs(document.getElementById("video-ultimate-bar").getBoundingClientRect().bottom - document.getElementById("vid").getBoundingClientRect().bottom) < 2`, 3000);
  await page.clickAt(400, 225);
  await page.waitFor(`document.getElementById("vid").paused`, 2000);
  assert.equal(await page.eval("window.__pauseClicks || 0"), 0);
  await page.eval(`document.getElementById("movie").classList.add("ad-showing")`);
  await page.waitFor(`${controls} === "visible"`, 2000);
  await page.eval(`document.getElementById("movie").classList.remove("ad-showing")`);
  await page.waitFor(`${controls} === "hidden"`, 2000);
  await page.eval("window.__vuClose()");
  assert.equal(await page.eval(controls), "visible");
  assert.equal(await page.eval(`document.getElementById("player-controls").hasAttribute("data-vu-embed")`), false);
});

test("a site that shows the video in a canvas over it (TikTok): the video itself shows, and everything comes back", async () => {
  await page.open("video.html");
  const layer = `(() => { const v = document.getElementById("vid"); v.style.opacity = "0"; const w = document.createElement("tt-vod-sr-wrap"); w.style.cssText = "position:absolute;inset:0;pointer-events:none"; w.innerHTML = '<canvas width="640" height="360" style="width:640px;height:360px"></canvas>'; document.getElementById("player").appendChild(w); })()`;
  const opacity = () => page.eval(`getComputedStyle(document.getElementById("vid")).opacity`);
  await page.eval(layer);
  const style = await page.eval(`document.getElementById("vid").getAttribute("style")`);
  await page.waitFor(`document.getElementById("vid").currentTime > 0.1`, 5000);
  await page.run("direct");
  assert.equal(await page.eval(`getComputedStyle(document.querySelector("tt-vod-sr-wrap")).visibility`), "hidden");
  assert.equal(await opacity(), "1");
  // Without the layer the video is as transparent as the site wants it, as before.
  await page.eval(`document.querySelector("tt-vod-sr-wrap").remove()`);
  await page.waitFor(`getComputedStyle(document.getElementById("vid")).opacity === "0"`, 3000);
  // A layer that comes later.
  await page.eval(`document.getElementById("vid").style.opacity = ""`);
  await page.eval(layer);
  await page.waitFor(`document.getElementById("vid").hasAttribute("data-vu-picture")`, 3000);
  assert.equal(await opacity(), "1");
  await page.eval("window.__vuClose()");
  assert.equal(await opacity(), "0");
  assert.equal(await page.eval(`document.getElementById("vid").getAttribute("style")`), style);
  assert.equal(await page.eval(`document.getElementById("vid").hasAttribute("data-vu-picture")`), false);
  // A small canvas (a logo) does not count.
  await page.open("video.html");
  await page.eval(`(() => { const v = document.getElementById("vid"); v.style.opacity = "0.5"; const c = document.createElement("canvas"); c.width = c.height = 60; c.style.cssText = "position:absolute;left:10px;top:10px"; document.getElementById("player").appendChild(c); })()`);
  await page.waitFor(`document.getElementById("vid").currentTime > 0.1`, 5000);
  await page.run("direct");
  await page.sleep(1200);
  assert.equal(await opacity(), "0.5");
});

test("players: controls the site mounts again on every mouse-over are hidden before they are drawn", async () => {
  await start("remount.html", { hover: null });
  for (let i = 1; i <= 3; i++) {
    await page.move(10, 10);
    await page.sleep(100);
    await page.hover("#vid");
    await page.waitFor(`window.__mounts === ${i} && window.__hiddenAtOnce !== null`, 1000);
    assert.equal(await page.eval("window.__hiddenAtOnce"), true, "mount " + i);
  }
  // What the site took away is let go on the next scan, as it was.
  await page.waitFor(`window.__removed.length === 2 && window.__removed.every((c) => !c.hasAttribute("data-vu-hide") && c.getAttribute("style") === null)`, 3000);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

for (const kind of ["kaltura", "theoplayer", "vimeo", "mejs", "fluid", "clappr", "mediachrome", "vidstack", "wistia"]) {
  test(`players: the controls of ${kind} are hidden by their own class names, and M goes through its mute button`, async () => {
    await start("controls.html?kind=" + kind);
    await page.waitFor(`window.__bars.every((b) => b.hasAttribute("data-vu-hide") && getComputedStyle(b).visibility === "hidden")`, 3000);
    // Vimeo has no mute class: its labelled button among the hidden layers counts.
    if (kind === "vimeo") return;
    await page.key("m");
    await page.waitFor(`window.__muteClicks === 1 && !document.getElementById("vid").muted`, 2000);
  });
}

test("players: an unknown player loses what lies over the video, but keeps a window of the site and an ad", async () => {
  await start("unknown.html");
  const hidden = (sel) => `document.querySelector(${JSON.stringify(sel)}).hasAttribute("data-vu-hide") && getComputedStyle(document.querySelector(${JSON.stringify(sel)})).visibility === "hidden"`;
  const shown = (sel) => `getComputedStyle(document.querySelector(${JSON.stringify(sel)})).visibility === "visible"`;
  await page.waitFor(`${hidden(".ctrl")} && ${hidden(".click")} && ${hidden(".layer")}`, 3000);
  assert.equal(await page.eval(shown(".ima-ad-container")), true, "the ad stays");
  assert.equal(await page.eval(shown("#below")), true, "what lies under the video stays");
  // The bars step aside for the ad, so its Skip button can be clicked; videojs-ima's
  // container that waits for the next ad counts for nothing.
  await page.hover("#vid");
  await page.waitFor(`document.querySelector("#video-ultimate-bar").classList.contains("v-ui-hide")`, 2000);
  await page.click("#skip");
  assert.equal(await page.eval("window.__skipped"), 1);
  await page.eval(`(() => { const a = document.querySelector(".ima-ad-container:not(#idle)"); a.classList.add("hide-ad-container"); a.style.zIndex = "-1"; })()`);
  // Whether a window lies over the video is looked at once per 250 ms: the next
  // movements bring the bars back.
  const back = `!document.querySelector("#video-ultimate-bar").classList.contains("v-ui-hide")`;
  for (let i = 0; i < 10 && !(await page.eval(back)); i++) {
    await page.move(300, 200 + i);
    await page.hover("#vid");
  }
  assert.equal(await page.eval(back), true, "the bars come back after the ad");
  // A window of the site appears later in a layer Direct had hidden.
  await page.eval(`document.querySelector(".gate").hidden = false`);
  await page.waitFor(`${shown(".gate")} && !document.querySelector(".layer").hasAttribute("data-vu-hide")`, 3000);
  await page.click("#accept");
  assert.equal(await page.eval("window.__accepted"), 1);
  // Closed again: the layer goes again.
  await page.eval(`document.querySelector(".gate").hidden = true`);
  await page.waitFor(hidden(".layer"), 3000);
  assert.equal(await page.eval(hidden(".ctrl")), true);
});

for (const [kind, keep] of [["age", true], ["consent", true], ["paywall", true], ["unmute", true], ["bar", false], ["controls", false], ["slider", false]]) {
  test(`players: ${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind} layer over the video ${keep ? "stays, with its buttons, and the bars step aside" : "is hidden like other controls"}`, async () => {
    await start("gates.html?kind=" + kind);
    // Direct has looked once the bars are placed and the first scan has run.
    await page.waitFor(`!!document.querySelector("#video-ultimate-bar") && document.getElementById("vid").hasAttribute("data-vu")`, 4000);
    if (!keep) {
      await page.waitFor(`document.getElementById("layer").hasAttribute("data-vu-hide")`, 3000);
      return;
    }
    await page.waitFor(`document.getElementById("layer").hasAttribute("data-vu-gate")`, 3000);
    // A few scans later it is still shown.
    await page.sleep(1500);
    assert.equal(await page.eval(`!document.getElementById("layer").hasAttribute("data-vu-hide") && getComputedStyle(document.getElementById("layer")).visibility === "visible"`), true);
    // Right after a movement over the video the bars would show; for a
    // threshold they stay away.
    await page.move(60, 60);
    await page.hover("#vid");
    assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar").classList.contains("v-ui-hide")`), true, "the bars step aside");
    await page.click("#layer button, #layer a");
    assert.equal(await page.eval("window.__clicks"), 1);
  });
}
