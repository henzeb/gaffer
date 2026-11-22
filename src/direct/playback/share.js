// Sharing (SPEC §11.4): the site's own share button when it has one near the
// video, otherwise the system's share menu or a copied link.
import { state as s } from "../state.js";
import { t } from "../../shared/i18n.js";
import { blockedByAd } from "../video/ad.js";
import { fire } from "../quality/adapters/portal.js";
import { setFull } from "../view/fullscreen.js";
import { showOsd } from "../ui/osd.js";
import { isLive } from "./live.js";
import { formatTime } from "./seek.js";
import { ms } from "../../shared/timing.js";
import { deepParent, deepQueryAll } from "../../shared/deep.js";

const KNOWN = [
  ".ytp-share-button", ".jw-icon-sharing", ".jw-sharing-icon", ".vjs-share-control", ".vp-share", "[data-share-button]",
  ".fp-share", ".bmpui-ui-sharebutton", '[data-e2e="share-icon"]', '[data-e2e="video-share-button"]', '[data-e2e="share-button"]',
].join(",");
// Not "deel": in Dutch that is also a part (deel 2).
const LABEL = /(^|[^a-z])(share|delen|teilen|partager|compartir|condividi)([^a-z]|$)/i;
// The site's share panel that opens after the click is not hidden (site-controls.js).
export const SHARE_PANELS = ".ytp-share-panel,.vjs-share,.jw-sharing-menu,.vp-share-modal";
export const SHARE_OPENED = '[class*="share" i],[id*="share" i],[class*="sharing" i],[role="dialog"],[aria-modal="true"]';
// Not scaled: the scan that hides new layers runs every second in tests too.
const OPENED_FOR = 4000;
const AFTER_FULL = 250;

function ours(b) {
  return !!b.closest("[data-vu-for]");
}

function label(b) {
  const own = (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "") + " " + (b.getAttribute("data-e2e") || "");
  const txt = (b.textContent || "").replace(/\s+/g, " ").trim();
  return own + " " + (txt.length <= 24 ? txt : "");
}

// A button the site shows, or one Direct hid with the rest of the controls. One
// the site itself left out (display none) is not meant to be used now.
function usable(b) {
  if (ours(b) || b.disabled || b.getAttribute("aria-disabled") === "true") return false;
  const r = b.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function buttonOf(e) {
  return e.closest('button,[role="button"]') || e;
}

function findIn(root) {
  const known = deepQueryAll(root, KNOWN).map(buttonOf).filter(usable);
  if (known.length) return known[0];
  const list = deepQueryAll(root, 'button,[role="button"]');
  for (let i = 0; i < list.length; i++) if (usable(list[i]) && LABEL.test(label(list[i]))) return list[i];
  return null;
}

// From the video up to the first element with a share button, as long as that
// element holds no other video: in a feed every video has its own.
export function findShare() {
  const v = s.v;
  if (!v) return null;
  for (let a = deepParent(v); a; a = deepParent(a)) {
    if (deepQueryAll(a, "video").length > 1) return null;
    const b = findIn(a);
    if (b) return b;
    if (a === document.body) return null;
  }
  return null;
}

export function sharing() {
  return !!s.shareAt && Date.now() - s.shareAt < OPENED_FOR;
}

function meta(sel, attr) {
  const e = document.querySelector(sel);
  return e ? e.getAttribute(attr) || "" : "";
}

function youtubeId() {
  if (!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(location.hostname)) return "";
  const m = location.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/) || (location.hostname === "youtu.be" && location.pathname.match(/^\/([\w-]{6,})/));
  return m ? m[1] : new URLSearchParams(location.search).get("v") || "";
}

export function pageLink() {
  const id = youtubeId();
  if (id) return "https://www.youtube.com/watch?v=" + id;
  const url = meta('link[rel="canonical"]', "href") || meta('meta[property="og:url"]', "content");
  try {
    if (url) return new URL(url, location.href).href;
  } catch (e) {}
  return location.href;
}

export function timeLink() {
  const id = youtubeId();
  const at = Math.floor(s.v ? s.v.currentTime : 0);
  if (id && !isLive() && at > 0) return "https://youtu.be/" + id + "?t=" + at;
  return pageLink();
}

function copyByHand(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("data-vu-for", String(s.id));
  ta.style.cssText = "position:fixed!important;top:-9999px!important;opacity:0!important;";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {}
  ta.remove();
  return ok;
}

export function copyLink(text, msg) {
  const done = (ok) => showOsd(ok ? msg : t("direct.share.failed"));
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(copyByHand(text)));
      return;
    }
  } catch (e) {}
  done(copyByHand(text));
}

function systemShare(url) {
  const data = { title: document.title, url };
  try {
    if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return false;
    navigator.share(data).catch((e) => {
      if (!e || e.name !== "AbortError") copyLink(url, t("direct.share.copied"));
    });
    return true;
  } catch (e) {
    return false;
  }
}

function clickSite(b) {
  s.shareAt = Date.now();
  fire(b);
}

export function share(e) {
  if (!s.v || blockedByAd()) return;
  if (e && e.shiftKey) {
    const at = timeLink();
    copyLink(at, at === pageLink() ? t("direct.share.copied") : t("direct.share.copiedAt", { time: formatTime(s.v.currentTime) }));
    return;
  }
  const b = findShare();
  if (b) {
    // The site's panel would lie under the video in Direct's fullscreen.
    if (s.F) {
      setFull(false);
      setTimeout(() => {
        if (b.isConnected) clickSite(b);
      }, ms(AFTER_FULL));
      return;
    }
    clickSite(b);
    return;
  }
  const url = pageLink();
  if (!systemShare(url)) copyLink(url, t("direct.share.copied"));
}
