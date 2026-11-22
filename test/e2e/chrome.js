import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSIONS = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

export const chromeRoot = process.env.GAFFER_CHROME_DIR || path.join(os.homedir(), ".cache", "gaffer", "chrome-for-testing");

function binaryIn(dir) {
  return path.join(dir, "chrome-linux64", "chrome");
}

function installed() {
  if (!fs.existsSync(chromeRoot)) return [];
  return fs
    .readdirSync(chromeRoot)
    .filter((v) => fs.existsSync(binaryIn(path.join(chromeRoot, v))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const versions = installed();
  return versions.length ? binaryIn(path.join(chromeRoot, versions[versions.length - 1])) : null;
}

async function install() {
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error("only linux64 is supported");
  const res = await fetch(VERSIONS);
  if (!res.ok) throw new Error("versielijst: " + res.status);
  const stable = (await res.json()).channels.Stable;
  const dir = path.join(chromeRoot, stable.version);
  if (fs.existsSync(binaryIn(dir))) {
    console.log("Chrome for Testing " + stable.version + " is already present");
    return;
  }
  const url = stable.downloads.chrome.find((d) => d.platform === "linux64").url;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-chrome-"));
  try {
    const zip = path.join(tmp, "chrome.zip");
    const dl = await fetch(url);
    if (!dl.ok) throw new Error("download: " + dl.status);
    fs.writeFileSync(zip, Buffer.from(await dl.arrayBuffer()));
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("unzip", ["-q", zip, "-d", dir]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const old of installed()) if (old !== stable.version) fs.rmSync(path.join(chromeRoot, old), { recursive: true, force: true });
  console.log("Chrome for Testing " + stable.version + " in " + dir);
}

if (process.argv[1] === import.meta.filename) {
  install().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
