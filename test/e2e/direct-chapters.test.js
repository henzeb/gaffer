import { test } from "node:test";
import assert from "node:assert/strict";
import { page, start, vid, leaks, osd, popButton, popLabels } from "./direct-helpers.js";

const name = `document.querySelector("#video-ultimate-bar .chap").textContent`;
const gone = `document.querySelector("#video-ultimate-bar .chap").classList.contains("gone")`;
const marks = `document.querySelectorAll("#video-ultimate-bar .chaps i").length`;

const SOURCES = [["youtube", "youtube"], ["jwplayer", "jwplayer"], ["videojs", "videojs"], ["plyr", "plyr"], ["shaka", "shaka"], ["shaka", "shaka5"], ["bitmovin", "bitmovin"], ["theoplayer", "theoplayer"], ["vidstack", "vidstack"], ["native", "native"], ["native", "session"]];

for (const [type, ch] of SOURCES) {
  test(`chapters: ${ch}, marks, name and list`, async () => {
    await start("tracks.html?type=" + type + "&chapters=" + ch);
    await page.waitFor(`${marks} === 2 && !(${gone}) && ${name} === "Intro"`, 8000);
    await page.hover("#vid");
    await page.click("#video-ultimate-bar .chap");
    assert.deepEqual(await popLabels("hpop"), ["0:00  Intro", "0:20  Middle", "0:40  End"]);
    await popButton("hpop", "0:20  Middle");
    await page.waitFor(`Math.abs(document.getElementById("vid").currentTime - 20) < 3 && ${name} === "Middle"`, 3000);
    if (["videojs", "theoplayer", "vidstack", "native"].includes(ch)) {
      assert.equal(await page.eval("window.__chTrack.mode"), "hidden");
      await page.eval("window.__vuClose()");
      assert.equal(await page.eval("window.__chTrack.mode"), "disabled");
    }
  });
}

test("chapters: a mark stands where the seek bar gives that time, and the seek bar names the chapter", async () => {
  await start("tracks.html?type=youtube&chapters=youtube");
  await page.waitFor(`${marks} === 2`, 8000);
  await page.hover("#vid");
  const m = await page.eval(`(() => { const r = document.querySelectorAll("#video-ultimate-bar .chaps i")[1].getBoundingClientRect(); const k = document.querySelector("#video-ultimate-bar .seek").getBoundingClientRect(); return { x: r.left + r.width / 2, y: k.top + k.height / 2, mid: Math.abs(r.top + r.height / 2 - (k.top + k.height / 2)) }; })()`);
  assert.ok(m.mid < 1.5, "mark centred on the seek bar: " + m.mid);
  await page.move(m.x + 4, m.y);
  assert.match(await page.eval(`document.querySelector("#video-ultimate-bar .seek").title`), /^0:4\d · End$/);
  // Just outside the reach of the mark the time is the one under the mouse.
  await page.clickAt(m.x + 14, m.y);
  const time = await vid("v.currentTime");
  assert.ok(time > 41 && time < 43, String(time));
});

test("chapters: gone for another video, and no chapters means no name and no marks", async () => {
  await start("tracks.html?type=youtube&chapters=youtube");
  await page.waitFor(`${marks} === 2`, 8000);
  await page.eval("window.__ytOther = true");
  await page.waitFor(`${marks} === 0 && ${gone}`, 5000);
  await start("tracks.html?type=youtube");
  await page.sleep(1500);
  assert.equal(await page.eval(`${marks} === 0 && ${gone}`), true);
});

test("chapters: frames of another domain do not get in the way", async () => {
  await page.open("tracks.html?type=youtube&chapters=youtube");
  await page.eval(`new Promise((ok) => { const f = document.createElement("iframe"); f.onload = ok; f.src = "http://localhost:" + location.port + "/video.html"; document.body.appendChild(f); })`);
  await page.run("direct");
  await page.waitFor(`${marks} === 2`, 8000);
  assert.deepEqual(page.logs.filter((l) => /Gaffer Direct/.test(l)), []);
});

test("chapters: closing leaves nothing behind", async () => {
  await start("tracks.html?type=native&chapters=native");
  await page.waitFor(`${marks} === 2`, 8000);
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
  assert.equal(await page.eval("window.__chTrack.mode"), "disabled");
});

