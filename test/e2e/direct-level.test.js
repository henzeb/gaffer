import { test } from "node:test";
import assert from "node:assert/strict";
import { page, start, vid, osd, leaks, clickEl } from "./direct-helpers.js";

const LOUD = -8;
const SOFT = -24;
const vol = `document.getElementById("vid").volume`;
const heard = (lufs) => `${lufs} + 20 * Math.log10(${vol})`;
const near = (lufs, target, d = 1) => `Math.abs(${heard(lufs)} - (${target})) < ${d}`;
const title = `document.querySelector("#video-ultimate-bar .vpop .lev").title`;
// Level 50 is then -26 LUFS.
const REF = -20;
const set = (on, value, ref = REF) => page.eval(`localStorage.setItem("vu-level", JSON.stringify({ on: ${on}, value: ${value}, ref: ${ref} }))`);
const stored = `JSON.parse(localStorage.getItem("vu-level") || "{}")`;
const number = () => page.eval(`document.querySelector("#video-ultimate-bar .pval").textContent`);
const lit = () => page.eval(`document.querySelector("#video-ultimate-bar .lev").classList.contains("on")`);
const clear = () => page.eval(`localStorage.removeItem("vu-level")`);

async function begin(query, on, value) {
  await page.open("level.html?" + query);
  if (on === undefined) await clear();
  else await set(on, value);
  await page.eval("window.__track.mark()");
  await page.run("direct");
  await page.hover("#vid");
}

test("level: a loud and a softer video come out at the same level", async () => {
  await begin("src=loud", true, 50);
  await page.waitFor(near(LOUD, -26), 5000);
  await page.eval(`window.__play("soft")`);
  await page.waitFor(near(SOFT, -26), 8000);
  await page.eval(`window.__play("loud")`);
  await page.waitFor(near(LOUD, -26), 5000);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .pval").textContent`), "50");
});

test("level: the volume of the site does not matter, and closing gives it back", async () => {
  await begin("src=loud&volume=0.7", true, 50);
  await page.waitFor(near(LOUD, -26), 5000);
  await page.eval(`${vol} = 0.9`);
  await page.waitFor(near(LOUD, -26), 3000);
  await page.eval("window.__vuClose()");
  assert.equal(await vid("v.volume"), 0.9);
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
  const t = await vid("v.currentTime");
  await page.waitFor(`document.getElementById("vid").currentTime !== ${t}`, 2000);
  await clear();
});

async function button() {
  await page.hover("#vid");
  if (!(await page.eval(`document.querySelector("#video-ultimate-bar .vpop").classList.contains("open")`))) await page.click("#video-ultimate-bar .volbtn");
  await clickEl("#video-ultimate-bar .vpop .lev");
}

test("level: off by default, and switching on or off does not change the number", async () => {
  await begin("src=loud&volume=0.5");
  await page.sleep(800);
  assert.equal(await vid("v.volume"), 0.5);
  await page.click("#video-ultimate-bar .volbtn");
  assert.equal(await page.eval(title), "Same level for every video: off");
  await button();
  assert.equal(await osd(), "Same level for every video: 50");
  assert.match(await page.eval(title), /listening/);
  await page.waitFor(`${stored}.on === true && Math.abs(${stored}.ref - (${LOUD})) < 1`, 5000);
  await page.waitFor(`!/listening/.test(${title})`, 2000);
  assert.deepEqual([await lit(), await number(), await vid("v.volume")], [true, "50", 0.5]);
  assert.match(await page.eval(title), /Level 50, this video plays at volume 50$/);
  await page.eval(`${vol} = 0.123`);
  await page.waitFor(`${vol} === 0.5`, 2000);
  await button();
  assert.equal(await osd(), "Same level for every video: off");
  assert.deepEqual([await lit(), await number(), await vid("v.volume")], [false, "50", 0.5]);
  await page.eval(`${vol} = 0.123`);
  await page.sleep(500);
  assert.equal(await vid("v.volume"), 0.123);
  await clear();
});

