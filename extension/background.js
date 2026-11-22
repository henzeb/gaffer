import * as inject from "./inject.js";
import { msg } from "./i18n.js";
import { cleanLevel, withRef } from "./level.js";
import { SITE_PREFIX, DEFAULT_KEY, pageHost, isOn, rulesFrom, rulesBefore } from "./sites.js";

const icons = (variant) => Object.fromEntries([16, 32, 48, 128].map((n) => [n, `icons/icon${variant}-${n}.png`]));
const ICON_ON = icons("");
const ICON_OFF = icons("-off");
const UPDATE_WAITING = "updateWaiting";

let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

async function getRules() {
  return rulesFrom(await chrome.storage.sync.get(null));
}

const hostOf = (tab) => pageHost((tab && tab.url) || "");

async function applySites(before, after) {
  if (!inject.ready()) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    const host = hostOf(tab);
    if (!host) return;
    const was = isOn(host, before);
    const is = isOn(host, after);
    if (was && !is) await inject.close(tab.id);
    else if (!was && is) await inject.start(tab.id, after);
  }));
}

async function restartAll(rules) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => isOn(hostOf(tab), rules)).map((tab) => inject.restart(tab.id, rules)));
}

async function updateTab(tab, rules) {
  if (!tab || tab.id === undefined || tab.id < 0) return;
  const on = isOn(hostOf(tab), rules);
  try {
    await chrome.action.setIcon({ tabId: tab.id, path: on ? ICON_ON : ICON_OFF });
  } catch {}
}

async function updateAllTabs() {
  const rules = await getRules();
  for (const tab of await chrome.tabs.query({})) await updateTab(tab, rules);
}

// A new version of the extension is applied right away, except while a tab is
// recording or downloading: then it waits until the last one ends (§4.6).
async function updateWhenFree() {
  const tabs = await chrome.tabs.query({});
  const busy = (await Promise.all(tabs.map((tab) => (hostOf(tab) ? inject.recording(tab.id) : false)))).some(Boolean);
  if (busy) {
    await chrome.storage.session.set({ [UPDATE_WAITING]: true });
    return;
  }
  await chrome.storage.session.remove(UPDATE_WAITING);
  chrome.runtime.reload();
}

async function inspect(tabId) {
  // What Inspect reports about the extension, and whether it gets Copy (§4.5, §12.5).
  if (!inject.ready()) return { ok: false, status: msg("popup.inspect.noScripts") };
  const about = { shell: chrome.runtime.getManifest().version, dev: inject.DEV };
  return (await inject.inspect(tabId, about)) ? { ok: true } : { ok: false, status: msg("popup.inspect.failed") };
}

// From bridge.js on the pages: the level setting (§11.15).
function onBridge(m, sender, reply) {
  if (m.type === "level-get") {
    chrome.storage.local.get("level").then((r) => reply(r.level || null));
    return true;
  }
  if (m.type === "level-ref") {
    chrome.storage.local.get("level").then((r) => {
      const level = withRef(r.level, m.level);
      if (level) chrome.storage.local.set({ level });
    });
    return false;
  }
  const level = m.type === "level-set" ? cleanLevel(m.level) : null;
  if (level) chrome.storage.local.set({ level });
  return false;
}

// From bridge.js: is Gaffer on for the page of this frame? A frame inside the
// page gets capture and Direct from here (§4.5).
async function onFrame(m, sender) {
  const top = sender.frameId === 0 ? sender.url : sender.tab && sender.tab.url;
  const on = isOn(pageHost(top || ""), await getRules());
  if (on && m.start && sender.frameId !== 0 && inject.frame) inject.frame(sender.tab.id, sender.documentId);
  return { on };
}

async function onRecorded() {
  if ((await chrome.storage.session.get(UPDATE_WAITING))[UPDATE_WAITING]) await serial(updateWhenFree);
}

chrome.runtime.onInstalled.addListener(() => {
  inject.installed({ serial, getRules, restartAll });
});

chrome.runtime.onStartup.addListener(() => {
  serial(async () => inject.register(await getRules()));
});

chrome.runtime.onUpdateAvailable.addListener(() => {
  serial(updateWhenFree);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (!Object.keys(changes).some((k) => k === DEFAULT_KEY || k.startsWith(SITE_PREFIX))) return;
  serial(async () => {
    const after = await getRules();
    const before = rulesBefore(after, changes);
    await inject.register(after);
    await applySites(before, after);
    await updateAllTabs();
  });
});

// The permission for all sites given again (it may have been taken away in
// chrome://extensions): the rules did not change, so start where Gaffer is on.
chrome.permissions.onAdded.addListener(() => {
  serial(async () => {
    const rules = await getRules();
    await inject.register(rules);
    // Gaffer (dev) has no restart: its user scripts run on the next load.
    if (inject.restart) await restartAll(rules);
    await updateAllTabs();
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.url || info.status === "loading") await updateTab(tab, await getRules());
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await updateTab(await chrome.tabs.get(tabId), await getRules());
  } catch {}
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (sender.tab && !String(sender.url).startsWith(location.origin + "/")) {
    if (m.type === "frame") {
      onFrame(m, sender).then(reply, () => reply(null));
      return true;
    }
    if (m.type === "recorded") {
      onRecorded();
      return false;
    }
    return onBridge(m, sender, reply);
  }
  if (m.type === "status") {
    const ready = inject.ready();
    (async () => {
      if (ready) await serial(async () => inject.register(await getRules())).catch((e) => console.warn("[Gaffer] register:", e.message));
      const { release } = await chrome.storage.local.get("release");
      reply({ ready, dev: inject.DEV, release: release || null, updating: !!inject.busy?.() });
    })();
    return true;
  }
  if (m.type === "update" && inject.update) {
    inject.update().then(reply, (e) => reply({ ok: false, status: msg("popup.update.failed", { reason: e.message }) }));
    return true;
  }
  if (m.type === "inspect") {
    inspect(m.tabId).then(reply, (e) => reply({ ok: false, status: e.message }));
    return true;
  }
  return false;
});

inject.init?.({ serial, getRules, onBridge });
