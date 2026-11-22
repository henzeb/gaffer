import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { originalPosition } from "./sourcemap.js";
import { buildExtension } from "./extension.js";
import { lang, text } from "./lang.js";

const root = path.join(import.meta.dirname, "..");
const dist = path.join(root, "dist");

const targets = {
  capture: {
    entry: "src/capture/index.js",
  },
  direct: {
    entry: "src/direct/index.js",
    core: { entry: "src/direct/core.js", module: "gaffer:direct-core", name: "GafferCore" },
    file: "gaffer-direct",
    title: "Gaffer Direct",
    help: "bookmarklet.direct.help",
    before: "capture",
  },
  inspect: {
    entry: "src/inspect/index.js",
    file: "gaffer-inspect",
    title: "Gaffer Inspect",
    help: "bookmarklet.inspect.help",
  },
};

export const MODULE_NAMES = Object.keys(targets);

const BASE = { bundle: true, format: "iife", target: "chrome120", minify: true, legalComments: "none", supported: { "template-literal": false } };

function langPlugin(prefix) {
  return {
    name: "lang",
    setup(b) {
      b.onLoad({ filter: /[\\/]lang[\\/][^\\/]+\.json$/ }, (args) => {
        const texts = JSON.parse(fs.readFileSync(args.path, "utf8"));
        const own = Object.fromEntries(Object.entries(texts).filter(([k]) => k.startsWith(prefix + ".")));
        return { contents: JSON.stringify(own), loader: "json" };
      });
    },
  };
}

// The core's own sourcemap goes inline under the wrapped code, so esbuild takes
// it into the map of the main bundle: places in the core then point to their
// source file, also for the % check.
function coreMap(res) {
  const file = res.outputFiles.find((f) => f.path.endsWith(".map"));
  if (!file) return "";
  const map = JSON.parse(file.text);
  map.mappings = ";" + map.mappings; // the wrapper adds one line above the code
  return "//# sourceMappingURL=data:application/json;base64," + Buffer.from(JSON.stringify(map)).toString("base64") + "\n";
}

async function corePlugin(name, core, stamp, logLevel, sourcemap, mainFile) {
  // Next to the main bundle, so the paths in both maps are relative to the same folder.
  const outfile = path.join(path.dirname(mainFile), core.name + ".js");
  const res = await esbuild.build({ ...BASE, entryPoints: [path.join(root, core.entry)], globalName: core.name, write: false, outfile, sourcemap: sourcemap ? "external" : false, plugins: [langPlugin(name)], define: { __BUILD__: JSON.stringify(stamp) }, logLevel });
  const code = res.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const map = sourcemap ? coreMap(res) : "";
  return {
    name: "core",
    setup(b) {
      b.onResolve({ filter: new RegExp("^" + core.module + "$") }, () => ({ path: core.module, namespace: "gaffer" }));
      b.onLoad({ filter: /.*/, namespace: "gaffer" }, () => ({ contents: "export function makeCore() {\n" + code + "\nreturn " + core.name + ";\n}\n" + map, loader: "js" }));
    },
  };
}

export async function bundle(name, outfile, stamp, { sourcemap = "external", logLevel = "warning" } = {}) {
  const t = targets[name];
  const plugins = [langPlugin(name), ...(t.core ? [await corePlugin(name, t.core, stamp, logLevel, !!sourcemap, outfile)] : [])];
  return esbuild.build({ ...BASE, entryPoints: [path.join(root, t.entry)], outfile, sourcemap, plugins, define: { __BUILD__: JSON.stringify(stamp) }, logLevel });
}

export function buildStamp(d = new Date(), { seconds = false } = {}) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` + (seconds ? ":" + pad(d.getSeconds()) : "");
}

export class BuildError extends Error {}

function fail(message) {
  throw new BuildError(message);
}

export function checkPercent(name, code, map) {
  const lines = code.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const column = lines[line].indexOf("%");
    if (column < 0) continue;
    const pos = originalPosition(map, line, column);
    const where = pos ? `${path.relative(root, path.resolve(dist, pos.source))}:${pos.line + 1}:${pos.column + 1}` : `dist/${name}.js:${line + 1}:${column + 1}`;
    fail(`${name}: the bookmarklet contains a % (${where}): …${lines[line].slice(Math.max(0, column - 40), column + 40)}…`);
  }
}

function checkUrl(name, bookmarklet) {
  const href = new URL(bookmarklet).href.slice("javascript:".length);
  const bytes = [];
  for (let i = 0; i < href.length; i++) {
    if (href[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(href.substr(i + 1, 2))) {
      bytes.push(parseInt(href.substr(i + 1, 2), 16));
      i += 2;
    } else bytes.push(...Buffer.from(href[i]));
  }
  if (Buffer.from(bytes).toString("utf8") !== bookmarklet.slice("javascript:".length)) fail(name + ": the bookmarklet URL does not round-trip unchanged");
  new Function(bookmarklet.slice("javascript:".length));
}

function bookmarkletPage(t, stamp, bookmarklet, texts = lang()) {
  const esc = bookmarklet.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const esc2 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${t.title} ${stamp}</title><style>body{font:16px system-ui,sans-serif;background:#111;color:#eee;padding:40px;max-width:640px;margin:auto}a.bm{display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;border-radius:10px;text-decoration:none;font-weight:700}.ver{color:#8b8b95;font-size:14px}</style></head><body><h1>${t.title}</h1><p class="ver">${esc2(text(texts, "bookmarklet.version", { version: stamp }))}</p><p>${esc2(text(texts, "bookmarklet.drag"))}</p><p><a class="bm" href="${esc}">${t.title}</a></p><p>${esc2(text(texts, t.help))}</p></body></html>`;
}

function extension(version) {
  try {
    buildExtension(path.join(dist, "extension"), { version });
  } catch (e) {
    fail("extension: " + e.message);
  }
  console.log("built extension");
}

async function bundleChecked(name, stamp) {
  const outfile = path.join(dist, name + ".js");
  await bundle(name, outfile, stamp);
  const code = fs.readFileSync(outfile, "utf8").trim();
  checkPercent(name, code, JSON.parse(fs.readFileSync(outfile + ".map", "utf8")));
  return code;
}

// `version` is a release (§7.2): the stamp in the modules and the version of the extension.
export async function build(names, stamp = buildStamp(), { version } = {}) {
  fs.mkdirSync(dist, { recursive: true });
  for (const name of names) {
    if (name === "extension") {
      extension(version);
      continue;
    }
    const t = targets[name];
    if (!t) fail("unknown target: " + name);
    const code = await bundleChecked(name, stamp);
    if (!t.file) {
      console.log("built", name, stamp, code.length, "chars");
      continue;
    }
    const before = t.before ? await bundleChecked(t.before, stamp) : "";
    const bookmarklet = "javascript:" + (before ? before + ";" : "") + code;
    checkUrl(name, bookmarklet);
    fs.writeFileSync(path.join(dist, t.file + "-bookmarklet.js"), bookmarklet + "\n");
    fs.writeFileSync(path.join(dist, t.file + ".html"), bookmarkletPage(t, stamp, bookmarklet));
    console.log("built", name, stamp, bookmarklet.length, "chars");
  }
}

if (process.argv[1] === import.meta.filename) {
  const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  try {
    await build(names.length ? names : [...Object.keys(targets), "extension"]);
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
