import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as server from "./server.js";
import { findChrome } from "./chrome.js";
import { ensureFixtures } from "../fixtures/ensure.js";

const root = path.join(import.meta.dirname, "..", "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const timing = Number(process.env.GAFFER_TIMING || 0.2);
const settle = Number(process.env.GAFFER_SETTLE || 30);

const tools = {
  direct: process.env.DIRECT_BM || "dist/gaffer-direct-bookmarklet.js",
  inspect: process.env.INSPECT_BM || "dist/gaffer-inspect-bookmarklet.js",
};

const keyCodes = {
  Escape: 27, MediaPlayPause: 179, " ": 32, PageUp: 33, PageDown: 34, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
};

export function toolCode(name) {
  const file = path.resolve(root, tools[name] || name);
  const text = fs.readFileSync(file, "utf8").trim();
  return text.startsWith("javascript:") ? text.slice("javascript:".length) : text;
}

export function extensionId(dir) {
  const hash = crypto.createHash("sha256").update(fs.realpathSync(dir)).digest("hex").slice(0, 32);
  return [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

async function connect(wsUrl, { pageDomain = true } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.addEventListener("open", ok); ws.addEventListener("error", fail); });

  let id = 0;
  const pending = new Map();
  const listeners = [];
  const logs = [];
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === "Runtime.consoleAPICalled") logs.push(d.params.type + ": " + d.params.args.map((a) => a.value ?? a.description).join(" "));
    if (d.method === "Runtime.exceptionThrown") logs.push("exception: " + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    for (const l of listeners) l(d);
  });

  const send = (method, params = {}) => new Promise((ok, fail) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? fail(new Error(method + ": " + d.error.message)) : ok(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const once = (method) => new Promise((ok) => {
    const l = (d) => { if (d.method === method) { listeners.splice(listeners.indexOf(l), 1); ok(d.params); } };
    listeners.push(l);
  });

  await send("Runtime.enable");
  if (pageDomain) {
    await send("Page.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__gafferTiming = " + timing + ";" });
  }
  const page = {
    logs,
    send,
    sleep,
    url: (file) => file,
    async open(file, opts) {
      logs.length = 0;
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url: /^[a-z-]+:/.test(file) ? file : page.url(file, opts) });
      await loaded;
    },
    async eval(expr, { gesture = true } = {}) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: gesture });
      if (r.exceptionDetails) throw new Error("eval: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async run(tool) {
      await page.eval(toolCode(tool) + ";void 0");
    },
    async waitFor(expr, timeout = 5000, interval = 25) {
      const end = Date.now() + timeout;
      let last;
      while (Date.now() < end) {
        last = await page.eval(expr);
        if (last) return last;
        await sleep(interval);
      }
      throw new Error(`waitFor timeout (${timeout} ms): ${expr} → ${JSON.stringify(last)}`);
    },
    async center(selector) {
      const pos = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!pos) throw new Error("not found: " + selector);
      return pos;
    },
    async move(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await sleep(settle);
    },
    async hover(selector) {
      const [x, y] = await page.center(selector);
      await page.move(x, y);
      return [x, y];
    },
    async clickAt(x, y, { count = 1, shift = false } = {}) {
      const modifiers = shift ? 8 : 0;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers });
      for (let c = 1; c <= count; c++) {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: c, modifiers });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: c, modifiers });
      }
      await sleep(settle);
    },
    async click(selector, opts) {
      const [x, y] = await page.center(selector);
      await page.clickAt(x, y, opts);
    },
    async clickButton(titlePrefix, opts) {
      const pos = await page.eval(`(() => { const b = [...document.querySelectorAll("#video-ultimate-bar button, #video-ultimate-top button")].find((b) => b.title.startsWith(${JSON.stringify(titlePrefix)})); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!pos) throw new Error("button not found: " + titlePrefix);
      await page.clickAt(pos[0], pos[1], opts);
    },
    async drag(x1, y1, x2, y2, steps = 5) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
      for (let k = 1; k <= steps; k++) {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * k) / steps, y: y1 + ((y2 - y1) * k) / steps, button: "left", buttons: 1 });
      }
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
      await sleep(settle);
    },
    async wheel(x, y, deltaY, modifiers = 0) {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY, modifiers });
      await sleep(settle);
    },
    async key(key, { shift = false } = {}) {
      const modifiers = shift ? 8 : 0;
      const code = keyCodes[key];
      if (key.length === 1) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key, text: key, modifiers, windowsVirtualKeyCode: code || key.toUpperCase().charCodeAt(0) });
      } else {
        await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, modifiers, windowsVirtualKeyCode: code });
      }
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, modifiers, windowsVirtualKeyCode: code });
      await sleep(settle);
    },
    dyn() {
      return page.eval(`(document.getElementById("vu-dyn")?.textContent || "").replace(/!important/g, "")`);
    },
    async disconnect() {
      try { ws.close(); } catch {}
    },
  };
  return page;
}

export async function launch({ extension, args = [] } = {}) {
  const chromeBin = findChrome();
  if (!chromeBin) throw new Error("Chrome for Testing is missing. Install it with: npm run chrome (or point CHROME at a Chrome binary).");
  ensureFixtures();
  const srv = await server.start();
  const port = srv.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-e2e-"));
  const extDir = extension ? await extension(port, srv) : null;
  const chrome = spawn(chromeBin, [
    "--no-sandbox",
    "--headless=new",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    "--mute-audio",
    "--window-size=1280,800",
    ...(extDir ? ["--load-extension=" + extDir, "--disable-extensions-except=" + extDir] : []),
    ...args,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  let exited = null;
  chrome.stderr.on("data", (d) => { stderr = (stderr + d).slice(-2000); });
  chrome.on("exit", (code) => { exited = code; });

  const portFile = path.join(profile, "DevToolsActivePort");
  let cdpPort = null;
  for (let i = 0; i < 100 && !cdpPort; i++) {
    await sleep(100);
    if (exited !== null) throw new Error("Chrome stopped immediately (code " + exited + "):\n" + stderr);
    if (fs.existsSync(portFile)) cdpPort = fs.readFileSync(portFile, "utf8").split("\n")[0];
  }
  if (!cdpPort) throw new Error("Chrome did not start (no DevToolsActivePort)");
  const http = `http://127.0.0.1:${cdpPort}`;
  const targets = async () => { try { return await (await fetch(http + "/json")).json(); } catch { return []; } };

  let list = [];
  for (let i = 0; i < 50 && !list.some((t) => t.type === "page"); i++) {
    list = await targets();
    if (!list.some((t) => t.type === "page")) await sleep(100);
  }
  const page = await connect(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  const tabs = [];
  page.port = port;
  page.server = srv;
  page.url = (file, { cross = false, host } = {}) => `http://${host || (cross ? "localhost" : "127.0.0.1")}:${port}/${file}`;
  page.targets = targets;
  page.tab = async (url) => {
    const t = await (await fetch(http + "/json/new?about:blank", { method: "PUT" })).json();
    const tab = await connect(t.webSocketDebuggerUrl);
    tab.targetId = t.id;
    tab.url = page.url;
    await tab.open(url);
    tab.close = async () => {
      await tab.disconnect();
      await fetch(http + "/json/close/" + t.id).catch(() => {});
      tabs.splice(tabs.indexOf(tab), 1);
    };
    tabs.push(tab);
    return tab;
  };

  if (extDir) {
    const extId = extensionId(extDir);
    page.extensionId = extId;
    page.worker = async (timeout = 5000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const sw = (await targets()).find((t) => t.type === "service_worker" && t.url === `chrome-extension://${extId}/background.js`);
        if (sw) return connect(sw.webSocketDebuggerUrl, { pageDomain: false });
        await sleep(100);
      }
      throw new Error("no service worker for the extension");
    };
    page.inWorker = async (expr) => {
      const w = await page.worker();
      try { return await w.eval(expr); } finally { await w.disconnect(); }
    };
    page.tabId = (url) => page.inWorker(`chrome.tabs.query({}).then((t) => t.find((x) => x.url === ${JSON.stringify(url)})?.id ?? null)`);
    page.popup = async (url) => {
      const tabId = await page.tabId(url);
      if (tabId === null) throw new Error("no tab with " + url);
      const popup = await page.tab(`chrome-extension://${extId}/popup.html?tab=${tabId}`);
      await popup.waitFor(`document.body.dataset.ready === "1"`);
      return popup;
    };
    // Gaffer (dev) uses user scripts (§7.4); the regular extension does not.
    const userScripts = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8")).permissions.includes("userScripts");
    const settings = await page.tab("chrome://extensions/?id=" + extId);
    await settings.waitFor("!!(window.chrome && chrome.developerPrivate)");
    await settings.eval(`new Promise((ok) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, () => ok(true)))`);
    if (userScripts) await settings.eval(`new Promise((ok) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId: ${JSON.stringify(extId)}, userScriptsAccess: true }, () => ok(true)))`);
    await settings.close();
    const ready = !userScripts || (await page.inWorker("(() => { try { chrome.userScripts.getScripts(); return true; } catch { return false; } })()"));
    if (!ready) throw new Error("Allow User Scripts is off for the test extension and could not be turned on automatically. Turn it on once by hand on chrome://extensions in the test profile.");
  }

  page.close = async () => {
    for (const t of [...tabs]) await t.disconnect();
    await page.disconnect();
    chrome.kill();
    srv.close();
    await sleep(200);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return page;
}
