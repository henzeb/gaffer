import { test } from "node:test";
import assert from "node:assert/strict";
import { page, start, vid, leaks, rect, firstDiff } from "./direct-helpers.js";

const full = `document.documentElement.classList.contains("vu-full")`;
const hiddenBar = `document.getElementById("video-ultimate-bar").classList.contains("v-ui-hide")`;
const deep = (x, y) => `(() => { let e = document.elementFromPoint(${x}, ${y}); while (e.shadowRoot && e.shadowRoot.elementFromPoint(${x}, ${y}) !== e) e = e.shadowRoot.elementFromPoint(${x}, ${y}); return getComputedStyle(e).cursor; })()`;
const cursor = (x, y) => page.eval(deep(x, y));
const gone = (x, y) => page.waitFor(`${deep(x, y)} === "none"`, 3000);
const count = () => page.eval(`window.__toggles = 0, ["play", "pause"].forEach((n) => document.querySelector("video[data-vu]").addEventListener(n, () => window.__toggles++))`);
const toggles = () => page.eval("window.__toggles");
const pauseAll = () => page.eval(`document.querySelectorAll("video").forEach((v) => v.pause())`);
// A layer of the player itself: the site's balloon lies outside it.
const intoPlayer = `(() => { const b = document.getElementById("balloon"); document.getElementById("player").appendChild(b); b.className = "player-caption"; b.style.cssText = "left: 20px; top: 150px"; })()`;
const barOf = (id) => `document.querySelector("#video-ultimate-bar[data-vu-for='" + document.getElementById("${id}").dataset.vuId + "']")`;

test("mouse: hides over the video after 2 s without movement and is back on a move, also outside fullscreen", async () => {
  await start("video.html", { hover: null });
  const [x, y] = await page.center("#vid");
  await page.move(x, y);
  assert.equal(await cursor(x, y), "grab");
  await gone(x, y);
  await page.move(x + 3, y);
  assert.equal(await cursor(x + 3, y), "grab");
  await gone(x + 3, y);
  // Next to the video it stays.
  const r = await rect("#vid");
  await page.move(x, r.bottom + 60);
  assert.notEqual(await cursor(x, r.bottom + 60), "none");
  await page.sleep(700);
  assert.notEqual(await cursor(x, r.bottom + 60), "none");
  assert.equal(await page.eval(`document.getElementById("vid").getAttribute("style")`), null);
});

test("mouse: in fullscreen a move shows it, also with another video on the page", async () => {
  await start("multi.html", { hover: "#v1" });
  await page.key("f");
  await page.waitFor(full, 3000);
  for (const x of [300, 340]) {
    await page.move(x, 250);
    assert.equal(await cursor(x, 250), "grab");
    await page.move(x + 5, 250);
    assert.equal(await cursor(x + 5, 250), "grab");
    await gone(x + 5, 250);
  }
  await page.key("f");
});

test("mouse: a site that hides it over the video cannot while it moves", async () => {
  await start("layers.html", { hover: null });
  await page.eval(intoPlayer);
  await page.eval(`(() => { const b = document.getElementById("balloon"); b.style.cssText += "; display: block; cursor: none !important"; b.innerHTML = "<p id=inner2>x</p>"; })()`);
  const before = await page.eval(`document.getElementById("balloon").getAttribute("style")`);
  const [x, y] = await page.eval(`(() => { const r = document.getElementById("balloon").getBoundingClientRect(); return [r.left + 100, r.top + 60]; })()`);
  await page.move(x, y);
  assert.equal(await cursor(x, y), "default");
  await gone(x, y);
  await page.move(x + 2, y);
  assert.equal(await cursor(x + 2, y), "default");
  await page.move(300, 120);
  assert.equal(await page.eval(`document.getElementById("balloon").getAttribute("style")`), before);
  // In a shadow root.
  await page.eval(`(() => { const b = document.getElementById("balloon"); b.style.cursor = ""; b.attachShadow({ mode: "open" }).innerHTML = "<style>i{display:block;height:100px;cursor:none!important}</style><i></i>"; })()`);
  await page.move(x, y);
  assert.equal(await cursor(x, y), "default");
  await gone(x, y);
});

