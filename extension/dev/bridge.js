// Runs in the user script world, next to the page, and keeps the level setting
// (§11.15) in the extension. The page can send the same events, so a change only
// counts right after a real action of the user. Only the loudness that goes with
// it comes later, from the page where the user switched it on: that is measured
// there first, and changes nothing else.
if (typeof window.__gafferBridge === "function") window.__gafferBridge();
const ACTIONS = ["pointerdown", "pointerup", "keydown", "wheel", "input"];
const RECENT_MS = 3000;
let acted = -RECENT_MS;
let listens = false;

function send(message, done) {
  try {
    Promise.resolve(chrome.runtime.sendMessage(message)).then(done, () => {});
  } catch (e) {}
}

function onAction(e) {
  if (e.isTrusted) acted = performance.now();
}

function onGet() {
  send({ type: "level-get" }, (text) => {
    if (text) document.dispatchEvent(new CustomEvent("gaffer:level", { detail: text }));
  });
}

function onSet(e) {
  if (typeof e.detail !== "string") return;
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

ACTIONS.forEach((n) => window.addEventListener(n, onAction, { capture: true, passive: true }));
document.addEventListener("gaffer:level-get", onGet);
document.addEventListener("gaffer:level-set", onSet);
window.__gafferBridge = () => {
  ACTIONS.forEach((n) => window.removeEventListener(n, onAction, { capture: true }));
  document.removeEventListener("gaffer:level-get", onGet);
  document.removeEventListener("gaffer:level-set", onSet);
};
