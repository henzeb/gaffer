import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { bundle, buildStamp, MODULE_NAMES } from "./build.js";
import { buildExtension, shellDir, shellStamp } from "./extension.js";
import { startServer } from "./devserver.js";
import { LANG_DIR } from "./lang.js";
import { supervise } from "./supervise.js";
import { watchDir } from "./watch.js";

const root = path.join(import.meta.dirname, "..");
export const DEV_OUT = path.join(root, "dist", "extension-dev");
export const DEV_PORT = 8423;

export async function startDev({ out = DEV_OUT, port = DEV_PORT, watch = true, grantAllSites = false, log = console.log } = {}) {
  const state = { modules: null, shell: null };
  const hello = () => ({ modules: state.modules, shell: state.shell });
  let server = await startServer({ port, hello });
  const modulesDir = path.join(out, "modules");

  async function buildModules(stamp = buildStamp(new Date(), { seconds: true })) {
    fs.mkdirSync(modulesDir, { recursive: true });
    const hash = crypto.createHash("sha256");
    for (const name of MODULE_NAMES) {
      const file = path.join(modulesDir, name + ".js");
      await bundle(name, file, stamp, { sourcemap: false, logLevel: "error" });
      hash.update(fs.readFileSync(file));
    }
    const id = hash.digest("hex").slice(0, 16);
    fs.writeFileSync(path.join(modulesDir, "build.json"), JSON.stringify({ id, built: stamp }) + "\n");
    state.modules = id;
    return id;
  }

  function buildShell(stamp) {
    const id = stamp || shellStamp();
    buildExtension(out, { grantAllSites, dev: { port: server.port, stamp: id } });
    state.shell = id;
    return id;
  }

  let chain = Promise.resolve();
  const serial = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  const api = {
    port: server.port,
    out,
    get server() {
      return server;
    },
    async reopen() {
      server = await startServer({ port: api.port, hello });
    },
    modules: (stamp) =>
      serial(async () => {
        const id = await buildModules(stamp);
        server.broadcast({ type: "modules", modules: id });
        return id;
      }),
    shell: (stamp) =>
      serial(async () => {
        const id = buildShell(stamp);
        server.broadcast({ type: "shell", shell: id });
        return id;
      }),
    watchers: [],
    async close() {
      for (const w of api.watchers) w.close();
      await chain;
      await server.close();
    },
  };

  try {
    buildShell();
    await buildModules();
  } catch (e) {
    await server.close();
    throw e;
  }

  if (watch) {
    const follow = (dir, name, run) => {
      const w = watchDir(dir, () =>
        run().then(
          () => log(buildStamp(new Date(), { seconds: true }) + "  " + name + " changed"),
          (e) => log(name + ": build failed: " + e.message.split("\n")[0]),
        ),
      );
      api.watchers.push(w);
    };
    follow(path.join(root, "src"), "modules", () => api.modules());
    follow(shellDir, "shell", () => api.shell());
    follow(LANG_DIR, "language files", () => api.modules().then(() => api.shell()));
  }
  return api;
}

if (process.argv[1] === import.meta.filename && !process.env.GAFFER_DEV_CHILD) {
  const sup = supervise({ script: import.meta.filename, watch: [import.meta.dirname], env: { GAFFER_DEV_CHILD: "1" } });
  const stop = (signal) => sup.stop().then(() => process.kill(process.pid, signal));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} else if (process.argv[1] === import.meta.filename) {
  const port = Number(process.env.GAFFER_DEV_PORT || DEV_PORT);
  try {
    const dev = await startDev({ port, out: process.env.GAFFER_DEV_OUT || DEV_OUT });
    console.log("Gaffer (dev) in " + path.relative(root, dev.out) + "/ (load it once as an unpacked extension)");
    console.log("signals on ws://127.0.0.1:" + dev.port + ", following src/, extension/ and lang/ (build/ restarts the server). Stop: Ctrl+C");
    const stop = (signal) => dev.close().then(() => process.kill(process.pid, signal));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (e) {
    if (e.code === "EADDRINUSE") console.error("port " + port + " is in use. Pick another one with GAFFER_DEV_PORT.");
    else console.error(e.message);
    process.exit(1);
  }
}
