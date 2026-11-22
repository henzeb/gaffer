// Runs in the extension's isolated world in every frame (§4.5). It asks the
// background whether Gaffer is on for the page this frame belongs to; in a
// frame inside the page the background then starts capture and Direct. While
// Gaffer is on, it keeps the level setting (§11.15) in the extension and
// reports the end of a recording (§4.6). The page can send the same events, so
// a level change only counts right after a real action of the user. Only the
// loudness that goes with it comes later, from the page where the user switched
// it on: that is measured there first, and changes nothing else.
// Running it again (switching on or off) checks again.
(() => {
  if (typeof globalThis.__gafferBridgeCheck === "function") {
    globalThis.__gafferBridgeCheck();
    return;
  }
  const ACTIONS = ["pointerdown", "pointerup", "keydown", "wheel", "input"];
  const RECENT_MS = 3000;
  let acted = -RECENT_MS;
  let listens = false;
  let on = false;
  let known = false;
  let asked = false;
  let listening = false;
  let checking = false;
  let again = false;

  function alive() {
    try {
      return !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  function send(message, done) {
    if (!alive()) {
      stop();
      return;
    }
    try {
      Promise.resolve(chrome.runtime.sendMessage(message)).then(done, () => done(null));
    } catch (e) {
      done(null);
    }
  }

  function onAction(e) {
    if (e.isTrusted) acted = performance.now();
  }

  // Direct can ask before the background has answered whether Gaffer is on.
  function onGet() {
    if (!known) {
      asked = true;
      return;
    }
    send({ type: "level-get" }, (text) => {
      if (text) document.dispatchEvent(new CustomEvent("gaffer:level", { detail: text }));
    });
  }

  function onSet(e) {
    if (!on || typeof e.detail !== "string") return;
    if (performance.now() - acted < RECENT_MS) {
      try {
        const x = JSON.parse(e.detail);
        listens = x.on === true && (listens || x.ref === null);
      } catch (err) {
        return;
      }
      send({ type: "level-set", level: e.detail }, () => {});
    } else if (listens) send({ type: "level-ref", level: e.detail }, () => {});
  }

  function onRecorded() {
    if (on) send({ type: "recorded" }, () => {});
  }

  function listen() {
    if (listening) return;
    listening = true;
    ACTIONS.forEach((n) => window.addEventListener(n, onAction, { capture: true, passive: true }));
    document.addEventListener("gaffer:level-get", onGet);
    document.addEventListener("gaffer:level-set", onSet);
    window.addEventListener("gaffer:recorded", onRecorded);
  }

  function stop() {
    on = false;
    if (!listening) return;
    listening = false;
    ACTIONS.forEach((n) => window.removeEventListener(n, onAction, { capture: true }));
    document.removeEventListener("gaffer:level-get", onGet);
    document.removeEventListener("gaffer:level-set", onSet);
    window.removeEventListener("gaffer:recorded", onRecorded);
  }

  // One question at a time, so the background starts Direct in this frame once.
  function check() {
    if (checking) {
      again = true;
      return;
    }
    checking = true;
    send({ type: "frame", start: !on }, (r) => {
      if (r && r.on) {
        on = true;
        listen();
      } else if (r) stop();
      known = true;
      if (asked && on) onGet();
      asked = false;
      checking = false;
      if (again) {
        again = false;
        check();
      }
    });
  }

  globalThis.__gafferBridgeCheck = check;
  listen();
  check();
})();
