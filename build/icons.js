import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findChrome } from "../test/e2e/chrome.js";

const root = path.join(import.meta.dirname, "..");
export const iconDir = path.join(root, "extension", "icons");
export const SIZES = [16, 32, 48, 128];
export const VARIANTS = { "": "none", "-off": "grayscale(1) brightness(.7)" };
const hashFile = path.join(iconDir, "icon.svg.sha256");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function svgHash() {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(iconDir, "icon.svg"))).digest("hex");
}

export function iconFiles() {
  return Object.keys(VARIANTS).flatMap((v) => SIZES.map((n) => `icon${v}-${n}.png`));
}

export function checkIcons() {
  const missing = iconFiles().filter((f) => !fs.existsSync(path.join(iconDir, f)));
  if (missing.length) return "the icons are missing (" + missing.join(", ") + "). Create them with: npm run icons";
  const saved = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, "utf8").trim() : "";
  if (saved !== svgHash()) return "icon.svg has changed. Recreate the icons with: npm run icons";
  return null;
}

async function render() {
  const bin = findChrome();
  if (!bin) throw new Error("Chrome for Testing is missing. Install it with: npm run chrome (or point CHROME at a Chrome binary).");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-icons-"));
  const chrome = spawn(bin, ["--no-sandbox", "--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  try {
    let port = null;
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      try {
        port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
      } catch {}
    }
    if (!port) throw new Error("Chrome did not start");
    let target = null;
    for (let i = 0; i < 50 && !target; i++) {
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
      } catch {}
      if (!target) await sleep(100);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) {
        pending.get(d.id)(d);
        pending.delete(d.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((ok, fail) => {
        const i = ++id;
        pending.set(i, (d) => (d.error ? fail(new Error(method + ": " + d.error.message)) : ok(d.result)));
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    await send("Page.enable");
    await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    const svg = "data:image/svg+xml;base64," + fs.readFileSync(path.join(iconDir, "icon.svg")).toString("base64");
    for (const [suffix, filter] of Object.entries(VARIANTS)) {
      for (const size of SIZES) {
        await send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
        const html = `<html><body style="margin:0;background:transparent"><img src="${svg}" width="${size}" height="${size}" style="display:block;filter:${filter}"></body></html>`;
        const { frameTree } = await send("Page.getFrameTree");
        await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
        await sleep(100);
        const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
        fs.writeFileSync(path.join(iconDir, `icon${suffix}-${size}.png`), Buffer.from(data, "base64"));
      }
    }
    ws.close();
  } finally {
    chrome.kill();
    await sleep(200);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  fs.writeFileSync(hashFile, svgHash() + "\n");
  console.log("icons created in", path.relative(root, iconDir));
}

if (process.argv[1] === import.meta.filename) {
  render().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