test("chapters: hidden during an ad", async () => {
  await start("tracks.html?type=youtube&chapters=youtube");
  await page.waitFor(`${marks} === 2`, 8000);
  await page.eval(`document.getElementById("player").classList.add("ad-showing")`);
  await page.waitFor(`${marks} === 0 && ${gone}`, 2000);
  await page.eval(`document.getElementById("player").classList.remove("ad-showing")`);
  await page.waitFor(`${marks} === 2 && !(${gone})`, 4000);
});

const still = (expr) => page.eval(`(() => { const v = document.getElementById("vid"); v.pause(); ${expr || ""} })()`);
const mark = (i, dx = 0) => page.eval(`(() => { const r = document.querySelectorAll("#video-ultimate-bar .chaps i")[${i}].getBoundingClientRect(); const k = document.querySelector("#video-ultimate-bar .seek").getBoundingClientRect(); return { x: r.left + r.width / 2 + ${dx}, y: k.top + k.height / 2 }; })()`);
const near = `[...document.querySelectorAll("#video-ultimate-bar .chaps i")].map((m) => m.classList.contains("near")).join()`;
const mouse = (type, x, y) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

async function chapterPage() {
  await start("tracks.html?type=youtube&chapters=youtube");
  await page.waitFor(`${marks} === 2`, 8000);
  await still();
  await page.hover("#vid");
}

test("chapters: a click on or near a mark goes exactly to the chapter", async () => {
  await chapterPage();
  for (const [i, dx, time, title] of [[1, 0, 40, "End"], [0, 6, 20, "Middle"], [1, -6, 40, "End"]]) {
    const m = await mark(i, dx);
    await page.clickAt(m.x, m.y);
    assert.equal(await vid("v.currentTime"), time);
    assert.equal(await osd(), title);
    await page.waitFor(`Math.abs(+document.querySelector("#video-ultimate-bar .seek").value - ${time} / document.getElementById("vid").duration * 1000) <= 1`, 2000);
  }
  // Also above and below the line, as high as the mark is.
  for (const dy of [-5, 5]) {
    await still("v.currentTime = 1;");
    const m = await mark(0, 2);
    await page.clickAt(m.x, m.y + dy);
    assert.equal(await vid("v.currentTime"), 20, "dy " + dy);
  }
  const k = await page.eval(`(() => { const r = document.querySelector("#video-ultimate-bar .seek").getBoundingClientRect(); return { x: r.left + 11, y: r.top + r.height / 2 }; })()`);
  await page.clickAt(k.x, k.y);
  assert.equal(await vid("v.currentTime"), 0);
});

test("chapters: the mark under the mouse lights up and names its chapter", async () => {
  await chapterPage();
  const m = await mark(1, -5);
  await page.move(m.x, m.y);
  assert.equal(await page.eval(near), "false,true");
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .seek").title`), "0:40 · End");
  await page.move(m.x - 40, m.y);
  assert.equal(await page.eval(near), "false,false");
  await page.move(m.x, m.y);
  await page.hover("#vid");
  assert.equal(await page.eval(near), "false,false");
});

test("chapters: pressing a mark seeks only on release, and dragging away from it is free", async () => {
  await chapterPage();
  await still("v.currentTime = 1;");
  const m = await mark(1, 4);
  await mouse("mouseMoved", m.x, m.y);
  await mouse("mousePressed", m.x, m.y);
  assert.equal(await vid("v.currentTime"), 1);
  await mouse("mouseReleased", m.x, m.y);
  assert.equal(await vid("v.currentTime"), 40);
  await still("v.currentTime = 1;");
  await page.drag(m.x, m.y, m.x - 100, m.y);
  const away = await vid("v.currentTime");
  assert.ok(away > 25 && away < 38, String(away));
  // Ending a drag on a mark does not snap either.
  const a = await mark(1, 30);
  const b = await mark(1, 5);
  await page.drag(a.x, a.y, b.x, b.y);
  const end = await vid("v.currentTime");
  assert.ok(end > 40.1 && end < 42, String(end));
});

