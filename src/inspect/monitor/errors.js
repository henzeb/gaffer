// Errors and warnings while monitoring (SPEC §12.2): of the site and of Direct,
// also the ones nobody thought of. console.error and console.warn are wrapped
// and pass every call on unchanged.
import { short, shortIn } from "../report/format.js";
import { describe } from "./describe.js";
import { t } from "../../shared/i18n.js";

const MAX = 300;

// Addresses inside a message lose their query too (SPEC §12.1).
function cut(s) {
  s = shortIn(String(s).replace(/\s+/g, " ").trim());
  return s.length > MAX ? s.slice(0, MAX) + "…" : s;
}

// A console argument as text: an error by its message, an element by its tag.
export function argText(x) {
  try {
    if (x instanceof Error) return x.name + ": " + x.message;
    if (x && x.nodeType === 1) return describe(x);
    if (x && typeof x === "object") return JSON.stringify(x);
    return String(x);
  } catch (e) {
    return Object.prototype.toString.call(x);
  }
}

function place(file, line) {
  return file ? short(file) + (line ? ":" + line : "") : "";
}

export function createErrorWatch(m) {
  function onError(e) {
    const el = e.target;
    // A picture, script or media file that does not load: no message, only the element.
    if (el && el !== window && el.nodeType === 1) {
      if (m.ours(el)) return;
      m.log(t("inspect.monitor.loadFailed", { element: describe(el), url: short(el.currentSrc || el.src || el.href || "") }));
      return;
    }
    const where = place(e.filename, e.lineno);
    const text = cut(e.error ? argText(e.error) : e.message);
    m.log(where ? t("inspect.monitor.error.at", { text, where }) : t("inspect.monitor.error", { text }));
  }

  function onRejection(e) {
    m.log(t("inspect.monitor.rejection", { text: cut(argText(e.reason)) }));
  }

  function wrap(kind, key) {
    const orig = console[kind];
    const own = function () {
      try {
        m.log(t(key, { text: cut([].map.call(arguments, argText).join(" ")) }));
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    console[kind] = own;
    return () => {
      if (console[kind] === own) console[kind] = orig;
    };
  }

  return function install() {
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    const undo = [wrap("error", "inspect.monitor.consoleError"), wrap("warn", "inspect.monitor.consoleWarn")];
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
      undo.forEach((f) => f());
    };
  };
}