test("mouse: stays visible over the bars, and over a layer that comes under it while hidden it hides too", async () => {
  await start("layers.html", { hover: null });
  await page.eval(intoPlayer);
  const [x, y] = [160, 340];
  await page.eval(`document.getElementById("player").style.cursor = "none"`);
  await page.move(x, y);
  await page.hover("#video-ultimate-bar .volbtn");
  await page.sleep(800);
  assert.equal(await page.eval(hiddenBar), false);
  const [bx, by] = await page.center("#video-ultimate-bar .volbtn");
  assert.equal(await cursor(bx, by), "pointer");
  const gap = await page.eval(`(() => { const r = document.querySelector("#video-ultimate-bar .cur").getBoundingClientRect(); return [r.left + 2, r.top + r.height / 2]; })()`);
  assert.equal(await cursor(...gap), "default");
  await page.move(x, 200);
  await gone(x, 200);
  await page.eval(`(() => { const b = document.getElementById("balloon"); b.style.top = "110px"; b.style.display = "block"; })()`);
  await page.waitFor(`document.elementFromPoint(${x}, 200).id === "balloon"`);
  await gone(x, 200);
});

test("mouse: closing while it is hidden restores the page", async () => {
  await page.open("layers.html");
  await page.eval(intoPlayer);
  await page.eval("showBalloon()");
  const before = await page.eval("__snapshot()");
  await page.eval("window.__track.mark()");
  await page.run("direct");
  for (const y of [250, 150]) {
    await page.move(150, y);
    await gone(150, y);
  }
  await page.eval("window.__vuClose()");
  const after = await page.eval("__snapshot()");
  assert.ok(after.html === before.html, firstDiff(after.html, before.html));
  assert.deepEqual(await leaks(), { listeners: [], intervals: 0 });
});

// Points on the bars where the video could be hit: every 12 px of the rows.
const grid = `(() => {
  const out = [];
  const b = document.getElementById("video-ultimate-bar").getBoundingClientRect();
  const m = document.querySelector("#video-ultimate-bar .mainrow").getBoundingClientRect();
  for (let x = b.left + 2; x < b.right; x += 12) for (let y = m.top - 4; y < b.bottom; y += 8) out.push([x, y]);
  const t = document.getElementById("video-ultimate-top").getBoundingClientRect();
  const r = document.querySelector("#video-ultimate-top .toprow").getBoundingClientRect();
  for (let x = t.left + 2; x < t.right; x += 12) for (let y = t.top + 1; y < r.bottom + 4; y += 8) out.push([x, y]);
  return out.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !e || !e.closest("[data-vu-for]"); });
})()`;

for (const fullscreen of [false, true]) {
  test("panel: clicks on and between the buttons do not reach the video" + (fullscreen ? " in fullscreen" : ""), async () => {
    await start("video.html");
    if (fullscreen) {
      await page.key("f");
      await page.waitFor(full, 3000);
      await page.move(400, 300);
    }
    await count();
    assert.deepEqual(await page.eval(grid), []);
    const spots = await page.eval(`(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const pp = r("#video-ultimate-bar .pp"), sk = r("#video-ultimate-bar .skip"), k = r("#video-ultimate-bar .seek"), bar = r("#video-ultimate-bar"), sp = r("#video-ultimate-top .sp");
      return [[(sk.right + pp.left) / 2, pp.top + 20], [pp.left + 10, bar.bottom - 2], [k.left + 200, k.top - 2], [sp.left + sp.width / 2, sp.top + sp.height / 2], [k.left - 3, k.top + 12]];
    })()`);
    for (const [x, y] of spots) {
      await page.clickAt(x, y);
      assert.equal(await toggles(), 0, "click at " + x + "," + y);
    }
    const now = await vid("v.currentTime");
    assert.ok(now < 8, "no seek: " + now);
    await page.key("t");
    const gap = await page.eval(`(() => { const u = document.getElementById("video-ultimate-ui").getBoundingClientRect(); const g = [...document.querySelectorAll("#video-ultimate-ui .grp")].map((e) => e.getBoundingClientRect()); return [(g[0].right + g[1].left) / 2, g[0].top + g[0].height / 2, u.left + 40, u.top - 3]; })()`);
    await page.clickAt(gap[0], gap[1]);
    await page.clickAt(gap[2], gap[3]);
    assert.equal(await toggles(), 0);
    // The faded edge and the picture still belong to the video.
    const [x, y] = await page.eval(`(() => { const b = document.getElementById("video-ultimate-bar").getBoundingClientRect(); return [b.left + b.width / 3, b.top + 10]; })()`);
    await page.clickAt(x, y);
    await page.waitFor("window.__toggles === 1", 2000);
    await page.key("t");
    if (fullscreen) await page.key("f");
  });
}

