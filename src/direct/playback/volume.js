import { state as s } from "../state.js";
import { host } from "../host.js";
import { showOsd } from "../ui/osd.js";
import { t } from "../../shared/i18n.js";
import { ms } from "../../shared/timing.js";
import { levelOn, levelValue, setLevel } from "../level/index.js";
import { playerRoot } from "./hold.js";
import { inUI } from "../input/routing.js";
import { fire } from "../quality/adapters/portal.js";
import { allVideos, deepQueryAll } from "../../shared/deep.js";

// The site's own mute button (SPEC §11.4): through it the site knows the choice
// too, so its next video follows. Known players first, then a label.
const MUTE_BUTTONS = ".ytp-mute-button,.vjs-mute-control,.jw-icon-volume,[data-plyr=\"mute\"],.shaka-mute-button,.fp-volumebtn,.bmpui-ui-volumetogglebutton,.rmp-volume,.playkit-volume-control .playkit-control-button,theoplayer-mute-button,.mejs__volume-button button,.mejs-volume-button button,.fluid_button_volume,.fluid_button_mute,.drawer-icon[data-volume],media-mute-button,.vds-mute-button";
const MUTE_LABEL = /\b(un)?mute\b|volume|geluid|dempen|sound/i;
const CHECK_MS = 300;

function labelled(b) {
  const text = [b.getAttribute("aria-label"), b.getAttribute("title"), b.getAttribute("data-e2e"), typeof b.className === "string" ? b.className : ""].join(" ");
  return MUTE_LABEL.test(text);
}

function siteMuteButton(v) {
  const root = playerRoot(v);
  const known = root ? deepQueryAll(root, MUTE_BUTTONS)[0] : null;
  if (known && !inUI(known)) return known;
  for (let i = 0; i < s.hidden.length; i++) {
    const h = s.hidden[i].el;
    if (!h.isConnected) continue;
    const list = [h].concat(deepQueryAll(h, 'button,[role="button"]'));
    const b = list.filter((x) => x.matches('button,[role="button"]') && labelled(x))[0];
    if (b) return b;
  }
  return null;
}

let check = null;

// Muted or not, through the site's button when it has one. If the site does not
// follow, Direct sets it itself.
export function setMuted(on) {
  const v = s.v;
  if (!v || v.muted === on) return;
  clearTimeout(check);
  const b = siteMuteButton(v);
  if (b) fire(b);
  if (v.muted === on) return;
  if (!b) {
    v.muted = on;
    return;
  }
  check = setTimeout(() => {
    if (s.v === v && v.muted !== on) v.muted = on;
  }, ms(CHECK_MS));
}

// What the user chose last, for the other videos on the page.
function remember(muted) {
  const v = s.v;
  host.setChoice({ muted, volume: levelOn() ? null : v.volume });
}

let applied = "";

// A video that starts on this page gets the sound the user chose for another
// one, unless another one is playing with sound.
export function applyChoice() {
  const v = s.v;
  const c = host.choice();
  if (!v || !c || v.paused) return;
  const key = c.at + "|" + (v.currentSrc || v.src);
  if (key === applied) return;
  const others = allVideos().some((x) => x !== v && !x.paused && !x.muted && x.volume > 0);
  if (others) return;
  applied = key;
  if (c.volume !== null && !levelOn() && Math.abs(v.volume - c.volume) > 0.005) v.volume = c.volume;
  if (v.muted !== c.muted) setMuted(c.muted);
}

export function toggleMute() {
  const v = s.v;
  if (!v) return;
  const on = !(v.muted || v.volume === 0);
  if (!on && v.volume === 0) v.volume = 0.5;
  setMuted(on);
  remember(on);
  showOsd(on ? t("direct.osd.muted") : volumeText());
}

// The volume the user sees and sets: the level (§11.15) when that is on.
export function shownVolume() {
  const v = s.v;
  if (v.muted || v.volume === 0) return 0;
  return levelOn() ? levelValue() / 100 : v.volume;
}

export function setShownVolume(x) {
  const v = s.v;
  if (!levelOn()) v.volume = x;
  else if (x > 0) {
    if (v.volume === 0) v.volume = 0.01;
    setLevel(x * 100);
  }
  setMuted(x === 0);
  remember(x === 0);
}

function volumeText() {
  return levelOn() ? t("direct.osd.level", { level: levelValue() }) : t("direct.osd.volume", { volume: Math.round(s.v.volume * 100) });
}

export function stepVolume(d) {
  const v = s.v;
  if (!v) return;
  const nv = Math.round(Math.min(1, Math.max(0, shownVolume() + d)) * 100) / 100;
  setShownVolume(nv);
  showOsd(nv === 0 ? t("direct.osd.muted") : volumeText());
}

export function volumeWheel(e) {
  e.preventDefault();
  e.stopPropagation();
  stepVolume(e.deltaY < 0 ? 0.05 : -0.05);
}