test("level: the next video sounds as loud as the one it was switched on for", async () => {
  await begin("src=soft&volume=0.6");
  await button();
  await page.waitFor(`Math.abs(${stored}.ref - (${SOFT})) < 1`, 5000);
  const target = SOFT + 20 * Math.log10(0.6);
  await page.eval(`window.__play("loud")`);
  await page.waitFor(near(LOUD, target), 8000);
  assert.deepEqual([await lit(), await number()], [true, "60"]);
  assert.match(await page.eval(title), /Level 60, this video plays at volume (9|10|11)$/);
  // The other way round, and that video does not become the measure.
  await page.eval(`window.__play("soft")`);
  await page.waitFor(near(SOFT, target), 8000);
  assert.ok(await page.eval(`Math.abs(${stored}.ref - (${SOFT})) < 1`));
  // By hand: it stays on, and goes on from there with the next video.
  await page.eval(`window.__play("loud")`);
  await page.waitFor(near(LOUD, target), 8000);
  await page.hover("#vid");
  for (let i = 0; i < 4; i++) await page.key("PageUp");
  assert.deepEqual([await lit(), await number(), await osd()], [true, "80", "Level 80"]);
  await page.waitFor(near(LOUD, SOFT + 20 * Math.log10(0.8)), 5000);
  await page.eval(`window.__play("soft")`);
  await page.waitFor(near(SOFT, SOFT + 20 * Math.log10(0.8)), 8000);
  // Off: this video at the number.
  await page.eval(`window.__play("loud")`);
  await page.waitFor(`${vol} < 0.2`, 8000);
  await button();
  assert.deepEqual([await lit(), await number(), await vid("v.volume")], [false, "80", 0.8]);
  await clear();
});

test("level: the video it was switched on for is not listened to while muted", async () => {
  await begin("src=loud&volume=0.5");
  await page.eval(`document.getElementById("vid").muted = true, 0`);
  await button();
  await page.sleep(1500);
  assert.equal(await page.eval(`${stored}.ref`), null);
  await page.eval(`document.getElementById("vid").muted = false, 0`);
  await page.waitFor(`Math.abs(${stored}.ref - (${LOUD})) < 1`, 5000);
  assert.equal(await vid("v.volume"), 0.5);
  await clear();
});

test("level: switched on for a video that cannot be measured, an average is the measure", async () => {
  await begin("src=loud&tainted&volume=0.5");
  await button();
  await page.waitFor(`${stored}.ref === -18`, 5000);
  assert.equal(await vid("v.volume"), 0.5);
  await clear();
});

test("level: switching on again listens again", async () => {
  await page.open("level.html?src=loud&volume=0.5");
  await set(false, 30, -30);
  await page.run("direct");
  await button();
  await page.waitFor(`Math.abs(${stored}.ref - (${LOUD})) < 1`, 5000);
  assert.deepEqual([await number(), await vid("v.volume")], ["50", 0.5]);
  await clear();
});

test("level: a setting from before the loudness was kept starts listening", async () => {
  await page.open("level.html?src=loud");
  await page.eval(`localStorage.setItem("vu-level", JSON.stringify({ on: true, value: 40 }))`);
  await page.run("direct");
  await page.waitFor(`${vol} === 0.4`, 3000);
  await page.waitFor(`Math.abs(${stored}.ref - (${LOUD})) < 1`, 5000);
  assert.equal(await vid("v.volume"), 0.4);
  await clear();
});

test("level: the slider and Page Up / Page Down set the level, mute stays mute", async () => {
  await begin("src=loud", true, 50);
  await page.waitFor(near(LOUD, -26), 5000);
  await page.key("PageDown");
  assert.equal(await osd(), "Level 45");
  await page.waitFor(near(LOUD, -26.9, 0.6), 3000);
  await page.waitFor(`JSON.parse(localStorage.getItem("vu-level")).value === 45`, 2000);
  await page.key("m");
  assert.equal(await osd(), "Sound off");
  await page.sleep(600);
  assert.equal(await vid("v.muted"), true);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .pval").textContent`), "0");
  await page.key("m");
  assert.equal(await osd(), "Level 45");
  assert.equal(await vid("v.muted"), false);
  // A site that mutes with volume 0 stays silent.
  await page.eval(`${vol} = 0`);
  await page.sleep(600);
  assert.equal(await vid("v.volume"), 0);
  await page.key("PageUp");
  await page.waitFor(`${vol} > 0`, 2000);
  await clear();
});

test("level: scrolling down to 0 mutes and keeps the level", async () => {
  await begin("src=loud", true, 5);
  await page.waitFor(`${vol} < 0.2`, 5000);
  await page.key("PageDown");
  assert.equal(await osd(), "Sound off");
  assert.equal(await vid("v.muted"), true);
  await page.key("PageUp");
  assert.equal(await osd(), "Level 5");
  assert.equal(await vid("v.muted"), false);
  await clear();
});

test("level: a video that is too quiet says so", async () => {
  await begin("src=soft", true, 100);
  await page.waitFor(`${vol} === 1 && /too quiet/.test(${title})`, 8000);
  await clear();
});

test("level: a video that cannot be measured uses an average and keeps playing", async () => {
  await begin("src=loud&tainted", true, 50);
  await page.waitFor(`/cannot be measured/.test(${title})`, 5000);
  assert.ok(await page.eval(near(-18, -26, 0.2)));
  assert.equal(await vid("v.paused"), false);
  await clear();
});