test("panel: hidden bars catch no clicks", async () => {
  await start("video.html");
  const [x, y] = await page.center("#video-ultimate-bar .pp");
  await page.waitFor(hiddenBar, 3000);
  assert.equal(await page.eval(`document.elementFromPoint(${x}, ${y}).id`), "vid");
  assert.equal(await page.eval(`document.elementFromPoint(${x - 34}, ${y}).id`), "vid");
});

test("panel: a press on the bars that ends over the video does not pause it", async () => {
  await start("layers.html");
  await page.waitFor(`document.querySelector("video").readyState >= 3 && !document.querySelector("video").paused`);
  await count();
  const c = await page.eval(`(() => { const r = document.querySelector("#video-ultimate-bar .cur").getBoundingClientRect(); return [r.left + 8, r.top + 8]; })()`);
  await page.drag(c[0], c[1], c[0] + 100, c[1] - 120);
  assert.equal(await toggles(), 0);
  await page.clickAt(300, 150);
  await page.waitFor("window.__toggles === 1", 2000);
});

test("panel: the seek bar can be dragged with another video in the same parent", async () => {
  await page.open("multi.html");
  await page.eval(`(() => { const b = document.querySelector(".player"); b.style.height = "auto"; b.appendChild(document.getElementById("v2")); })()`);
  await page.run("direct");
  await page.waitFor(`document.querySelectorAll("video[data-vu]").length === 2`, 3000);
  await page.waitFor(`document.getElementById("v1").readyState >= 3`, 3000);
  await pauseAll();
  await page.hover("#v1");
  const k = await page.eval(`(() => { const r = ${barOf("v1")}.querySelector(".seek").getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12, w: r.width }; })()`);
  await page.drag(k.x, k.y, k.x + k.w / 2, k.y);
  const time = await page.eval(`document.getElementById("v1").currentTime / document.getElementById("v1").duration`);
  assert.ok(Math.abs(time - 0.53) < 0.03, String(time));
  assert.equal(await page.eval(`document.getElementById("v2").currentTime < 5`), true);
});

test("seek bar: 12 px above and below and 4 px past the ends still count, exactly where the mouse is", async () => {
  await start("video.html");
  await page.waitFor(`document.getElementById("vid").readyState >= 3`);
  await pauseAll();
  await page.hover("#vid");
  const k = await rect("#video-ultimate-bar .seek");
  const mid = (k.top + k.bottom) / 2;
  const d = await vid("v.duration");
  const line = { left: k.left + 12, width: k.right - k.left - 24 };
  for (const [f, dy] of [[0.25, -11], [0.75, 11], [0.5, 0]]) {
    await page.clickAt(line.left + f * line.width, mid + dy);
    const time = await vid("v.currentTime");
    assert.ok(Math.abs(time / d - f) < 0.003, f + " → " + time / d);
  }
  for (const dy of [-14, -15]) {
    await page.clickAt(line.left + 0.9 * line.width, mid + dy);
    assert.ok(Math.abs((await vid("v.currentTime")) / d - 0.5) < 0.003);
    assert.equal(await vid("v.paused"), true);
  }
  await page.clickAt(k.left + 2, mid);
  assert.equal(await vid("v.currentTime"), 0);
  await page.clickAt(k.right - 2, mid);
  assert.ok((await vid("v.currentTime")) > d - 0.1);
});