test("chapters: marks close together leave room between them", async () => {
  await page.open("tracks.html?type=youtube&chapters=youtube");
  await page.eval(`(() => { const p = document.getElementById("player"); const get = p.getWatchNextResponse; p.getWatchNextResponse = () => { const r = get(); r.playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap[1].value.chapters[2].chapterRenderer.timeRangeStartMillis = 21000; return r; }; })()`);
  await page.run("direct");
  await page.waitFor(`${marks} === 2`, 8000);
  await still();
  await page.hover("#vid");
  const a = await mark(0);
  const b = await mark(1);
  assert.ok(b.x - a.x < 16, "close together: " + (b.x - a.x));
  await page.clickAt((a.x + b.x) / 2, a.y);
  const time = await vid("v.currentTime");
  assert.ok(time > 20.1 && time < 20.9, String(time));
  await page.clickAt(a.x + 1, a.y);
  assert.equal(await vid("v.currentTime"), 20);
  await page.clickAt(b.x - 1, b.y);
  assert.equal(await vid("v.currentTime"), 21);
});

const watchSeek = () => page.eval(`(() => { window.__gafferTiming = 1; const k = document.querySelector("#video-ultimate-bar .seek"); window.__vals = []; const f = () => { const n = +k.value; if (window.__vals[window.__vals.length - 1] !== n) window.__vals.push(n); window.__raf = requestAnimationFrame(f); }; f(); })()`);
const pick = async (label) => { await page.hover("#vid"); await page.click("#video-ultimate-bar .chap"); await popButton("hpop", label); };
const dist = (time) => `Math.abs(+document.querySelector("#video-ultimate-bar .seek").value - ${time} / document.getElementById("vid").duration * 1000)`;

test("chapters: the seek bar slides to the chosen chapter, forwards and back", async () => {
  await chapterPage();
  await still("v.currentTime = 1;");
  await page.waitFor(`${dist(1)} <= 1`, 2000);
  await watchSeek();
  for (const [label, time, up] of [["0:40  End", 40, true], ["0:20  Middle", 20, false]]) {
    await page.eval("window.__vals.length = 0");
    await pick(label);
    assert.equal(await vid("v.currentTime"), time);
    await page.waitFor(`${dist(time)} <= 0.5`, 2000);
    const vals = await page.eval("window.__vals");
    assert.ok(vals.length > 5, "steps: " + vals);
    for (let i = 1; i < vals.length; i++) assert.ok(up ? vals[i] >= vals[i - 1] : vals[i] <= vals[i - 1], "one way: " + vals);
  }
  await page.eval("cancelAnimationFrame(window.__raf)");
});

test("chapters: another seek or an ad stops the slide, and reduced motion has none", async () => {
  await chapterPage();
  await still("v.currentTime = 1;");
  await page.waitFor(`${dist(1)} <= 1`, 2000);
  await page.eval("window.__gafferTiming = 10");
  await pick("0:40  End");
  await page.waitFor(`${dist(40)} > 50 && ${dist(1)} > 20`, 2000);
  await still("v.currentTime = 10;");
  await page.waitFor(`${dist(10)} <= 1`, 2000);
  await pick("0:40  End");
  await page.waitFor(`${dist(40)} > 50 && ${dist(10)} > 20`, 2000);
  await page.eval(`document.getElementById("player").classList.add("ad-showing")`);
  await page.waitFor(`${dist(40)} <= 1`, 1000);
  await page.eval(`document.getElementById("player").classList.remove("ad-showing")`);
  await page.waitFor(`${marks} === 2`, 4000);
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  try {
    await pick("0:20  Middle");
    assert.equal(await page.eval(`${dist(20)} <= 1`), true);
  } finally {
    await page.send("Emulation.setEmulatedMedia", { features: [] });
  }
});

test("chapters: that arrive after the start appear at once, also after many scans", async () => {
  await page.open("tracks.html?type=youtube&chapters=youtube");
  await page.eval(`(() => { const p = document.getElementById("player"); const get = p.getWatchNextResponse; window.__late = true; p.getWatchNextResponse = () => (window.__late ? null : get()); })()`);
  await page.run("direct");
  await page.sleep(6500);
  assert.equal(await page.eval(marks), 0);
  await page.eval("window.__late = false; document.getElementById('vid').dispatchEvent(new Event('playing'))");
  assert.equal(await page.eval(marks), 2);
});

test("chapters: closing during a slide leaves nothing behind", async () => {
  await chapterPage();
  await page.eval("window.__gafferTiming = 10");
  await pick("0:40  End");
  await page.eval("window.__vuClose()");
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
  await page.sleep(300);
  assert.deepEqual(page.logs.filter((l) => /error|Gaffer Direct/i.test(l)), []);
});
