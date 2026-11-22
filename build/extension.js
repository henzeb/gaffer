import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { checkIcons, iconFiles, iconDir } from "./icons.js";
import { LANG_DIR, langCodes, localeFiles } from "./lang.js";

const root = path.join(import.meta.dirname, "..");
export const shellDir = path.join(root, "extension");
const dist = path.join(root, "dist");
export const SHELL_FILES = ["manifest.json", "background.js", "inject.js", "popup.html", "popup.js", "auto.js", "bridge.js", "level.js", "sites.js", "i18n.js"];
// The modules that go into the package (§4.1), from dist/ unless given.
export const MODULES = ["capture", "direct", "inspect"];

export function manifest() {
  return JSON.parse(fs.readFileSync(path.join(shellDir, "manifest.json"), "utf8"));
}

// Gaffer (dev) replaces these with its own from extension/dev/ (§7.4).
export const DEV_FILES = ["inject.js", "source.js", "prelude.js", "bridge.js"];
export const DEV_KEEP = "modules";
export const SHELL_BUILDERS = ["build/extension.js", "build/lang.js", "build/icons.js", "src/shared/i18n.js"];

export function shellStamp() {
  const hash = crypto.createHash("sha256");
  const files = [...SHELL_FILES, ...DEV_FILES.map((f) => "dev/" + f), ...iconFiles().map((f) => "icons/" + f)];
  for (const f of files) hash.update(f + "\0").update(fs.readFileSync(path.join(shellDir, f)));
  for (const code of langCodes()) hash.update("lang/" + code + "\0").update(fs.readFileSync(path.join(LANG_DIR, code + ".json")));
  for (const f of SHELL_BUILDERS) hash.update(f + "\0").update(fs.readFileSync(path.join(root, f)));
  return hash.digest("hex").slice(0, 16);
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function removeStale(out, keep, wanted) {
  if (!fs.existsSync(out)) return;
  for (const [rel, file] of walk(out)) {
    if (keep && (rel === keep || rel.startsWith(keep + "/"))) continue;
    if (!wanted.has(rel)) fs.rmSync(file, { force: true });
  }
}

function moduleFile(name) {
  const file = path.join(dist, name + ".js");
  if (!fs.existsSync(file)) throw new Error("dist/" + name + ".js is missing. Build the modules first with: npm run build");
  return fs.readFileSync(file, "utf8").trim() + "\n";
}

// The extension in `out`: the shell with the modules (§4.1). `modules(name)`
// gives a module's code instead of dist/<name>.js, `version` the version in the
// manifest (a release, §7.2). Gaffer (dev) reads its modules itself (§7.4).
export function buildExtension(out, { grantAllSites = false, dev, modules = moduleFile, version } = {}) {
  const problem = checkIcons();
  if (problem) throw new Error(problem);
  const files = new Map();
  for (const f of SHELL_FILES) files.set(f, fs.readFileSync(path.join(shellDir, f)));
  for (const f of iconFiles()) files.set("icons/" + f, fs.readFileSync(path.join(iconDir, f)));
  for (const [f, data] of localeFiles()) files.set(f, data);
  if (!dev) for (const name of MODULES) files.set("modules/" + name + ".js", modules(name));
  const m = manifest();
  if (version) m.version = version;
  if (grantAllSites) {
    m.host_permissions = m.optional_host_permissions;
    delete m.optional_host_permissions;
  }
  if (dev) {
    m.name = "__MSG_manifest_nameDev__";
    m.action.default_title = "__MSG_manifest_nameDev__";
    m.permissions = [...m.permissions.filter((p) => p !== "scripting"), "userScripts", "alarms"];
    for (const f of DEV_FILES) files.set(f, fs.readFileSync(path.join(shellDir, "dev", f)));
    files.set("dev-config.js", `export const DEV_PORT = ${JSON.stringify(dev.port)};\nexport const SHELL_STAMP = ${JSON.stringify(dev.stamp || shellStamp())};\n`);
  }
  if (grantAllSites || dev || version) files.set("manifest.json", JSON.stringify(m, null, 2) + "\n");
  const keep = dev ? DEV_KEEP : null;
  removeStale(out, keep, new Set(files.keys()));
  const order = [...files.keys()].filter((f) => f !== "manifest.json" && f !== "dev-config.js").concat(["manifest.json"], files.has("dev-config.js") ? ["dev-config.js"] : []);
  for (const f of order) writeAtomic(path.join(out, f), files.get(f));
  return out;
}

function dosDateTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function walk(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), prefix + e.name + "/") : [[prefix + e.name, path.join(dir, e.name)]],
  );
}

export function zip(dir, outFile, folder) {
  const { time, date } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [rel, file] of walk(dir)) {
    const name = Buffer.from(folder ? folder + "/" + rel : rel);
    const data = fs.readFileSync(file);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(outFile, Buffer.concat([...locals, cd, end]));
  return outFile;
}

// dist/gaffer-extension-<version>.zip from dist/extension/, with the version of
// its manifest. The Web Store wants manifest.json at the root of the zip.
export function packExtension() {
  const dir = path.join(dist, "extension");
  if (!fs.existsSync(path.join(dir, "manifest.json"))) throw new Error("dist/extension/ is missing. Build first with: npm run build");
  const version = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).version;
  return zip(dir, path.join(dist, `gaffer-extension-${version}.zip`));
}

if (process.argv[1] === import.meta.filename) {
  try {
    console.log("created:", path.relative(root, packExtension()));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
