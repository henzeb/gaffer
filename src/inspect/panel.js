import { showInTopLayer } from "../shared/dom.js";
import { createMonitor } from "./monitor/index.js";
import { t } from "../shared/i18n.js";
import { issueUrl, siteOf, fitsIssue, reportFileName } from "./issue.js";

const BIG = "position:fixed;inset:auto;top:20px;left:0;right:0;margin:0 auto;width:min(760px,94vw);height:auto;max-height:86vh;display:flex;flex-direction:column;gap:8px;z-index:2147483647;background:#151519;color:#e7e7ea;border:1px solid #333;border-radius:12px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.6);font:13px system-ui,sans-serif;";
const SMALL = "position:fixed;inset:auto;top:12px;right:12px;left:auto;margin:0;width:300px;height:auto;display:flex;flex-direction:column;gap:6px;z-index:2147483647;background:#151519;color:#e7e7ea;border:1px solid #333;border-radius:10px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,.6);font:12px system-ui,sans-serif;";
const TITLE = "Gaffer Inspect";
const BUTTON = "background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;";

// dev: Gaffer (dev) also gets Copy, without an issue (SPEC §12.5).
// frames: telling the frames to monitor and hearing their lines (SPEC §12.2).
export function showPanel(text, onClose, { dev = false, frames = null } = {}) {
  const old = document.getElementById("vu-analyse");
  if (old) {
    if (old.__stop) old.__stop();
    old.remove();
  }
  const w = document.createElement("div");
  w.id = "vu-analyse";
  if (w.showPopover) w.setAttribute("popover", "manual");
  w.style.cssText = BIG;
  const h = document.createElement("div");
  h.textContent = TITLE;
  h.style.cssText = "font-weight:600;";
  const ta = document.createElement("textarea");
  ta.readOnly = true;
  ta.value = text;
  ta.style.cssText = "width:auto;height:60vh;resize:vertical;background:#0d0d10;color:#d6d6db;border:1px solid #2a2a30;border-radius:8px;padding:8px;font:12px/1.45 ui-monospace,monospace;white-space:pre;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;";
  const cnt = document.createElement("div");
  cnt.style.cssText = "color:#9a9aa3;display:none;";

  function btn(label, f) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = BUTTON;
    b.onclick = f;
    row.appendChild(b);
    return b;
  }

  let refreshTimer = null;
  let unlisten = null;
  const monitor = createMonitor((n) => n === w || (n && n.nodeType === 1 && w.contains(n)), refresh);

  function full() {
    const ev = monitor.events;
    return text + (ev.length || monitor.started ? "\n\n== " + (monitor.running ? t("inspect.monitor.heading.running") : t("inspect.monitor.heading")) + "\n" + (ev.length ? ev.join("\n") : t("inspect.monitor.empty")) : "");
  }

  function refresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      ta.value = full();
      cnt.textContent = t("inspect.monitor.count", { n: monitor.events.length });
    }, 150);
  }

  function start() {
    if (monitor.running) return;
    if (onClose) onClose();
    mb.textContent = t("inspect.button.stop");
    mb.style.background = "#dc2626";
    h.textContent = t("inspect.monitor.title");
    ta.style.display = "none";
    warn.style.display = "none";
    cnt.style.display = "";
    w.style.cssText = SMALL;
    cnt.textContent = t("inspect.monitor.count", { n: 0 });
    monitor.start();
    if (frames) {
      unlisten = frames.lines((line) => monitor.add(line));
      frames.tell("start");
    }
    refresh();
  }

  function stop() {
    if (!monitor.stop()) return;
    if (frames) {
      frames.tell("stop");
      if (unlisten) unlisten();
      unlisten = null;
    }
    mb.textContent = t("inspect.button.monitor");
    mb.style.background = "#2563eb";
    h.textContent = TITLE;
    ta.style.display = "";
    warn.style.display = "";
    cnt.style.display = "none";
    w.style.cssText = BIG;
    ta.value = full();
    ta.scrollTop = ta.scrollHeight;
  }

  const mb = btn(t("inspect.button.monitor"), () => (monitor.running ? stop() : start()));
  // Copies the report; done(true) when it is on the clipboard, done(false) when
  // it is selected for copying by hand.
  function copy(done) {
    const val = full();
    const fallback = () => {
      ta.value = val;
      ta.style.display = "";
      ta.focus();
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {}
      done(ok);
    };
    try {
      return navigator.clipboard.writeText(val).then(() => done(true), fallback);
    } catch (e) {
      fallback();
      return Promise.resolve();
    }
  }

  // A report too long for an issue goes into a file to attach (SPEC §12.5).
  function save(val) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(new Blob([val], { type: "text/plain" }));
    a.href = url;
    const name = reportFileName(siteOf(location.hostname));
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return name;
  }

  function openIssue(report) {
    try {
      window.open(issueUrl(siteOf(location.hostname), report), "_blank", "noopener");
    } catch (e) {}
  }

  // Copies first: the new tab takes the focus, and the clipboard needs it. The
  // click still counts as a user action for opening the tab.
  const rb = btn(t("inspect.button.report"), () => {
    const val = full();
    if (!fitsIssue(val)) {
      const name = save(val);
      rb.textContent = t("inspect.button.saved");
      openIssue(t("inspect.issue.reportFile", { name }));
      return;
    }
    copy((ok) => (rb.textContent = ok ? t("inspect.button.reported") : t("inspect.button.copyManually"))).then(() => openIssue(""));
  });
  if (dev) {
    const cb = btn(t("inspect.button.copy"), () => copy((ok) => (cb.textContent = ok ? t("inspect.button.copied") : t("inspect.button.copyManually"))));
  }
  function closeAll() {
    stop();
    if (onClose) onClose();
  }
  btn(t("inspect.button.close"), () => {
    closeAll();
    // Only on Close: a new run replaces the frames' listeners itself.
    if (frames) frames.tell("close");
    w.remove();
  }).style.background = "#3a3a42";

  w.__stop = closeAll;
  const api = {
    setText(t) {
      text = t;
      if (!monitor.running) ta.value = full();
    },
  };
  w.appendChild(h);
  w.appendChild(cnt);
  w.appendChild(ta);
  w.appendChild(row);
  const warn = document.createElement("div");
  warn.textContent = t("inspect.issue.warning");
  warn.style.cssText = "color:#9a9aa3;font-size:12px;text-align:right;";
  w.appendChild(warn);
  document.body.appendChild(w);
  showInTopLayer(w);
  return api;
}
