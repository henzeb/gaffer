import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = path.join(import.meta.dirname, "pages", "vendor");
const LIBS = {
  hls: { pkg: "hls.js", file: "dist/hls.min.js", out: "hls.min.js", license: "LICENSE", script: "vendor:hls" },
  dash: { pkg: "dashjs", file: "dist/modern/umd/dash.mediaplayer.min.js", out: "dash.min.js", license: "LICENSE.md", script: "vendor:dash" },
};

const versionFile = (name) => path.join(dir, name + ".version");

function current(name) {
  try { return fs.readFileSync(versionFile(name), "utf8").trim(); } catch { return null; }
}

async function latest(lib) {
  const res = await fetch("https://registry.npmjs.org/" + lib.pkg + "/latest", { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("npm registry: " + res.status);
  return (await res.json()).version;
}

function install(name, lib, version) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-vendor-"));
  try {
    const file = execFileSync("npm", ["pack", lib.pkg + "@" + version, "--silent", "--pack-destination", tmp], { cwd: tmp, encoding: "utf8" }).trim().split("\n").pop();
    execFileSync("tar", ["-xzf", path.join(tmp, file), "-C", tmp]);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(tmp, "package", lib.file), path.join(dir, lib.out));
    fs.copyFileSync(path.join(tmp, "package", lib.license), path.join(dir, name + ".LICENSE"));
    fs.writeFileSync(versionFile(name), version + "\n");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function check(name, lib) {
  const have = current(name);
  try {
    const want = await latest(lib);
    if (have !== want) console.warn(`warning: ${lib.pkg} ${have || "is missing"} in test/e2e/pages/vendor, newest is ${want}. Update: npm run ${lib.script}`);
  } catch (e) {
    console.warn(`warning: could not check the ${lib.pkg} version (${e.message})`);
  }
}

(async () => {
  if (process.argv.includes("--check")) {
    for (const [name, lib] of Object.entries(LIBS)) await check(name, lib);
    return;
  }
  const name = process.argv[2];
  const lib = LIBS[name];
  if (!lib) throw new Error("usage: node test/e2e/vendor.js <" + Object.keys(LIBS).join("|") + "> [version]");
  const have = current(name);
  const want = process.argv[3] || (await latest(lib));
  if (have === want) { console.log(lib.pkg + " " + want + " is already present"); return; }
  install(name, lib, want);
  console.log(lib.pkg + " " + (have ? have + " → " : "") + want);
})().catch((e) => { console.error(e.message); process.exit(1); });
