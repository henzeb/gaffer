import { readBoxes, isWebm } from "../media/mp4/boxes.js";
import { installErrors } from "./errors.js";

const MAX_BUFFERS = 32;
const MAX_URLS = 16;

function view(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data && data.buffer instanceof ArrayBuffer) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export function initOf(u) {
  if (isWebm(u)) return u;
  const top = readBoxes(u).boxes;
  const moov = top.find((b) => b.type === "moov");
  if (!moov) return null;
  const ftyp = top.find((b) => b.type === "ftyp" && b.start < moov.start);
  return u.subarray(ftyp ? ftyp.start : moov.start, moov.end);
}

function install() {
  if (window.__gafferCapture) return;
  const SB = window.SourceBuffer;
  if (!SB || !SB.prototype || typeof SB.prototype.appendBuffer !== "function") return;
  const MSes = [window.MediaSource, window.ManagedMediaSource].filter((m) => m && m.prototype && typeof m.prototype.addSourceBuffer === "function");
  const buffers = [];
  const urls = [];
  const listeners = new Set();
  const undo = [];

  function entry(sb) {
    for (let i = 0; i < buffers.length; i++) if (buffers[i].sb === sb) return buffers[i];
    const e = { sb, mime: "", ms: null, init: null, at: 0, late: true };
    buffers.push(e);
    if (buffers.length > MAX_BUFFERS) {
      // A buffer still in use (perhaps being recorded) stays; an old one goes.
      const i = buffers.findIndex((x) => x !== e && !inUse(x));
      buffers.splice(i >= 0 ? i : 0, 1);
    }
    return e;
  }

  function inUse(e) {
    if (!e.ms) return Date.now() - e.at < 30000;
    try {
      if (e.ms.readyState === "closed") return false;
    } catch (x) {}
    return attached(e);
  }

  const P = SB.prototype;
  const append = P.appendBuffer;
  const ownAppend = function (data) {
    try {
      const e = entry(this);
      e.at = Date.now();
      const u = view(data);
      if (u) {
        const init = initOf(u);
        if (init) e.init = init.slice();
        if (listeners.size) {
          const copy = u.slice();
          listeners.forEach((fn) => {
            try {
              fn(e, copy);
            } catch (x) {}
          });
        }
      }
    } catch (x) {}
    return append.apply(this, arguments);
  };
  P.appendBuffer = ownAppend;
  undo.push(() => {
    if (P.appendBuffer === ownAppend) P.appendBuffer = append;
  });

  MSes.forEach((M) => {
    const MP = M.prototype;
    const add = MP.addSourceBuffer;
    const ownAdd = function (mime) {
      const sb = add.apply(this, arguments);
      try {
        const e = entry(sb);
        e.mime = String(mime || "");
        e.ms = this;
        e.late = false;
      } catch (x) {}
      return sb;
    };
    MP.addSourceBuffer = ownAdd;
    undo.push(() => {
      if (MP.addSourceBuffer === ownAdd) MP.addSourceBuffer = add;
    });
  });

  // Shadow roots, also closed ones, so Direct can find a video inside them
  // (SPEC §11.1). Only looks: attachShadow itself stays the same.
  const hosts = new WeakMap();
  let roots = [];
  const EP = window.Element && Element.prototype;
  const attach = EP && EP.attachShadow;
  if (typeof attach === "function") {
    const ownAttach = function () {
      const r = attach.apply(this, arguments);
      try {
        hosts.set(this, r);
        roots.push(new WeakRef(r));
        if (roots.length > 200) roots = roots.filter((x) => x.deref());
      } catch (x) {}
      return r;
    };
    EP.attachShadow = ownAttach;
    undo.push(() => {
      if (EP.attachShadow === ownAttach) EP.attachShadow = attach;
    });
  }

  const create = URL.createObjectURL;
  if (typeof create === "function") {
    const ownCreate = function (o) {
      const url = create.apply(this, arguments);
      try {
        if (MSes.some((M) => o instanceof M)) {
          urls.push({ url, ms: o });
          if (urls.length > MAX_URLS) urls.shift();
        }
      } catch (x) {}
      return url;
    };
    URL.createObjectURL = ownCreate;
    undo.push(() => {
      if (URL.createObjectURL === ownCreate) URL.createObjectURL = create;
    });
  }

  function attached(e) {
    try {
      const list = e.ms.sourceBuffers;
      for (let i = 0; i < list.length; i++) if (list[i] === e.sb) return true;
    } catch (x) {}
    return false;
  }

  function forVideo(video, ms) {
    if (ms && ms.sourceBuffers) {
      const own = [];
      for (let i = 0; i < ms.sourceBuffers.length; i++) {
        const e = entry(ms.sourceBuffers[i]);
        if (!e.ms) e.ms = ms;
        own.push(e);
      }
      if (own.length) return own;
    }
    const src = (video && (video.currentSrc || video.src)) || "";
    const hit = urls.find((u) => u.url === src);
    if (hit) return buffers.filter((e) => e.ms === hit.ms && attached(e));
    const late = buffers.filter((e) => e.late);
    const recent = late.filter((e) => Date.now() - e.at < 30000);
    return recent.length ? recent : late;
  }

  window.__gafferCapture = {
    version: 1,
    buffers: forVideo,
    shadowOf: (el) => hosts.get(el) || null,
    roots: () => roots.map((x) => x.deref()).filter(Boolean),
    listen(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      listeners.clear();
      while (undo.length) undo.pop()();
      if (window.__gafferCapture === api) window.__gafferCapture = null;
    },
  };
  const api = window.__gafferCapture;
}

try {
  installErrors();
} catch (e) {}

try {
  install();
} catch (e) {}
