import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lang, langCodes, placeholders, chromeKey, chromeMessages } from "../../build/lang.js";
import { t, format, translate } from "../../src/shared/i18n.js";

const root = path.join(import.meta.dirname, "..", "..");
const en = lang("en");
const PLURAL = /\.(singular|plural)$/;
const KEYLIKE = /^(manifest|popup|bookmarklet|direct|inspect)\.[A-Za-z]/;
const FILENAME = /\.(js|html|json|css|png|yml)$/;

function files(dir, ext) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && ext.some((x) => e.name.endsWith(x)))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)));
}

const SOURCES = [...files("src", [".js"]), ...files("extension", [".js", ".html", ".json"]), ...files("build", [".js"])];
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function baseKeys(texts) {
  return new Set(Object.keys(texts).map((k) => k.replace(PLURAL, "")));
}

function hasKey(texts, key) {
  return texts[key] !== undefined || (texts[key + ".singular"] !== undefined && texts[key + ".plural"] !== undefined);
}

function calls(source) {
  const out = [];
  for (const re of [/(?<![\w.])t\(\s*"([^"]+)"/g, /(?<![\w.])msg\(\s*"([^"]+)"/g, /getMessage\(\s*"([^"]+)"/g, /data-i18n(?:-title)?="([^"]+)"/g]) {
    for (const m of source.matchAll(re)) out.push(m[1]);
  }
  return out;
}

function literals(source) {
  return [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]).filter((s) => KEYLIKE.test(s) && !FILENAME.test(s) && !/\s/.test(s));
}

test("every key used in the code exists in lang/en.json", () => {
  const missing = [];
  for (const f of SOURCES) {
    const src = read(f);
    for (const key of [...calls(src), ...literals(src)]) if (!hasKey(en, key)) missing.push(f + ": " + key);
    const byChrome = new Map(Object.keys(en).map((k) => [chromeKey(k), k]));
    for (const m of src.matchAll(/__MSG_(\w+)__/g)) if (!byChrome.has(m[1])) missing.push(f + ": __MSG_" + m[1] + "__");
  }
  assert.deepEqual(missing, []);
});

test("lang/en.json has no unused keys", () => {
  const used = new Set();
  for (const f of SOURCES) {
    const src = read(f);
    for (const key of [...calls(src), ...literals(src)]) used.add(key);
    for (const m of src.matchAll(/__MSG_(\w+)__/g)) for (const k of Object.keys(en)) if (chromeKey(k) === m[1]) used.add(k);
  }
  assert.deepEqual([...baseKeys(en)].filter((k) => !used.has(k)), []);
});

test("Direct uses only direct.* texts and Inspect only inspect.* texts", () => {
  const wrong = [];
  for (const [dir, prefix] of [["src/direct", "direct."], ["src/inspect", "inspect."]]) {
    for (const f of files(dir, [".js"])) for (const key of calls(read(f))) if (!key.startsWith(prefix)) wrong.push(f + ": " + key);
  }
  assert.deepEqual(wrong, []);
});

test("plural texts come in pairs", () => {
  for (const code of langCodes()) {
    const texts = lang(code);
    for (const k of Object.keys(texts)) {
      if (!PLURAL.test(k)) continue;
      const base = k.replace(PLURAL, "");
      assert.ok(texts[base + ".singular"] !== undefined && texts[base + ".plural"] !== undefined, code + ": " + base);
      assert.equal(texts[base], undefined, code + ": " + base + " is both plural and plain");
    }
  }
});

test("placeholders match in every language and no text contains %", () => {
  for (const code of langCodes()) {
    const texts = lang(code);
    for (const [k, v] of Object.entries(texts)) {
      assert.equal(typeof v, "string", code + ": " + k);
      assert.ok(!v.includes("%"), code + ": " + k + " contains %");
      assert.ok(!v.includes("\n"), code + ": " + k + " contains a newline");
      if (code === "en") continue;
      assert.ok(en[k] !== undefined, code + ": " + k + " is not in en.json");
      assert.deepEqual(placeholders(v), placeholders(en[k]), code + ": " + k);
    }
  }
});

test("extension keys stay unique for chrome.i18n", () => {
  const seen = new Map();
  for (const k of Object.keys(chromeMessages(en))) {
    const lower = k.toLowerCase();
    assert.ok(!seen.has(lower), k + " collides with " + seen.get(lower));
    assert.match(k, /^[A-Za-z0-9_]+$/);
    seen.set(lower, k);
  }
});

test("chromeMessages turns placeholders into sorted positional ones", () => {
  const m = chromeMessages({ "popup.x": "{b} and {a} cost $5", "direct.y": "skip" });
  assert.deepEqual(m, { popup_x: { message: "$b$ and $a$ cost $$5", placeholders: { a: { content: "$1" }, b: { content: "$2" } } } });
});

test("t fills placeholders, picks plurals and falls back", () => {
  assert.equal(t("direct.quality.codecFallback", { label: "720p" }), "720p can't be played by your browser (codec), back to previous");
  assert.equal(t("inspect.monitor.count", { n: 1 }), "1 event recorded");
  assert.equal(t("inspect.monitor.count", { n: 3 }), "3 events recorded");
  assert.equal(t("no.such.key"), "no.such.key");
  assert.equal(format("{a} {b}", { a: 1 }), "1 {b}");
  assert.equal(translate({}, { x: "fallback {v}" }, "x", { v: 2 }), "fallback 2");
});