test("level: what YouTube states is only the start, what is heard counts", async () => {
  await begin("src=loud&yt=-11", true, 50);
  assert.ok(await page.eval(near(-11, -26, 0.2)));
  await page.waitFor(near(LOUD, -26), 5000);
  // Not for an ad, nor for another video.
  await page.eval(`document.getElementById("player").classList.add("ad-showing")`);
  await page.sleep(100);
  assert.ok(await page.eval(`!(${near(-11, -26, 0.2)})`));
  await page.waitFor(near(LOUD, -26), 5000);
  await page.eval(`document.getElementById("player").classList.remove("ad-showing")`);
  await page.waitFor(near(LOUD, -26), 5000);
  await clear();
});

test("level: a quiet intro of a video that YouTube states as louder is not turned up", async () => {
  await begin("src=soft&yt=-12", true, 50);
  await page.sleep(2500);
  assert.ok(await page.eval(near(-12, -26, 0.3)));
  // After half a minute of sound what is heard counts.
  await page.waitFor(near(SOFT, -26), 12000);
  await clear();
});

test("level: YouTube's own version of the sound (DRC) counts, not that of the video", async () => {
  await begin("src=loud&yt=-30&cont=-9", true, 50);
  assert.ok(await page.eval(near(-9, -26, 0.2)));
  await page.waitFor(near(LOUD, -26, 0.6), 5000);
  await begin("src=loud&yt=-30&drc=-10", true, 50);
  assert.ok(await page.eval(near(-10, -26, 0.2)));
  await page.eval(`window.__other = "b"`);
  await clear();
});

test("level: another video on the page follows", async () => {
  await begin("src=loud", true, 50);
  await page.eval(`document.dispatchEvent(new CustomEvent("gaffer:level-set", { detail: JSON.stringify({ on: true, value: 30, ref: -20 }) }))`);
  await page.waitFor(`document.querySelector("#video-ultimate-bar .pval").textContent === "30"`, 2000);
  await page.eval(`document.dispatchEvent(new CustomEvent("gaffer:level-set", { detail: "{bad" }))`);
  assert.equal(await page.eval(`document.querySelector("#video-ultimate-bar .pval").textContent`), "30");
  await clear();
});

test("level: a recording with MediaRecorder keeps its sound, at its own level", async () => {
  await page.open("level.html?src=loud");
  await set(true, 20);
  await page.eval(`(() => { localStorage.setItem("vu-rec-ok", "1"); const N = (window.__captures = []); const c = HTMLMediaElement.prototype.captureStream; HTMLMediaElement.prototype.captureStream = function () { N.push(!!window.__gafferRecording); return c.call(this); }; window.__gafferFiles = {}; window.__gafferWriter = (name) => { const f = (window.__gafferFiles[name] = { parts: [], closed: false }); return { name, memory: false, get size() { return f.parts.reduce((s, b) => s + b.length, 0); }, write(b) { f.parts.push(b); return Promise.resolve(); }, close() { f.closed = true; return Promise.resolve(); }, abort() { return Promise.resolve(); } }; }; })()`);
  // A file from a blob has no other method than MediaRecorder.
  await page.eval(`fetch("/fixtures/media/loud.mp4").then((r) => r.blob()).then((b) => { const v = document.getElementById("vid"); v.src = URL.createObjectURL(b); return v.play(); }).then(() => 1)`);
  await page.run("direct");
  await page.hover("#vid");
  await page.waitFor(`${vol} < 0.1 && window.__captures.length > 0`, 5000);
  await clickEl("#video-ultimate-top .rec");
  await page.waitFor(`window.__gafferRecording === 1`, 5000);
  const method = await page.eval(`window.__captures.join()`);
  await page.sleep(3500);
  await page.hover("#vid");
  await clickEl("#video-ultimate-top .rec");
  await page.waitFor(`!!document.querySelector("#vu-notice button.go")`, 2000);
  await page.click("#vu-notice button.go");
  await page.waitFor(`Object.values(window.__gafferFiles).some((f) => f.closed)`, 8000);
  const r = await page.eval(`(async () => { const f = Object.values(window.__gafferFiles)[0]; const ac = new AudioContext(); const ab = await ac.decodeAudioData(await new Blob(f.parts).arrayBuffer()); await ac.close(); const d = ab.getChannelData(0); let s = 0; const a = Math.floor(d.length / 4), b = Math.floor((d.length * 3) / 4); for (let i = a; i < b; i++) s += d[i] * d[i]; return [10 * Math.log10(s / (b - a) + 1e-12), ab.duration, Object.keys(window.__gafferFiles)[0]]; })()`);
  assert.ok(r[0] > -14, "sound: " + JSON.stringify(r) + " " + method);
  await clear();
});
