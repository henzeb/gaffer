// How Gaffer (dev) puts the modules into pages (§7.4): userScripts with the
// code from its own folder, with the prelude and the rules around it, applied
// again on every signal from npm run dev. Replaces inject.js in the dev build.
import { fetchUpdate, startSource } from "./source.js";
import { msg } from "./i18n.js";
import { anyOn, isOn, pageHost, fillPrelude } from "./sites.js";

export const DEV = true;

const DIRECT_ID = "gaffer-direct";
const CAPTURE_ID = "gaffer-capture";
const BRIDGE_ID = "gaffer-bridge";
const CLOSE = "try{typeof window.__vuClose==='function'&&window.__vuClose()}catch(e){}";
const WAITING = "waiting";
const TAB_MS = 4000;

export function ready() {
  try {
    chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}

async function getCode(name) {
  const key = "code." + name;
  return (await chrome.storage.local.get(key))[key] || null;
}

let preludeText = null;
async function prelude() {
  if (preludeText === null) preludeText = await (await fetch(chrome.runtime.getURL("prelude.js"))).text();
  return preludeText;
}

let bridgeText = null;
async function bridgeCode(rules) {
  if (bridgeText === null) bridgeText = await (await fetch(chrome.runtime.getURL("bridge.js"))).text();
  return fillPrelude(await prelude(), rules, bridgeText);
}

async function moduleCode(name, rules) {
  const code = await getCode(name);
  return code ? fillPrelude(await prelude(), rules, code) : null;
}

async function startCode(rules) {
  const direct = await moduleCode("direct", rules);
  if (!direct) return null;
  const capture = await moduleCode("capture", rules);
  return (capture ? capture + ";" : "") + direct;
}

function afterRecording(code) {
  return "(function(){var go=function(){" + CLOSE + ";" + code + "};if(window.__gafferRecording){window.addEventListener('gaffer:recorded',go,{once:true});return '" + WAITING + "'}go();return 'done'})()";
}

async function registerOne(id, runAt, code, world = "MAIN") {
  const existing = await chrome.userScripts.getScripts({ ids: [id] });
  if (!code) {
    if (existing.length) await chrome.userScripts.unregister({ ids: [id] });
    return;
  }
  const script = { id, matches: ["<all_urls>"], allFrames: true, runAt, world, js: [{ code }] };
  if (!existing.length) await chrome.userScripts.register([script]);
  else if (existing[0].js?.[0]?.code !== code) await chrome.userScripts.update([script]);
}

export async function register(rules) {
  if (!ready()) return;
  const direct = anyOn(rules) ? await moduleCode("direct", rules) : null;
  const capture = direct ? await moduleCode("capture", rules) : null;
  if (direct) await chrome.userScripts.configureWorld({ messaging: true });
  await registerOne(BRIDGE_ID, "document_start", direct ? await bridgeCode(rules) : null, "USER_SCRIPT");
  await registerOne(CAPTURE_ID, "document_start", capture);
  await registerOne(DIRECT_ID, "document_idle", direct);
}

function inTime(promise) {
  let timer;
  const late = new Promise((_, no) => {
    timer = setTimeout(() => no(new Error("no answer")), TAB_MS);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function runInTab(tabId, code, allFrames = true, world = "MAIN") {
  try {
    const results = await inTime(chrome.userScripts.execute({ target: allFrames ? { tabId, allFrames: true } : { tabId, frameIds: [0] }, js: [{ code }], world, injectImmediately: true }));
    return results || [];
  } catch (e) {
    console.warn("[Gaffer] running in tab " + tabId + " failed:", e.message);
    return null;
  }
}

async function runBridge(tabId, rules) {
  return (await runInTab(tabId, await bridgeCode(rules), true, "USER_SCRIPT")) !== null;
}

export async function start(tabId, rules) {
  if (!ready()) return false;
  const code = await startCode(rules);
  return !!code && (await runBridge(tabId, rules)) && (await runInTab(tabId, code)) !== null;
}

export async function close(tabId) {
  return (await runInTab(tabId, CLOSE)) !== null;
}

export async function inspect(tabId, about) {
  if (!ready()) return false;
  const code = await getCode("inspect");
  if (!code) return false;
  return (await runInTab(tabId, "window.__gafferInspect=" + JSON.stringify(about) + ";" + code, true)) !== null;
}

export async function recording(tabId) {
  const results = await runInTab(tabId, "+window.__gafferRecording||0");
  return (results || []).some((r) => r.result > 0);
}

async function restartDirect() {
  if (!ready()) return false;
  const rules = await shell.getRules();
  const code = await startCode(rules);
  if (!code) return false;
  let waiting = false;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (!isOn(pageHost(tab.url || ""), rules)) return;
    if (!(await runBridge(tab.id, rules))) return;
    const results = await runInTab(tab.id, afterRecording(code));
    if (results && results.some((r) => r.result === WAITING)) waiting = true;
  }));
  return waiting;
}

async function apply() {
  const current = (await chrome.storage.local.get("release")).release || null;
  const result = await fetchUpdate(current, getCode);
  if (!result.store) return { ok: result.ok, status: result.status };
  await chrome.storage.local.set(result.store);
  await register(await shell.getRules());
  const restart = result.changed.includes("direct") || result.changed.includes("capture");
  if (restart && (await restartDirect())) return { ok: true, status: msg("popup.update.afterRecording") };
  return { ok: true, status: result.status };
}

let shell = null;
let updating = null;

// Reading the modules from its own folder again: on a signal and with the Update button.
export function update() {
  if (!updating) updating = shell.serial(apply).finally(() => (updating = null));
  return updating;
}

export function busy() {
  return !!updating;
}

export function installed({ serial, getRules }) {
  return update().finally(() => serial(async () => register(await getRules())));
}

export function init(api) {
  shell = api;
  // From bridge.js on the pages.
  chrome.runtime.onUserScriptMessage.addListener(api.onBridge);
  startSource({ update });
}
