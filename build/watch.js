import fs from "node:fs";
import path from "node:path";

// The state of every file in a folder. Not fs.watch: on Linux a recursive watch
// misses later writes to a file that was replaced, and it needs a free inotify
// instance.
function snapshot(dir) {
  const out = [];
  const walk = (d) => {
    let list = [];
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        try {
          const st = fs.statSync(p);
          out.push(p + "|" + st.mtimeMs + "|" + st.size + "|" + st.ino);
        } catch {}
      }
    }
  };
  walk(dir);
  return out.sort().join("\n");
}

// Calls back once a change has settled: two looks in a row that are the same.
export function watchDir(dir, onChange, interval = 250) {
  let reported = snapshot(dir);
  let last = reported;
  const timer = setInterval(() => {
    const now = snapshot(dir);
    if (now !== reported && now === last) {
      reported = now;
      onChange();
    }
    last = now;
  }, interval);
  return { close: () => clearInterval(timer) };
}
