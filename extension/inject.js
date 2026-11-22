// How Gaffer puts the modules into pages (§4.5): content scripts and
// chrome.scripting, with the modules from the extension package itself.
// Gaffer (dev) replaces this file with dev/inject.js (§7.4).
import { anyOn, contentScripts } from "./sites.js";

export const DEV = false;

const PREFIX = "gaffer-";
const CAPTURE = ["modules/capture.js"];
const DIRECT = ["auto.js", "modules/direct.js"];
const INSPECT = ["modules/inspect.js"];
const BRIDGE = ["bridge.js"];
// A tab that never finishes loading does not answer; the rest goes on without it.
const TAB_MS = 4000;

export function ready() {
  return true;
}

function scripts(rules) {
  if (!anyOn(rules)) return [];
  const out = [{ id: PREFIX + "bridge", matches: ["*://*/*"], js: BRIDGE, allFrames: true, runAt: "document_start", world: "ISOLATED" }];
  for (const part of contentScripts(rules)) {
    const where = { matches: part.matches, excludeMatches: part.excludeMatches, allFrames: false, world: "MAIN" };
    out.push({ id: PREFIX + "capture:" + part.key, js: CAPTURE, runAt: "document_start", ...where });
    out.push({ id: PREFIX + "direct:" + part.key, js: DIRECT, runAt: "document_idle", ...where });
  }
  return out;
}

// Chrome gives the patterns back sorted.
const sorted = (list) => [...(list || [])].sort();
const same = (a, b) => JSON.stringify([a.js, sorted(a.matches), sorted(a.excludeMatches), a.runAt, a.world, !!a.allFrames]) === JSON.stringify([b.js, sorted(b.matches), sorted(b.excludeMatches), b.runAt, b.world, !!b.allFrames]);

// Only what changed, and changed scripts in place: a page that loads meanwhile
// still gets them.
export async function register(rules) {
  const wanted = scripts(rules);
  const have = new Map((await chrome.scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith(PREFIX)).map((s) => [s.id, s]));
  const drop = [...have.keys()].filter((id) => !wanted.some((w) => w.id === id));
  const change = wanted.filter((w) => have.has(w.id) && !same(have.get(w.id), w));
  const add = wanted.filter((w) => !have.has(w.id));
  if (add.length) await chrome.scripting.registerContentScripts(add);
  if (change.length) await chrome.scripting.updateContentScripts(change);
  if (drop.length) await chrome.scripting.unregisterContentScripts({ ids: drop });
}

function inTime(promise) {
  let timer;
  const late = new Promise((_, no) => {
    timer = setTimeout(() => no(new Error("no answer")), TAB_MS);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function run(target, injection) {
  try {
    return (await inTime(chrome.scripting.executeScript({ target, injectImmediately: true, ...injection }))) || [];
  } catch (e) {
    console.warn("[Gaffer] running in tab " + target.tabId + " failed:", e.message);
    return null;
  }
}

function closeDirect() {
  try {
    if (typeof window.__vuClose === "function") window.__vuClose();
  } catch (e) {}
}

const all = (tabId) => ({ tabId, allFrames: true });
const top = (tabId) => ({ tabId, frameIds: [0] });

// Switching on: the bridge in every frame, which starts the frames inside the
// page (§4.5), and capture and Direct in the page itself.
export async function start(tabId) {
  if ((await run(all(tabId), { files: BRIDGE })) === null) return false;
  if ((await run(top(tabId), { files: CAPTURE, world: "MAIN" })) === null) return false;
  return (await run(top(tabId), { files: DIRECT, world: "MAIN" })) !== null;
}

// Switching off: Direct closes in every frame, and the bridge checks again.
export async function close(tabId) {
  const ok = (await run(all(tabId), { func: closeDirect, world: "MAIN" })) !== null;
  await run(all(tabId), { files: BRIDGE });
  return ok;
}

// After an update of the extension (§4.6): the old Direct closes, the new one starts.
export async function restart(tabId) {
  if ((await run(all(tabId), { func: closeDirect, world: "MAIN" })) === null) return false;
  return start(tabId);
}

// A frame inside a page where Gaffer is on; capture starts late there.
export async function frame(tabId, documentId) {
  const target = { tabId, documentIds: [documentId] };
  if ((await run(target, { files: CAPTURE, world: "MAIN" })) === null) return;
  await run(target, { files: DIRECT, world: "MAIN", injectImmediately: false });
}

export async function inspect(tabId, about) {
  const set = (x) => {
    window.__gafferInspect = x;
  };
  if ((await run(all(tabId), { func: set, args: [about], world: "MAIN" })) === null) return false;
  return (await run(all(tabId), { files: INSPECT, world: "MAIN" })) !== null;
}

// The number of running recordings and downloads in a tab (§4.6).
export async function recording(tabId) {
  const results = await run(all(tabId), { func: () => +window.__gafferRecording || 0, world: "MAIN" });
  return (results || []).some((r) => r.result > 0);
}

export function installed({ serial, getRules, restartAll }) {
  return serial(async () => {
    const rules = await getRules();
    await register(rules);
    await restartAll(rules);
  });
}
