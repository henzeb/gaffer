import { makeCore } from "gaffer:direct-core";
import { banner, createSafe, errorText, setQuiet } from "../shared/errors.js";
import { candidate } from "./video/pick.js";
import { hookHls, unhookHls, seenHls } from "./hls-hook.js";
import { t } from "../shared/i18n.js";
import { allVideos, inDocument } from "../shared/deep.js";

const LEFTOVERS = ["video-ultimate-ui", "video-ultimate-top", "video-ultimate-bar", "vu-osd", "vu-loader", "v-rotator-style", "vu-dyn", "vu-rec", "vu-notice"];
const OWN_ROOT_CLASSES = ["vu-full"];

function rememberRootClass() {
  const root = document.documentElement;
  const hadAttr = root.hasAttribute("class");
  const had = OWN_ROOT_CLASSES.filter((c) => root.classList.contains(c));
  return () => {
    OWN_ROOT_CLASSES.forEach((c) => {
      if (!had.includes(c)) root.classList.remove(c);
    });
    if (!hadAttr && root.getAttribute("class") === "") root.removeAttribute("class");
  };
}

function start(quiet) {
  if (typeof window.__vuClose === "function") {
    try {
      window.__vuClose({ keepCapture: true });
    } catch (e) {}
  }
  LEFTOVERS.forEach((id) => document.querySelectorAll("#" + id).forEach((e) => e.remove()));
  const restoreRoot = rememberRootClass();
  const instances = new Map();
  let nextId = 1;
  let full = null;
  let closed = false;
  let timer = null;
  let sound = null;
  // The sound the user chose last on this page (SPEC §11.4).
  let choice = null;

  function drop(v) {
    const inst = instances.get(v);
    instances.delete(v);
    if (full === inst.id) full = null;
    try {
      inst.close();
      refreshAll();
    } catch (e) {
      console.error(e);
    }
  }

  function closeAll(opts) {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    [...instances.keys()].reverse().forEach(drop);
    if (sound) sound.close().catch(() => {});
    sound = null;
    unhookHls();
    restoreRoot();
    window.__vuClose = null;
    window.__vuInfo = null;
    if (!(opts && opts.keepCapture)) {
      try {
        if (window.__gafferCapture) window.__gafferCapture.close();
      } catch (e) {}
      try {
        if (window.__gafferErrors) window.__gafferErrors.close();
      } catch (e) {}
    }
  }

  // One for all videos, only for measuring (§11.15). Chrome does not let it run
  // before the user has done something on the page.
  function audio() {
    const a = navigator.userActivation;
    if (!sound && (!a || a.hasBeenActive)) sound = new AudioContext();
    if (!sound) return null;
    if (sound.state === "suspended") sound.resume().catch(() => {});
    return sound.state === "running" ? sound : null;
  }

  function refreshAll() {
    instances.forEach((inst) => {
      try {
        inst.refresh();
      } catch (e) {}
    });
  }

  // In page order; a video in a shadow root counts where its host stands.
  function ordered() {
    return [...instances.entries()].sort(([a], [b]) => {
      const x = inDocument(a);
      const y = inDocument(b);
      if (x === y) return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function position(id) {
    const list = ordered();
    return { list, i: list.findIndex(([, x]) => x.id === id) };
  }

  function create(v) {
    const id = nextId++;
    const core = makeCore();
    const inst = core.start(v, {
      id,
      quiet,
      full: () => full,
      setFull: (on) => {
        if (on) full = id;
        else if (full === id) full = null;
        refreshAll();
      },
      closeAll,
      hookHls,
      seenHls,
      audio,
      audioState: () => (sound ? sound.state : "none"),
      choice: () => choice,
      setChoice: (x) => {
        choice = { muted: x.muted, volume: x.volume, at: Date.now() };
      },
      neighbors: (me) => {
        const { list, i } = position(me);
        return { count: list.length, prev: i > 0, next: i >= 0 && i < list.length - 1 };
      },
      go: (me, dir) => {
        const { list, i } = position(me);
        const target = list[i + dir];
        if (i < 0 || !target) return;
        try {
          list[i][1].pause();
          target[1].activate();
        } catch (e) {
          console.error(e);
        }
      },
    });
    instances.set(v, { id, close: inst.close, refresh: inst.refresh, pause: inst.pause, activate: inst.activate, info: inst.info });
  }

  function scanAll() {
    if (closed) return;
    for (const [v, inst] of instances) {
      if (inst.id !== full && !v.isConnected) drop(v);
    }
    allVideos().forEach((v) => {
      if (!instances.has(v) && candidate(v)) create(v);
    });
  }

  window.__vuClose = closeAll;
  window.__vuInfo = (id) => {
    for (const inst of instances.values()) if (String(inst.id) === String(id)) return inst.info();
    return null;
  };
  scanAll();
  timer = setInterval(createSafe("[Gaffer Direct]", (name, error) => t("direct.error.in", { name, error }))(scanAll, "scan"), 1000);
}

const auto = window.__gafferAuto === true;
try {
  delete window.__gafferAuto;
} catch (e) {}

if (!auto || typeof window.__vuClose !== "function") {
  setQuiet(auto);
  try {
    start(auto);
  } catch (err) {
    console.error(err);
    banner(t("direct.error", { error: errorText(err) }));
  }
}
