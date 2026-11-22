// The errors of the page from the start (SPEC §4.5), so Inspect can report a
// bug that happened while the page loaded. Only listeners: the console stays
// as it is. Addresses lose their query (SPEC §12.1).
import { shortIn } from "../shared/address.js";

const KEEP = 20;
const MAX = 300;
const OWN = "#vu-analyse,#video-ultimate-bar,#video-ultimate-top";

function text(x) {
  try {
    if (x instanceof Error) return x.name + ": " + x.message;
    if (x && typeof x === "object") return JSON.stringify(x);
    return String(x);
  } catch (e) {
    return Object.prototype.toString.call(x);
  }
}

function cut(s) {
  s = shortIn(String(s).replace(/\s+/g, " ").trim());
  return s.length > MAX ? s.slice(0, MAX) + "…" : s;
}

function tag(el) {
  return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "");
}

export function installErrors() {
  if (window.__gafferErrors) return;
  const list = [];
  function add(kind, message, where) {
    list.push({ at: performance.now(), kind, text: cut(message), where: where ? shortIn(where) : "" });
    if (list.length > KEEP) list.shift();
  }
  function onError(e) {
    const el = e.target;
    if (el && el !== window && el.nodeType === 1) {
      if (el.closest && el.closest(OWN)) return;
      add("load", tag(el), el.currentSrc || el.src || el.href || "");
      return;
    }
    add("error", e.error ? text(e.error) : e.message, e.filename ? e.filename + (e.lineno ? ":" + e.lineno : "") : "");
  }
  function onRejection(e) {
    add("rejection", text(e.reason));
  }
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  const api = {
    since: performance.now(),
    list: () => list.slice(),
    close() {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      if (window.__gafferErrors === api) window.__gafferErrors = null;
    },
  };
  window.__gafferErrors = api;
}
