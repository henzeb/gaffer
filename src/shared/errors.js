let quiet = false;

export function setQuiet(on) {
  quiet = on;
}

export function banner(text) {
  if (quiet) {
    console.error(text);
    return;
  }
  const m = document.createElement("div");
  m.textContent = text;
  m.style.cssText = "position:fixed;inset:auto;top:20px;left:0;right:0;margin:0 auto;width:fit-content;z-index:2147483647;background:#dc2626;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);border:0;";
  if (m.showPopover) m.setAttribute("popover", "manual");
  document.body.appendChild(m);
  if (m.showPopover) {
    try {
      m.showPopover();
    } catch (e) {}
  }
  setTimeout(() => m.remove(), 5000);
}

export function errorText(e) {
  return e && e.message ? e.message : e;
}

// safe.errors keeps the last error per part and how often it happened, for
// Inspect (SPEC §11.8). onError hears every error.
export function createSafe(consolePrefix, bannerText, onError) {
  const shown = {};
  const errors = {};
  function safe(fn, name) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        console.error(consolePrefix + " " + name, e);
        const text = String(errorText(e));
        errors[name] = { message: text, count: errors[name] ? errors[name].count + 1 : 1 };
        if (onError) onError(name, text);
        if (!shown[name]) {
          shown[name] = 1;
          banner(bannerText(name, text));
        }
      }
    };
  }
  safe.errors = () => Object.keys(errors).map((name) => Object.assign({ name }, errors[name]));
  return safe;
}
