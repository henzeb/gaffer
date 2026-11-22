import { spawn } from "node:child_process";
import { watchDir } from "./watch.js";

export function supervise({ script, args = [], watch, env = {}, interval, log = console.log }) {
  let child = null;
  let stopping = false;
  let restarting = false;
  let onStopped = null;

  function start() {
    child = spawn(process.execPath, [script, ...args], { stdio: "inherit", env: { ...process.env, ...env } });
    child.on("exit", (code) => {
      child = null;
      if (stopping) return onStopped && onStopped();
      if (restarting) {
        restarting = false;
        start();
        return;
      }
      log("dev server stopped (code " + code + "); waiting for a change in build/");
    });
  }

  function restart() {
    log("build/ changed, restarting the dev server");
    if (!child) return start();
    restarting = true;
    child.kill("SIGINT");
  }

  const watchers = watch.map((dir) => watchDir(dir, restart, interval));

  start();

  return {
    get pid() {
      return child ? child.pid : null;
    },
    stop() {
      stopping = true;
      for (const w of watchers) w.close();
      return new Promise((ok) => {
        if (!child) return ok();
        onStopped = ok;
        child.kill("SIGINT");
      });
    },
  };
}
