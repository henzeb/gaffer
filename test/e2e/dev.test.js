import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch } from "./harness.js";
import { t } from "../../src/shared/i18n.js";
import { startDev } from "../../build/dev.js";

const extDir = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-dev-"));
let page;
let dev;

before(async () => {
  dev = await startDev({ out: path.join(extDir, "gaffer-dev"), port: 0, watch: false, grantAllSites: true, log: () => {} });
  await dev.modules("dev-1");
  page = await launch({ extension: () => dev.out });
});

after(async () => {
  await page?.close();
  await dev?.close();
  fs.rmSync(extDir, { recursive: true, force: true });
});

const version = () => page.eval(`document.querySelector("#video-ultimate-top .help .ver")?.textContent.replace("Gaffer Direct ", "") ?? null`);
const stored = () => page.inWorker(`chrome.storage.local.get("release").then((r) => r.release ?? null)`);

async function until(fn, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await page.sleep(50);
  }
  throw new Error("timeout, last value: " + JSON.stringify(last));
}

async function popupFor(url, fn) {
  const popup = await page.popup(url);
  try {
    return await fn(popup);
  } finally {
    await popup.close();
  }
}

async function toggle(url, on) {
  await popupFor(url, async (popup) => {
    assert.equal(await popup.eval(`document.getElementById("toggle").checked`), !on);
    await popup.click("#toggle");
    await popup.waitFor(`document.getElementById("toggle").checked === ${on}`);
  });
}

test("dev: the modules come from the extension folder and the popup shows the development version", async () => {
  await until(async () => (await stored())?.built === "dev-1");
  await until(() => dev.server.clients.size === 1);
  assert.equal(await page.inWorker(`chrome.action.getBadgeText({})`), "dev");
  await page.open("video.html");
  await popupFor(page.url("video.html"), async (popup) => {
    assert.equal(await popup.eval(`document.getElementById("title").textContent`), t("manifest.nameDev"));
    assert.equal(await popup.eval(`document.getElementById("versions").hidden`), true);
    assert.equal(await popup.eval(`document.getElementById("dev").hidden`), false);
    assert.equal(await popup.eval(`document.getElementById("built").textContent`), "dev-1");
    await popup.click("#update");
    await popup.waitFor(`!["", ${JSON.stringify(t("popup.busy"))}].includes(document.getElementById("status").textContent)`, 10000);
    assert.equal(await popup.eval(`document.getElementById("status").textContent`), t("popup.update.latest"));
  });
});

test("dev: Inspect says it runs in the development version and also has Copy", async () => {
  await page.open("video.html");
  await popupFor(page.url("video.html"), async (popup) => {
    await popup.click("#inspect");
    await page.waitFor(`!!document.querySelector("#vu-analyse textarea")`, 5000);
  });
  const r = await page.eval(`document.querySelector("#vu-analyse textarea").value`);
  assert.ok(r.includes("\n" + t("inspect.report.started", { how: t("inspect.report.started.dev") }) + "\n"), r);
  assert.deepEqual(await page.eval(`[...document.querySelectorAll("#vu-analyse button")].map((b) => b.textContent)`), [t("inspect.button.monitor"), t("inspect.button.report"), t("inspect.button.copy"), t("inspect.button.close")]);
});

test("dev: after a signal the new module runs right away in the open tab", async () => {
  await page.open("video.html");
  await toggle(page.url("video.html"), true);
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`);
  assert.equal(await version(), "dev-1");
  await dev.modules("dev-2");
  await page.waitFor(`document.querySelector("#video-ultimate-top .help .ver")?.textContent.replace("Gaffer Direct ", "") === "dev-2"`, 10000);
  assert.equal(await page.eval(`document.querySelectorAll("#video-ultimate-bar").length`), 1);
  await page.open("video.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .help .ver")?.textContent.replace("Gaffer Direct ", "") === "dev-2"`, 5000);
});

test("dev: without a server the last version keeps working and it updates when the server returns", async () => {
  await dev.server.close();
  await dev.modules("dev-3");
  await page.open("video.html");
  await page.waitFor(`!!document.getElementById("video-ultimate-bar")`, 5000);
  assert.equal(await version(), "dev-2");
  await dev.reopen();
  await page.waitFor(`document.querySelector("#video-ultimate-top .help .ver")?.textContent.replace("Gaffer Direct ", "") === "dev-3"`, 15000);
});

test("dev: a signal for a shell that is not ready yet does not reload", async () => {
  await page.inWorker(`globalThis.__oldShell = true`);
  dev.server.broadcast({ type: "shell", shell: "not-built-yet" });
  await page.sleep(1500);
  assert.equal(await page.inWorker(`globalThis.__oldShell === true`), true);
  assert.equal(dev.server.clients.size, 1);
});

test("dev: a changed shell reloads itself and Direct keeps starting", async () => {
  await page.inWorker(`globalThis.__oldShell = true`);
  await dev.shell("shell-2");
  const fresh = () => Promise.race([page.inWorker(`globalThis.__oldShell !== true`), page.sleep(2000).then(() => false)]).catch(() => false);
  await until(async () => (await fresh()) === true, 20000);
  await until(() => dev.server.clients.size === 1);
  await until(() => page.inWorker(`chrome.userScripts.getScripts().then((s) => s.length > 0)`).catch(() => false));
  await page.open("video.html");
  await page.waitFor(`document.querySelector("#video-ultimate-top .help .ver")?.textContent.replace("Gaffer Direct ", "") === "dev-3"`, 5000);
  await toggle(page.url("video.html"), false);
  await page.waitFor(`!document.getElementById("video-ultimate-bar")`);
});
