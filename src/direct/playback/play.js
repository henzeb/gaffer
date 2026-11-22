import { outsideBox, playerBox } from "../view/layer.js";
import { state as s } from "../state.js";
import { isLive, goLive, inWindow } from "./live.js";
import { inUI } from "../input/routing.js";
import { updateBar } from "../ui/bar.js";
import { playerRoot } from "./hold.js";
import { tell, nameOf } from "../tell.js";
import { t } from "../../shared/i18n.js";
import { deepContains, deepQueryAll } from "../../shared/deep.js";

export function quietPlay(v) {
  s.hold = false;
  const pr = v.play();
  if (pr && pr.catch) pr.catch(() => {});
}

export function hasSource() {
  const v = s.v;
  return !!v && !!(v.currentSrc || v.src || v.querySelector("source[src]"));
}

const PLAYISH = 'button,[role="button"],[class*="play" i],[aria-label]';

function playLabelled(el) {
  const t = (el.getAttribute("aria-label") || el.getAttribute("title") || "") + " " + (typeof el.className === "string" ? el.className : "");
  return /play|afspel|start/i.test(t) && !/playlist|playback-?rate|replay|autoplay|display/i.test(t);
}

function playTargets(root, vr) {
  return deepQueryAll(root, PLAYISH).filter((el) => {
    if (inUI(el) || !playLabelled(el)) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return !(r.right < vr.left || r.left > vr.right || r.bottom < vr.top || r.top > vr.bottom);
  });
}

function largest(list) {
  let best = null;
  let ba = 0;
  list.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width * r.height > ba) {
      ba = r.width * r.height;
      best = el;
    }
  });
  return best;
}

// A real play button goes first, then anything that looks like one. A wrapper
// around the video (a class with "player") only counts when there is nothing else.
export function clickSitePlay() {
  const v = s.v;
  s.hold = false;
  const root = playerRoot(v);
  if (!root) return false;
  const away = outsideBox(v);
  const vr = away || v.getBoundingClientRect();
  const isButton = (el) => el.matches('button,[role="button"]') && !/hide|hidden|pause/i.test((el.getAttribute("aria-label") || "") + " " + el.className);
  const near = playTargets(root, vr);
  // The player's own box, for a play button that lies next to the player.
  const wide = away ? playTargets(playerBox(v), vr) : [];
  // Or whatever the site laid over the middle (YouTube's embed: next to the box).
  const over = away ? document.elementsFromPoint(vr.left + vr.width / 2, vr.top + vr.height / 2).filter((el) => !inUI(el)).map((el) => el.closest('button,[role="button"]')).filter((el) => el && playLabelled(el)) : [];
  const best = largest(near.filter(isButton)) || largest(wide.filter(isButton)) || over[0] || largest(near.filter((el) => !deepContains(el, v))) || largest(near);
  if (!best) return false;
  tell(t("direct.tell.siteClick", { button: nameOf(best) }));
  try {
    best.click();
  } catch (e) {}
  return true;
}

export function playPause() {
  const v = s.v;
  if (!v) return;
  // Live goes on from where it was paused, unless that has left the window.
  if (isLive() && v.paused && !inWindow()) {
    goLive();
    return;
  }
  if (!hasSource() && v.paused) {
    if (clickSitePlay()) return;
  }
  if (s.autoP) {
    s.autoP = false;
    quietPlay(v);
    updateBar();
    return;
  }
  if (v.paused) quietPlay(v);
  else {
    s.hold = true;
    v.pause();
  }
}

export function want(play) {
  const v = s.v;
  if (!v) return;
  if (play && isLive() && v.paused && !inWindow()) {
    goLive(true);
    return;
  }
  if (play) {
    if (v.paused) {
      s.autoP = false;
      quietPlay(v);
    } else s.hold = false;
  } else {
    s.hold = true;
    if (!v.paused) v.pause();
  }
}

export function wantRepeated(play) {
  want(play);
  setTimeout(() => want(play), 80);
  setTimeout(() => want(play), 350);
}
