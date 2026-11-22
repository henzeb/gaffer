import { msg } from "./i18n.js";
import { DEV_PORT, SHELL_STAMP } from "./dev-config.js";

const MODULES = ["direct", "capture", "inspect"];
const ALARM = "gaffer-dev-connect";
const SHELL = ["manifest.json", "background.js", "inject.js", "source.js", "dev-config.js", "sites.js", "prelude.js", "bridge.js", "auto.js", "level.js", "popup.html", "popup.js", "i18n.js", "_locales/en/messages.json"];
const RETRY = 2000;

async function readOwn(file, as) {
  const res = await fetch(chrome.runtime.getURL(file), { cache: "no-store" });
  if (!res.ok) throw new Error(file + ": " + res.status);
  return as === "json" ? res.json() : res.text();
}

async function shellReady(stamp) {
  try {
    const config = await readOwn("dev-config.js");
    const m = /SHELL_STAMP = "([^"]*)"/.exec(config);
    if (!m || m[1] !== stamp) return false;
    for (const f of SHELL) await readOwn(f);
    return true;
  } catch {
    return false;
  }
}

export async function fetchUpdate(current, getCode) {
  let build;
  try {
    build = await readOwn("modules/build.json", "json");
  } catch {
    return { ok: false, status: msg("popup.update.noModules") };
  }
  const store = {};
  const changed = [];
  try {
    for (const name of MODULES) {
      const code = await readOwn("modules/" + name + ".js");
      if (code === (await getCode(name))) continue;
      store["code." + name] = code;
      changed.push(name);
    }
  } catch (e) {
    return { ok: false, status: msg("popup.update.failed", { reason: e.message }) };
  }
  if (!changed.length && current && current.id === build.id) return { ok: true, status: msg("popup.update.latest") };
  store.release = { dev: true, id: build.id, built: build.built, modules: Object.fromEntries(MODULES.map((name) => [name, { version: build.built }])) };
  return { ok: true, status: msg("popup.update.done"), store, changed };
}

let socket = null;
let retry = null;

function connect(update) {
  if (socket) return;
  clearTimeout(retry);
  let ws;
  try {
    ws = new WebSocket("ws://127.0.0.1:" + DEV_PORT);
  } catch {
    return;
  }
  socket = ws;
  ws.onmessage = async (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.shell && msg.shell !== SHELL_STAMP) {
      if (await shellReady(msg.shell)) chrome.runtime.reload();
      return;
    }
    if (msg.type === "hello" || msg.type === "modules") {
      const { release } = await chrome.storage.local.get("release");
      if (!release || release.id !== msg.modules) await update();
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    retry = setTimeout(() => connect(update), RETRY);
  };
}

export function startSource({ update }) {
  chrome.action.setBadgeText({ text: "dev" });
  chrome.action.setBadgeBackgroundColor({ color: "#14b8a6" });
  chrome.action.setBadgeTextColor({ color: "#0f172a" });
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) connect(update);
  });
  connect(update);
}
