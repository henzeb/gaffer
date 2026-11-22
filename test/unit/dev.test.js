import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acceptKey, encodeFrame, startServer } from "../../build/devserver.js";
import { buildExtension, shellStamp } from "../../build/extension.js";
import { supervise } from "../../build/supervise.js";
import { watchDir } from "../../build/watch.js";

const root = path.join(import.meta.dirname, "..", "..");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gaffer-unit-"));

test("devserver: handshake key per RFC 6455", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
});

test("devserver: frames with short, medium and long lengths", () => {
  assert.deepEqual([...encodeFrame("hi")], [0x81, 2, 104, 105]);
  const mid = encodeFrame("x".repeat(300));
  assert.deepEqual([mid[0], mid[1], mid.readUInt16BE(2), mid.length], [0x81, 126, 300, 304]);
  const long = encodeFrame("x".repeat(70000));
  assert.deepEqual([long[0], long[1], Number(long.readBigUInt64BE(2)), long.length], [0x81, 127, 70000, 70010]);
});

test("devserver: hello on connect, then signals and pings", async () => {
  const server = await startServer({ port: 0, hello: () => ({ modules: "m1", shell: "s1" }), pingInterval: 50 });
  const ws = new WebSocket("ws://127.0.0.1:" + server.port);
  const messages = [];
  ws.onmessage = (e) => messages.push(JSON.parse(e.data));
  await new Promise((ok) => (ws.onopen = ok));
  const until = async (fn) => {
    for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fn());
  };
  await until(() => messages.length >= 1);
  assert.deepEqual(messages[0], { type: "hello", modules: "m1", shell: "s1" });
  server.broadcast({ type: "modules", modules: "m2" });
  await until(() => messages.some((m) => m.type === "modules"));
  assert.deepEqual(messages.find((m) => m.type === "modules"), { type: "modules", modules: "m2" });
  await until(() => messages.some((m) => m.type === "ping"));
  ws.close();
  await until(() => server.clients.size === 0);
  await server.close();
});

test("dev shell: own name, alarms, dev source, locales, and modules are kept", () => {
  const out = path.join(tmp(), "dev");
  fs.mkdirSync(path.join(out, "modules"), { recursive: true });
  fs.writeFileSync(path.join(out, "modules", "direct.js"), "keep");
  fs.writeFileSync(path.join(out, "stale.js"), "gone");
  buildExtension(out, { dev: { port: 1234, stamp: "abc" } });
  const m = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
  assert.equal(m.name, "__MSG_manifest_nameDev__");
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, "_locales/en/messages.json"), "utf8")).manifest_nameDev.message, "Gaffer (dev)");
  assert.deepEqual(m.permissions, ["storage", "activeTab", "userScripts", "alarms"]);
  assert.ok(m.optional_host_permissions);
  assert.match(fs.readFileSync(path.join(out, "source.js"), "utf8"), /WebSocket/);
  assert.match(fs.readFileSync(path.join(out, "inject.js"), "utf8"), /chrome\.userScripts/);
  assert.match(fs.readFileSync(path.join(out, "bridge.js"), "utf8"), /onAction/);
  assert.equal(fs.readFileSync(path.join(out, "prelude.js"), "utf8"), fs.readFileSync(path.join(root, "extension", "dev", "prelude.js"), "utf8"));
  assert.equal(fs.readFileSync(path.join(out, "dev-config.js"), "utf8"), 'export const DEV_PORT = 1234;\nexport const SHELL_STAMP = "abc";\n');
  assert.equal(fs.readFileSync(path.join(out, "modules", "direct.js"), "utf8"), "keep");
  assert.equal(fs.existsSync(path.join(out, "stale.js")), false);
  assert.deepEqual(fs.readdirSync(out).filter((f) => f.includes(".tmp-")), []);
  buildExtension(out, { dev: { port: 1234, stamp: "def" } });
  assert.match(fs.readFileSync(path.join(out, "dev-config.js"), "utf8"), /"def"/);
  assert.equal(fs.readFileSync(path.join(out, "modules", "direct.js"), "utf8"), "keep");
});

