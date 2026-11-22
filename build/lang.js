import fs from "node:fs";
import path from "node:path";
import { translate } from "../src/shared/i18n.js";

const root = path.join(import.meta.dirname, "..");
export const LANG_DIR = path.join(root, "lang");
export const DEFAULT_LANG = "en";
export const EXTENSION_PREFIXES = ["manifest.", "popup."];

export function langCodes() {
  return fs.readdirSync(LANG_DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
}

export function lang(code = DEFAULT_LANG) {
  return JSON.parse(fs.readFileSync(path.join(LANG_DIR, code + ".json"), "utf8"));
}

export function text(texts, key, params) {
  return translate(texts, lang(), key, params);
}

export function placeholders(message) {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

export function chromeKey(key) {
  return key.replace(/\./g, "_");
}

export function chromeMessages(texts) {
  const out = {};
  for (const [key, message] of Object.entries(texts)) {
    if (!EXTENSION_PREFIXES.some((p) => key.startsWith(p))) continue;
    const names = placeholders(message);
    const entry = { message: message.replace(/\$/g, "$$$$").replace(/\{(\w+)\}/g, (m, name) => "$" + name + "$") };
    if (names.length) entry.placeholders = Object.fromEntries(names.map((name, i) => [name, { content: "$" + (i + 1) }]));
    out[chromeKey(key)] = entry;
  }
  return out;
}

export function localeFiles() {
  const fallback = lang();
  return langCodes().map((code) => [`_locales/${code}/messages.json`, JSON.stringify(chromeMessages({ ...fallback, ...lang(code) }), null, 2) + "\n"]);
}
