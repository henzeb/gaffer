import { DEFAULT_KEY, accessLost, pageHost, ruleFor, rulesFrom, switchSite } from "./sites.js";
import { msg, manifestText, fillPage } from "./i18n.js";

const ALL_SITES = { origins: ["<all_urls>"] };
const $ = (id) => document.getElementById(id);
fillPage();

async function currentTab() {
  const param = new URLSearchParams(location.search).get("tab");
  if (param) return chrome.tabs.get(+param);
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

function setStatus(text, kind = "") {
  $("status").textContent = text || "";
  $("status").className = "status" + (kind ? " " + kind : "");
}

function resultKind(r) {
  return r && r.ok ? "good" : "error";
}

const tab = await currentTab();
const host = pageHost((tab && tab.url) || "");
let ready = false;

async function render() {
  const status = await chrome.runtime.sendMessage({ type: "status" });
  ready = status.ready;
  const rules = rulesFrom(await chrome.storage.sync.get(null));
  const rule = ruleFor(host, rules);
  const granted = await chrome.permissions.contains(ALL_SITES);

  $("noscripts").hidden = ready;
  $("host").textContent = host || (tab && tab.url ? new URL(tab.url).protocol.replace(":", "") : "—");
  $("unavailable").hidden = !!host;
  // Without the permission nothing runs: the switches show that, and switching
  // on asks for it again.
  $("lost").hidden = !accessLost(rules, granted);
  $("toggle").checked = !!host && rule.on && granted;
  $("toggle").disabled = !ready || !host;
  const via = !host || !granted ? "" : rule.via === null ? (rule.on ? msg("popup.via.default") : "") : rule.via !== host ? msg(rule.on ? "popup.via.on" : "popup.via.off", { site: rule.via }) : "";
  $("via").hidden = !via;
  $("via").textContent = via;
  $("default").checked = rules.def && granted;
  $("default").disabled = !ready;
  // Gaffer (dev) only starts once it has read its modules (§7.4).
  const rel = status.release;
  $("inspect").disabled = !ready || !host || (status.dev && !rel);

  $("title").textContent = manifestText(chrome.runtime.getManifest().name);
  $("versions").hidden = status.dev;
  $("version").textContent = chrome.runtime.getManifest().version;
  $("dev").hidden = !(status.dev && rel);
  $("built").textContent = status.dev && rel ? rel.built : "";
  $("update").hidden = !status.dev;
  if (status.updating) setStatus(msg("popup.busy"));
}

async function allowed(input) {
  if ((await chrome.permissions.contains(ALL_SITES)) || (await chrome.permissions.request(ALL_SITES))) return true;
  input.checked = false;
  setStatus(msg("popup.permission.direct"), "error");
  return false;
}

async function store(changes) {
  const set = {};
  const remove = [];
  for (const k of Object.keys(changes)) {
    if (changes[k] === null) remove.push(k);
    else set[k] = changes[k];
  }
  if (remove.length) await chrome.storage.sync.remove(remove);
  if (Object.keys(set).length) await chrome.storage.sync.set(set);
}

$("toggle").addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (on && !(await allowed(e.target))) return;
  await store(switchSite(host, on, rulesFrom(await chrome.storage.sync.get(null))));
  await render();
});

$("default").addEventListener("change", async (e) => {
  const on = e.target.checked;
  if (on && !(await allowed(e.target))) return;
  await chrome.storage.sync.set({ [DEFAULT_KEY]: on });
  await render();
});

$("inspect").addEventListener("click", async () => {
  if (!(await chrome.permissions.contains(ALL_SITES)) && !(await chrome.permissions.request(ALL_SITES))) {
    setStatus(msg("popup.permission.inspect"), "error");
    return;
  }
  const r = await chrome.runtime.sendMessage({ type: "inspect", tabId: tab.id });
  if (!r.ok) setStatus(r.status, "error");
});

$("update").addEventListener("click", async () => {
  $("update").disabled = true;
  setStatus(msg("popup.busy"));
  const r = await chrome.runtime.sendMessage({ type: "update" });
  setStatus(r.status, resultKind(r));
  $("update").disabled = false;
  await render();
});

$("open-settings").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
});

await render();
document.body.dataset.ready = "1";