test("regular shell: the modules in the package, no dev code, no user scripts", () => {
  const out = buildExtension(path.join(tmp(), "prod"), { modules: (name) => "// " + name + "\n", version: "2.3.4" });
  const m = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
  assert.equal(m.name, "__MSG_manifest_name__");
  assert.equal(m.default_locale, "en");
  const messages = JSON.parse(fs.readFileSync(path.join(out, "_locales/en/messages.json"), "utf8"));
  assert.equal(messages.manifest_name.message, "Gaffer");
  assert.ok(Object.keys(messages).every((k) => /^(manifest|popup)_/.test(k)));
  assert.equal(m.version, "2.3.4");
  assert.deepEqual(m.permissions, ["scripting", "storage", "activeTab"]);
  for (const name of ["capture", "direct", "inspect"]) assert.equal(fs.readFileSync(path.join(out, "modules", name + ".js"), "utf8"), "// " + name + "\n");
  for (const f of ["source.js", "prelude.js", "dev-config.js"]) assert.equal(fs.existsSync(path.join(out, f)), false, f);
  // No code from elsewhere (Chrome Web Store, §3): nothing in the shell fetches or runs text as code.
  for (const f of fs.readdirSync(out).filter((x) => x.endsWith(".js"))) assert.doesNotMatch(fs.readFileSync(path.join(out, f), "utf8"), /userScripts|WebSocket|fetch\(|eval\(|new Function|importScripts/, f);
});

test("dev shell: the stamp follows the shell source", () => {
  assert.match(shellStamp(), /^[0-9a-f]{16}$/);
  assert.equal(shellStamp(), shellStamp());
});

test("dev watcher: every kind of change is seen, also a write to a file that was replaced", async () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, "sub"));
  const file = path.join(dir, "sub", "a.js");
  fs.writeFileSync(file, "1");
  let n = 0;
  const w = watchDir(dir, () => n++, 20);
  const step = async (fn) => {
    const before = n;
    fn();
    for (let i = 0; i < 100 && n === before; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(n, before + 1, String(fn));
  };
  try {
    await step(() => fs.writeFileSync(file, "22"));
    await step(() => { fs.writeFileSync(path.join(dir, "t"), "333"); fs.renameSync(path.join(dir, "t"), file); });
    await step(() => fs.writeFileSync(file, "4444"));
    await step(() => fs.writeFileSync(path.join(dir, "new.js"), "x"));
    await step(() => fs.rmSync(path.join(dir, "new.js")));
    const before = n;
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(n, before);
  } finally {
    w.close();
  }
});

test("dev supervisor: a change in the watched folder restarts the server process, stop ends it", async () => {
  const dir = tmp();
  const watched = path.join(dir, "build");
  fs.mkdirSync(watched);
  const log = path.join(dir, "starts.log");
  const script = path.join(dir, "server.js");
  fs.writeFileSync(script, `require("fs").appendFileSync(${JSON.stringify(log)}, process.pid + "\\n"); process.on("SIGINT", () => process.exit(0)); setInterval(() => {}, 1000);`);
  const starts = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : []);
  const until = async (fn) => {
    for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(fn());
  };
  const sup = supervise({ script, watch: [watched], interval: 25, log: () => {} });
  try {
    await until(() => starts().length === 1);
    fs.writeFileSync(path.join(watched, "x.js"), "1");
    await until(() => starts().length === 2);
    assert.notEqual(starts()[0], starts()[1]);
  } catch (e) {
    await sup.stop();
    throw e;
  }
  const pid = sup.pid;
  await sup.stop();
  assert.equal(sup.pid, null);
  assert.throws(() => process.kill(pid, 0));
});