// A fixed page header with a search field over the video.
const header = (z, extra = "") => page.eval(`(() => {
  document.body.style.height = "3000px";
  const h = document.createElement("div"); h.id = "hdr"; h.style.cssText = "position:fixed;left:0;right:0;top:0;height:56px;background:#fff;z-index:${z}";
  h.innerHTML = '<input id="search" style="margin:10px 0 0 300px;width:200px;height:30px"><p id="text" style="position:absolute;left:100px;top:0">Header</p>';
  document.body.appendChild(h);
  ${extra}
})()`);

for (const [file, z] of [["layers.html", 10], ["layers.html", 2000], ["window-fill.html", 10], ["multi.html", 1]]) {
  test(`page header over the video (${file}, z-index ${z}): it works as without Direct`, async () => {
    await page.open(file);
    await header(z, file === "window-fill.html" ? "" : "window.scrollTo(0, 60);");
    await page.run("direct");
    await page.sleep(300);
    await page.move(450, 200);
    await page.waitFor(`!(${hiddenBar})`, 3000);
    await count();
    // The bars lie under it, as the site's own controls do.
    assert.deepEqual(await page.eval(`[60, 200, 400, 600].map((x) => document.elementFromPoint(x, 25).closest("#hdr") !== null)`), [true, true, true, true]);
    await page.move(400, 25);
    assert.equal(await page.eval(hiddenBar), true, "the bars are gone");
    await page.sleep(700);
    assert.equal(await cursor(400, 25), "text");
    await page.clickAt(400, 25);
    assert.equal(await page.eval("document.activeElement.id"), "search");
    for (const k of ["f", "m", "k"]) await page.key(k);
    assert.equal(await page.eval(`document.getElementById("search").value`), "fmk");
    await page.clickAt(110, 25);
    await page.key("f");
    await page.key("k");
    assert.equal(await page.eval(full), false, "no shortcuts over the header");
    await page.drag(110, 25, 160, 40);
    await page.wheel(110, 25, -100, 2);
    assert.doesNotMatch(await page.dyn(), /transform:/);
    assert.equal(await toggles(), 0);
    // Below it the video is the video.
    await page.clickAt(450, 200);
    await page.waitFor("window.__toggles === 1", 2000);
  });
}

const parentOf = `(() => { const p = document.getElementById("video-ultimate-bar").parentElement; return p.id || p.className || p.tagName; })()`;
const build = (html, css = "") => page.eval(`(() => { const st = document.createElement("style"); st.textContent = ${JSON.stringify(css)}; document.head.appendChild(st); const p = document.getElementById("player"); const v = document.getElementById("vid"); const w = document.createElement("div"); w.innerHTML = ${JSON.stringify(html)}; p.appendChild(w.firstElementChild); document.querySelector("[data-v]").replaceWith(v); })()`);
const box = "position:relative;width:640px;height:360px";

