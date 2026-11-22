import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { siteOf, pageHost, rulesFrom, ruleFor, isOn, anyOn, switchSite, rulesBefore, fillPrelude, contentScripts, covers } from "../../extension/sites.js";
import { releaseVersion } from "../../build/release.js";
import { zip } from "../../build/extension.js";

const root = path.join(import.meta.dirname, "..", "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-unit-"));

test("site: host name without www, only http(s) and not the Web Store", () => {
  assert.equal(siteOf("WWW.Foo.com"), "foo.com");
  assert.equal(pageHost("https://www.foo.com/a?b"), "foo.com");
  assert.equal(pageHost("http://player.foo.com:8080/"), "player.foo.com");
  assert.equal(pageHost("chrome://extensions"), null);
  assert.equal(pageHost("https://chromewebstore.google.com/detail/x"), null);
  assert.equal(pageHost("file:///tmp/a.html"), null);
  assert.equal(pageHost("no url"), null);
});

const rules = (sites, def = false) => ({ def, sites });

test("site: the closest rule counts, otherwise the default", () => {
  const r = rules({ "foo.com": true, "player.foo.com": false, "bar.com": true });
  assert.deepEqual(ruleFor("foo.com", r), { on: true, via: "foo.com" });
  assert.deepEqual(ruleFor("cdn.foo.com", r), { on: true, via: "foo.com" });
  assert.deepEqual(ruleFor("a.player.foo.com", r), { on: false, via: "player.foo.com" });
  assert.deepEqual(ruleFor("notfoo.com", r), { on: false, via: null });
  assert.deepEqual(ruleFor("foo.com.evil.net", r), { on: false, via: null });
  assert.deepEqual(ruleFor("notfoo.com", rules({ "foo.com": false }, true)), { on: true, via: null });
  assert.equal(isOn(null, rules({}, true)), false);
});

test("site: rules from storage, only site: keys with true or false", () => {
  assert.deepEqual(rulesFrom({ "site:b.com": true, "site:a.com": false, "site:c.com": "x", other: true }), { def: false, sites: { "b.com": true, "a.com": false } });
  assert.equal(rulesFrom({ default: true }).def, true);
  assert.equal(anyOn(rules({ "a.com": false })), false);
  assert.equal(anyOn(rules({ "a.com": true })), true);
  assert.equal(anyOn(rules({}, true)), true);
});

test("site: toggling first removes the closest opposite rule and otherwise adds an exception", () => {
  assert.deepEqual(switchSite("www.foo.com", true, rules({})), { "site:foo.com": true });
  assert.deepEqual(switchSite("player.foo.com", false, rules({ "foo.com": true })), { "site:foo.com": null });
  assert.deepEqual(switchSite("foo.com", false, rules({}, true)), { "site:foo.com": false });
  assert.deepEqual(switchSite("foo.com", true, rules({ "foo.com": false }, true)), { "site:foo.com": null });
  assert.deepEqual(switchSite("player.foo.com", true, rules({ "foo.com": false, "x.com": true }, false)), { "site:foo.com": null, "site:player.foo.com": true });
  assert.deepEqual(switchSite("foo.com", true, rules({ "foo.com": true })), {});
});

test("site: the rules from before a change", () => {
  const after = rules({ "a.com": true }, true);
  assert.deepEqual(rulesBefore(after, { default: { oldValue: false, newValue: true }, "site:a.com": { newValue: true }, "site:b.com": { oldValue: false } }), rules({ "b.com": false }, false));
});

function runPrelude({ hostname, top = true, ancestors = [] }, sites, def = false) {
  const prelude = fs.readFileSync(path.join(root, "extension", "dev", "prelude.js"), "utf8");
  const window = { ran: false };
  window.top = top ? window : {};
  const context = vm.createContext({ window, location: { hostname, ancestorOrigins: ancestors }, URL });
  vm.runInContext(fillPrelude(prelude, { def, sites: Array.isArray(sites) ? Object.fromEntries(sites.map((x) => [x, true])) : sites }, "window.ran = window.__gafferAuto === true; window.code = '$&$1';"), context);
  return window;
}

