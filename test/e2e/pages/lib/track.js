(function () {
  const ET = EventTarget.prototype;
  const add = ET.addEventListener;
  const remove = ET.removeEventListener;
  const setI = window.setInterval;
  const clearI = window.clearInterval;
  const active = new Map();
  const intervals = new Set();
  let marked = false;

  const watched = (t) => t === window || t === document || t instanceof HTMLMediaElement;
  const capture = (o) => (typeof o === "boolean" ? o : !!(o && o.capture));
  const keys = new WeakMap();
  let n = 0;
  const keyOf = (t, type, fn, c) => {
    if (!keys.has(fn)) keys.set(fn, ++n);
    if (!keys.has(t)) keys.set(t, ++n);
    return keys.get(t) + "|" + type + "|" + keys.get(fn) + "|" + c;
  };

  ET.addEventListener = function (type, fn, opts) {
    if (marked && fn && watched(this) && !(opts && opts.once)) active.set(keyOf(this, type, fn, capture(opts)), type);
    return add.apply(this, arguments);
  };
  ET.removeEventListener = function (type, fn, opts) {
    if (fn && watched(this)) active.delete(keyOf(this, type, fn, capture(opts)));
    return remove.apply(this, arguments);
  };
  window.setInterval = function () {
    const id = setI.apply(this, arguments);
    if (marked) intervals.add(id);
    return id;
  };
  window.clearInterval = function (id) {
    intervals.delete(id);
    return clearI.apply(this, arguments);
  };

  window.__orig = { fetch: window.fetch, open: XMLHttpRequest.prototype.open, send: XMLHttpRequest.prototype.send };

  window.__track = {
    mark() { active.clear(); intervals.clear(); marked = true; },
    leaks() { return { listeners: [...active.values()], intervals: intervals.size }; },
  };

  window.__snapshot = function () {
    const vids = [...document.querySelectorAll("video")].map((v) => ({
      controls: v.controls, muted: v.muted, rate: v.playbackRate, style: v.getAttribute("style"),
      transform: getComputedStyle(v).transform, popover: v.hasAttribute("popover"),
    }));
    const clone = document.documentElement.cloneNode(true);
    for (const el of [clone, ...clone.querySelectorAll("*")]) {
      const attrs = [...el.attributes].map((a) => [a.name, a.value]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
      for (const [name] of attrs) el.removeAttribute(name);
      for (const [name, value] of attrs) el.setAttribute(name, value);
    }
    return { html: clone.outerHTML, vids, scroll: [scrollX, scrollY] };
  };
})();
