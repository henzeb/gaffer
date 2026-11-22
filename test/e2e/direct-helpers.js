import { before, after } from "node:test";
import { launch } from "./harness.js";

export let page;
before(async () => { page = await launch(); });
after(async () => { await page?.close(); });

export async function start(file, { hover = "#vid", settle = 0 } = {}) {
  await page.open(file);
  if (settle) await page.sleep(settle);
  await page.eval("window.__track.mark()");
  await page.run("direct");
  if (hover) await page.hover(hover);
}

export const vid = (expr) => page.eval(`(() => { const v = document.querySelector("video[data-vu]") || document.querySelector("video"); return ${expr}; })()`);

export const osd = () => page.eval(`document.getElementById("vu-osd")?.textContent`);

export const qrowButton = async (label) => {
  await page.waitFor(`[...document.querySelectorAll("#video-ultimate-top .qrow button")].some((b) => b.textContent === ${JSON.stringify(label)})`, 3000);
  const [x, y] = await page.eval(`(() => { const b = [...document.querySelectorAll("#video-ultimate-top .qrow button")].find((b) => b.textContent === ${JSON.stringify(label)}); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.clickAt(x, y);
};

export function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return "after closing: …" + a.slice(Math.max(0, i - 80), i + 160) + "\nbefore start: …" + b.slice(Math.max(0, i - 80), i + 160);
}

export const leaks = () => page.eval("window.__track.leaks()");

export const rect = (sel) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);

export const topTitles = () => page.eval(`[...document.querySelectorAll("#video-ultimate-top .toprow button")].filter((b) => !b.classList.contains("gone")).map((b) => b.title.split(" (")[0])`);

export const transformOf = (id) => page.eval(`getComputedStyle(document.getElementById(${JSON.stringify(id)})).transform`);

export const WITH_AUDIO = ["youtube", "jwplayer", "videojs", "kaltura", "flowplayer", "hls", "dashjs", "bitmovin", "theoplayer", "clappr", "shaka", "vidstack"];

export const visible = (cls, root = "#video-ultimate-bar") => `!!document.querySelector("${root} .${cls}") && !document.querySelector("${root} .${cls}").classList.contains("gone")`;

export const popLabels = (pop) => page.eval(`[...document.querySelectorAll("#video-ultimate-bar .${pop} button")].map((b) => b.textContent)`);

export async function clickEl(sel) {
  const [x, y] = await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.clickAt(x, y);
}

export async function popButton(pop, label) {
  const find = `[...document.querySelectorAll("#video-ultimate-bar .${pop} button")].find((b) => b.textContent === ${JSON.stringify(label)})`;
  await page.waitFor(`!!${find}`, 3000);
  const [x, y] = await page.eval(`(() => { const r = ${find}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.clickAt(x, y);
}

export const preferred = () => page.eval(`navigator.language.toLowerCase().startsWith("nl") ? "nl" : "en"`);