const CASES = {
  "known controls next to the video": ['<div id="inside" style="' + box + '"><i data-v></i><div class="vjs-control-bar" style="position:absolute;left:0;right:0;bottom:0;height:40px;z-index:7"></div></div>', "inside", "7"],
  "known controls deeper": ['<div id="inside" style="' + box + '"><i data-v></i><div style="position:absolute;inset:0;z-index:3;pointer-events:none"><div class="plyr__controls" style="position:absolute;left:0;right:0;bottom:0;height:40px;z-index:900"></div></div></div>', "inside", "3"],
  "unknown controls": ['<div id="inside" style="' + box + '"><div id="deep"><i data-v></i></div><div style="position:absolute;left:0;right:0;bottom:0;height:40px;z-index:5"><input type="range"></div></div>', "inside", "5"],
  "a player with its own layer": ['<div id="inside" style="' + box + ';z-index:0"><i data-v></i><div class="jw-controls" style="position:absolute;inset:0;z-index:20"></div></div>', "inside", "21"],
  "no controls": ['<div style="' + box + '"><div id="inside"><i data-v></i></div></div>', "inside", "0"],
  "inside a link": ['<div id="inside" style="' + box + '"><a href="#gone"><i data-v></i></a></div>', "inside", "0"],
};
for (const [name, [html, parent, z]] of Object.entries(CASES)) {
  test("container: " + name, async () => {
    await page.open("layers.html");
    await page.eval(`["inner", "menu", "controls"].forEach((i) => document.getElementById(i).remove())`);
    await build(html);
    await page.run("direct");
    await page.waitFor(`document.querySelector("video[data-vu]") && ${parentOf} === ${JSON.stringify(parent)}`, 3000);
    await page.sleep(300);
    await page.hover("#vid");
    assert.equal(await page.eval(`getComputedStyle(document.getElementById("video-ultimate-bar")).zIndex`), z);
    const [b, v] = [await rect("#video-ultimate-bar"), await rect("#vid")];
    assert.ok(Math.abs(b.bottom - v.bottom) < 1 && Math.abs(b.left - v.left) < 1, JSON.stringify([b, v]));
    await page.waitFor(`!document.getElementById("vid").paused`);
    await page.click("#video-ultimate-bar .pp");
    await page.waitFor(`document.getElementById("vid").paused`, 2000);
    assert.equal(await page.eval("location.hash"), "");
  });
}

test("container: a shadow host that does not show its other children is skipped", async () => {
  await page.open("layers.html");
  await page.eval(`["inner", "menu", "controls"].forEach((i) => document.getElementById(i).remove())`);
  await build('<div id="inside" style="' + box + '"><media-box><i data-v slot="media"></i></media-box></div>');
  await page.eval(`(() => { const h = document.querySelector("media-box"); const v = document.getElementById("vid"); v.slot = "media"; h.attachShadow({ mode: "closed" }).innerHTML = "<slot name=media></slot>"; })()`);
  await page.run("direct");
  await page.waitFor(`document.querySelector("video[data-vu]") && ${parentOf} === "inside"`, 3000);
  await page.hover("#vid");
  await page.waitFor(`document.getElementById("video-ultimate-bar").getBoundingClientRect().width > 600`, 3000);
});

test("container: the bars scroll along and stay within what the player shows of the video", async () => {
  await page.open("layers.html");
  await page.eval(`["inner", "menu", "controls"].forEach((i) => document.getElementById(i).remove()); document.body.style.height = "3000px"`);
  await build('<div id="inside" style="' + box + ';overflow:hidden"><i data-v></i></div>', "#inside video { height: 440px; width: 640px; }");
  await page.run("direct");
  await page.waitFor(`document.querySelector("video[data-vu]")`, 3000);
  await page.hover("#inside");
  const inside = await rect("#inside");
  assert.ok(Math.abs((await rect("#video-ultimate-bar")).bottom - inside.bottom) < 1);
  // In the same frame, before any event has arrived.
  const off = await page.eval(`(() => { window.scrollTo(0, 60); return document.getElementById("video-ultimate-bar").getBoundingClientRect().bottom - document.getElementById("inside").getBoundingClientRect().bottom; })()`);
  assert.ok(Math.abs(off) < 1, String(off));
});

test("container: a player's own style for sliders does not change ours", async () => {
  const style = `(() => { const k = document.querySelector("#video-ultimate-bar .seek"); const c = getComputedStyle(k); const r = k.getBoundingClientRect(); return [c.appearance, c.backgroundColor, c.borderTopWidth, c.boxShadow, r.height, getComputedStyle(k, "::-webkit-slider-runnable-track").backgroundColor].join(); })()`;
  await start("layers.html");
  const plain = await page.eval(style);
  await page.open("layers.html");
  await page.eval(`(() => { const st = document.createElement("style"); st.textContent = "#player input[type=range]{-webkit-appearance:none;background:red;border:3px solid;box-shadow:0 0 5px red;height:2px;padding:9px} #player input[type=range]::-webkit-slider-runnable-track{background:lime;height:2px} #player button{border:2px solid red}"; document.head.appendChild(st); })()`);
  await page.run("direct");
  await page.hover("#vid");
  assert.equal(await page.eval(style), plain);
});