test("dev prelude: starts only on a site that is on, also in an iframe from another domain", () => {
  assert.equal(runPrelude({ hostname: "www.foo.com" }, ["foo.com"]).ran, true);
  assert.equal(runPrelude({ hostname: "player.foo.com" }, ["foo.com"]).ran, true);
  assert.equal(runPrelude({ hostname: "bar.com" }, ["foo.com"]).ran, false);
  assert.equal(runPrelude({ hostname: "embed.cdn.net", top: false, ancestors: ["https://www.foo.com"] }, ["foo.com"]).ran, true);
  assert.equal(runPrelude({ hostname: "foo.com", top: false, ancestors: ["https://bar.com"] }, ["foo.com"]).ran, false);
  assert.equal(runPrelude({ hostname: "x.net", top: false, ancestors: ["null"] }, ["foo.com"]).ran, false);
  assert.equal(runPrelude({ hostname: "foo.com" }, ["foo.com"]).code, "$&$1");
  assert.equal(runPrelude({ hostname: "bar.com" }, {}, true).ran, true);
  assert.equal(runPrelude({ hostname: "cdn.bar.com" }, { "bar.com": false }, true).ran, false);
  assert.equal(runPrelude({ hostname: "tv.bar.com" }, { "bar.com": false, "tv.bar.com": true }, true).ran, true);
});

// A match pattern as Chrome reads it, for http(s) and host names without port.
function matches(pattern, host) {
  const m = /^\*:\/\/(\*\.)?([^/]*)\/\*$/.exec(pattern);
  if (!m) throw new Error("unexpected pattern " + pattern);
  if (m[2] === "*") return true;
  return host === m[2] || (!!m[1] && covers(m[2], host));
}

function started(host, rules) {
  const hit = (list) => (list || []).some((p) => matches(p, host));
  return contentScripts(rules).filter((part) => hit(part.matches) && !hit(part.excludeMatches)).map((part) => part.key);
}

test("content scripts: a page matches exactly the part of its closest rule", () => {
  const r = rules({ "foo.com": true, "player.foo.com": false, "x.player.foo.com": true, "bar.com": false });
  const hosts = ["foo.com", "cdn.foo.com", "player.foo.com", "a.player.foo.com", "x.player.foo.com", "y.x.player.foo.com", "bar.com", "other.net", "notfoo.com"];
  for (const def of [false, true]) {
    const all = { ...r, def };
    for (const host of hosts) {
      const rule = ruleFor(host, all);
      assert.deepEqual(started(host, all), rule.on ? [rule.via ?? "*"] : [], host + (def ? " (default on)" : ""));
    }
  }
  assert.deepEqual(contentScripts(rules({ "a.com": false })), []);
  assert.deepEqual(contentScripts(rules({}, true)), [{ key: "*", matches: ["*://*/*"], excludeMatches: [] }]);
  assert.deepEqual(contentScripts(rules({ "127.0.0.1": true })), [{ key: "127.0.0.1", matches: ["*://127.0.0.1/*", "*://*.127.0.0.1/*"], excludeMatches: [] }]);
  assert.deepEqual(contentScripts(rules({ "[::1]": true }))[0].matches, ["*://[::1]/*"]);
});

test("release: the version comes from the tag", () => {
  assert.equal(releaseVersion("v1.2.3"), "1.2.3");
  assert.equal(releaseVersion("1.2.3"), "1.2.3");
  assert.throws(() => releaseVersion("1.2"), /usage/);
  assert.throws(() => releaseVersion(""), /usage/);
});

test("zip: valid archive with the files in one folder", { skip: !hasUnzip() && "unzip is missing" }, () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "icons"));
  fs.writeFileSync(path.join(dir, "manifest.json"), "{}");
  fs.writeFileSync(path.join(dir, "icons", "a.png"), crypto.randomBytes(500));
  const out = path.join(tmp(), "x.zip");
  zip(dir, out, "gaffer");
  assert.match(execFileSync("unzip", ["-t", out], { encoding: "utf8" }), /No errors detected/);
  assert.match(execFileSync("unzip", ["-l", out], { encoding: "utf8" }), /gaffer\/icons\/a\.png/);
  const flat = path.join(tmp(), "y.zip");
  zip(dir, flat);
  assert.match(execFileSync("unzip", ["-l", flat], { encoding: "utf8" }), /\s manifest\.json\n/);
});

function hasUnzip() {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("site: access lost only when Gaffer is on somewhere and the permission is gone", async () => {
  const { accessLost, rulesFrom } = await import("../../extension/sites.js");
  const on = rulesFrom({ "site:foo.com": true });
  const off = rulesFrom({ "site:foo.com": false });
  assert.equal(accessLost(on, false), true);
  assert.equal(accessLost(on, true), false);
  assert.equal(accessLost(off, false), false);
  assert.equal(accessLost(rulesFrom({ default: true }), false), true);
});
