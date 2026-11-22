// The level setting (SPEC §11.15). With the extension it is the same on every
// site, through events the extension's bridge listens to (§4.5); the
// bookmarklet keeps it per site.
import { load, save } from "../../shared/storage.js";
import { ms } from "../../shared/timing.js";
import { parseLevel } from "../../shared/loudness.js";
import { safe } from "../safe.js";

const KEY = "vu-level";
const SAVE_MS = 400;

// value is the volume the user sees (1 to 100), ref the loudness of the video it
// was set for, null until that has been measured.
export const setting = { on: false, value: 50, ref: null };

let timer = null;
let changed = () => {};

function take(x) {
  if (!x || (x.on === setting.on && x.value === setting.value && x.ref === setting.ref)) return;
  Object.assign(setting, x);
  changed();
}

function send(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

function ask() {
  if (!document.hidden) send("gaffer:level-get", "");
}

// From the extension (gaffer:level) or another video on the page.
function onLevel(e) {
  if (timer !== null) return;
  const x = parseLevel(e.detail);
  if (x && e.type === "gaffer:level") save(KEY, JSON.stringify(x));
  take(x);
}

function flush() {
  if (timer === null) return;
  clearTimeout(timer);
  const text = JSON.stringify(setting);
  save(KEY, text);
  send("gaffer:level-set", text);
  timer = null;
}

export function store(x) {
  Object.assign(setting, x);
  clearTimeout(timer);
  timer = setTimeout(flush, ms(SAVE_MS));
}

const guardedOnLevel = safe(onLevel, "level");
const guardedAsk = safe(ask, "level");
export function installStore(onChange) {
  changed = onChange;
  const own = parseLevel(load(KEY));
  if (own) Object.assign(setting, own);
  document.addEventListener("gaffer:level", guardedOnLevel);
  document.addEventListener("gaffer:level-set", guardedOnLevel);
  document.addEventListener("visibilitychange", guardedAsk);
  ask();
  return () => {
    flush();
    document.removeEventListener("gaffer:level", guardedOnLevel);
    document.removeEventListener("gaffer:level-set", guardedOnLevel);
    document.removeEventListener("visibilitychange", guardedAsk);
  };
}
