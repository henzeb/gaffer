import { test } from "node:test";
import assert from "node:assert/strict";
import * as esbuild from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPercent, buildStamp, BuildError, bundle as bundleTool } from "../../build/build.js";
import { originalPosition } from "../../build/sourcemap.js";

const source = ["export function f(x) {", "  const n = 7;", '  return "a" + x * n + "%";', "}", "f(1);"].join("\n");

async function bundle() {
  const r = await esbuild.build({
    stdin: { contents: source, sourcefile: "src/demo.js", loader: "js" },
    bundle: true,
    format: "iife",
    minify: true,
    sourcemap: "external",
    outfile: "out.js",
    write: false,
  });
  const code = r.outputFiles.find((f) => f.path.endsWith(".js")).text.trim();
  const map = JSON.parse(r.outputFiles.find((f) => f.path.endsWith(".map")).text);
  return { code, map };
}

test("originalPosition points at the source", async () => {
  const { code, map } = await bundle();
  const pos = originalPosition(map, 0, code.indexOf("%"));
  assert.equal(pos.source.endsWith("src/demo.js"), true);
  assert.equal(pos.line, 2);
});

test("checkPercent stops the build with the location in the source", async () => {
  const { code, map } = await bundle();
  assert.throws(() => checkPercent("demo", code, map), (e) => e instanceof BuildError && /src\/demo\.js:3:\d+/.test(e.message));
  assert.doesNotThrow(() => checkPercent("demo", code.replace("%", "pct"), map));
});

test("the map of Direct also covers its core, without changing the code", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-map-"));
  try {
    const plain = path.join(dir, "plain.js");
    const mapped = path.join(dir, "direct.js");
    await bundleTool("direct", plain, "x", { sourcemap: false, logLevel: "error" });
    await bundleTool("direct", mapped, "x", { logLevel: "error" });
    const code = fs.readFileSync(mapped, "utf8");
    assert.equal(code, fs.readFileSync(plain, "utf8"));
    const map = JSON.parse(fs.readFileSync(mapped + ".map", "utf8"));
    // The core (core.js and what only it imports, such as ui/bar.js) is in the map, by its real path.
    const sources = map.sources.map((x) => path.resolve(dir, x));
    for (const f of ["src/direct/core.js", "src/direct/ui/bar.js", "src/direct/index.js"]) assert.ok(sources.includes(path.resolve(f)), f);
    assert.equal(map.sources.some((x) => x.startsWith("gaffer:")), false);
    const lines = code.split("\n");
    assert.equal(lines[0].includes("sourceMappingURL"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildStamp", () => {
  assert.equal(buildStamp(new Date(2026, 10, 9, 7, 5)), "09-11-2026 07:05");
});
