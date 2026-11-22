import { t } from "../../shared/i18n.js";
import { shortIn } from "../../shared/address.js";
import { barsOf } from "./layout.js";

const OWN = "#video-ultimate-bar,#video-ultimate-top,#vu-osd,#vu-loader,#vu-rec,#vu-analyse,#v-rotator-style,#vu-dyn";

function name(el) {
  const id = el.id ? "#" + el.id : "";
  const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  return (el.tagName.toLowerCase() + id + cls).slice(0, 70);
}

function playerBox(v) {
  let a = v;
  let top = null;
  while (a.parentElement && a.parentElement !== document.body && a.parentElement !== document.documentElement) {
    const pa = a.parentElement;
    if (pa.offsetWidth <= v.offsetWidth * 1.3 + 100 && pa.offsetHeight <= v.offsetHeight * 1.3 + 150) {
      top = pa;
      a = pa;
    } else break;
  }
  return top || v.parentElement;
}

function shown(el) {
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function overlaps(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
}

function stillVisible(v, root) {
  if (!root) return [];
  const vr = v.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const area = vr.width * vr.height > 0 && overlaps(vr, rr) ? vr : rr;
  const out = [];
  [].forEach.call(root.querySelectorAll("*"), (el) => {
    if (out.length >= 15 || el === v || el.contains(v) || el.closest(OWN) || el.closest("[data-vu-hide]") || el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
    if (el.parentElement && out.indexOf(el.parentElement) >= 0) return;
    if (!shown(el)) return;
    const r = el.getBoundingClientRect();
    if (!overlaps(r, area)) return;
    out.push(el);
  });
  return out.map((el) => {
    const r = el.getBoundingClientRect();
    return name(el) + " " + Math.round(r.width) + "x" + Math.round(r.height) + (el.hasAttribute("data-vu-poster") ? " " + t("inspect.report.direct.poster") : "");
  });
}

function zChain(el) {
  const out = [];
  for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
    let cs = null;
    try {
      cs = getComputedStyle(a);
    } catch (e) {
      continue;
    }
    const parentFlex = a.parentElement ? /flex|grid/.test(getComputedStyle(a.parentElement).display) : false;
    if (cs.zIndex !== "auto" && (cs.position !== "static" || parentFlex)) out.unshift(cs.zIndex);
    else if (+cs.opacity < 1 || cs.transform !== "none" || cs.filter !== "none" || cs.isolation === "isolate") out.unshift("ctx");
  }
  return out.length ? out.join(" > ") : "auto";
}

function zText(el) {
  return name(el) + " [z " + zChain(el) + "]";
}

const TOOLTIP = '[role="tooltip"],[class*="tooltip" i],[class*="popover" i],[class*="balloon" i]';

function reportStack(L, id) {
  const seen = [];
  const add = (el) => {
    if (el && seen.indexOf(el) < 0 && !(el.closest && el.closest("#vu-analyse"))) seen.push(el);
  };
  ["#video-ultimate-bar", "#video-ultimate-top"].forEach((sel) => {
    const bar = document.querySelector(sel + '[data-vu-for="' + id + '"]');
    if (!bar) return;
    add(bar);
    const r = bar.getBoundingClientRect();
    if (!r.width) return;
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach((fx) => {
      [0.3, 0.7].forEach((fy) => {
        let list = [];
        try {
          list = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        } catch (e) {}
        for (let i = 0; i < list.length && i < 4; i++) add(list[i]);
      });
    });
  });
  [].forEach.call(document.querySelectorAll(TOOLTIP), (el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !el.closest("[data-vu-for]")) add(el);
  });
  L("   " + t("inspect.report.direct.stack"));
  seen.slice(0, 30).forEach((el) => {
    const r = el.getBoundingClientRect();
    L("      " + zText(el) + " " + Math.round(r.left) + "," + Math.round(r.top) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  });
}

function reportInfo(L, id) {
  let info = null;
  try {
    info = typeof window.__vuInfo === "function" ? window.__vuInfo(id) : null;
  } catch (e) {}
  if (!info) return;
  L("   " + t("inspect.report.direct.layer", { parent: info.parent ? name(info.parent) : "?", source: info.zFrom ? zText(info.zFrom) : t("inspect.report.direct.layer.none") }));
  reportStack(L, id);
  const qi = info.quality;
  L("   " + (qi ? t("inspect.report.direct.quality", { source: qi.name, list: qi.list.map((x) => (qi.cur && x.indexOf(qi.cur) === 0 ? "[" + x + "]" : x)).join(", ") }) : t("inspect.report.direct.quality.none")));
  const off = t("inspect.report.tracks.off");
  if (info.text) L("   " + t("inspect.report.direct.text", { source: info.text.name, current: info.text.cur || off }));
  if (info.audio) L("   " + t("inspect.report.direct.audio", { source: info.audio.name, current: info.audio.cur || "?" }));
  reportStatus(L, info);
}

const yes = (on) => (on ? t("inspect.report.direct.yes") : t("inspect.report.direct.no"));
const sec = (n) => (typeof n === "number" && isFinite(n) ? n.toFixed(1) : "?");

// What Direct itself knows about the video (SPEC §12.1).
function reportStatus(L, info) {
  const say = (text) => L("   " + text);
  if (info.version) say(t("inspect.report.direct.about", { version: info.version, how: info.extension ? t("inspect.report.direct.about.extension") : t("inspect.report.direct.about.bookmarklet"), capture: yes(info.capture) }));
  const errors = info.errors || [];
  say(errors.length ? t("inspect.report.direct.errors", { list: errors.map((e) => e.name + ": " + shortIn(e.message) + " (" + e.count + "×)").join("; ") }) : t("inspect.report.direct.errors.none"));
  const live = info.live;
  if (live) {
    const range = live.range ? sec(live.range[0]) + "–" + sec(live.range[1]) : "?";
    if (!live.live) say(t("inspect.report.direct.live.no", { range }));
    else {
      const why = live.why === "infinity" ? t("inspect.report.direct.live.infinity") : live.why === "flag" ? t("inspect.report.direct.live.flag") : t("inspect.report.direct.live.growing");
      say(t("inspect.report.direct.live.yes", { why, range, delay: sec(live.delay), behind: sec(live.behind) }));
    }
  }
  if (info.ad) say(t("inspect.report.direct.ad"));
  if (info.light) say(t("inspect.report.direct.light", info.light));
  const lv = info.level;
  if (lv) {
    if (!lv.on) say(t("inspect.report.direct.level.off", { context: lv.context }));
    else {
      const from = { measured: t("inspect.report.direct.level.measured"), earlier: t("inspect.report.direct.level.earlier"), youtube: t("inspect.report.direct.level.youtube"), assumed: t("inspect.report.direct.level.assumed") }[lv.from] || "?";
      say(t("inspect.report.direct.level.on", { value: lv.value, ref: lv.ref === null ? "?" : sec(lv.ref), reference: yes(lv.reference), loudness: sec(lv.loudness), from, volume: typeof lv.volume === "number" ? Math.round(lv.volume * 100) : "?", context: lv.context }));
      if (lv.failed) say(t("inspect.report.direct.level.failed"));
      if (lv.held) say(t("inspect.report.direct.level.held"));
    }
  }
  const qs = info.qualityState;
  if (qs) {
    say(t("inspect.report.direct.qualityState", { max: yes(qs.max), user: yes(qs.user), bad: qs.bad.length ? qs.bad.join(", ") : t("inspect.report.nothing") }));
    if (qs.menu) say(t("inspect.report.direct.menu", { tries: qs.menu.tries, found: yes(qs.menu.found) }));
  }
  const ch = info.chapters;
  if (ch) say(ch.count ? t("inspect.report.direct.chapters", { source: ch.source || "?", count: ch.count }) : t("inspect.report.direct.chapters.none"));
  const p = info.playback;
  if (p) say(t("inspect.report.direct.playback", { held: yes(p.held), loading: yes(p.loading), readyState: p.readyState, ahead: sec(p.ahead), guard: yes(p.guard) }));
  const nav = info.nav;
  if (nav) {
    if (nav.prev || nav.next) say(t("inspect.report.direct.nav.site", { prev: nav.prev ? name(nav.prev) : "-", next: nav.next ? name(nav.next) : "-" }));
    else if (nav.page) say(t("inspect.report.direct.nav.page", { count: nav.page.count, prev: yes(nav.page.prev), next: yes(nav.page.next) }));
  }
  const sh = info.share;
  if (sh) say(sh === "system" ? t("inspect.report.direct.share.system") : sh === "copy" ? t("inspect.report.direct.share.copy") : t("inspect.report.direct.share.site", { button: name(sh) }));
}

export function reportDirect(L, vids) {
  L("== Gaffer Direct");
  const on = typeof window.__vuClose === "function";
  L(t("inspect.report.direct.active", { state: on ? t("inspect.report.direct.yes") : t("inspect.report.direct.no") }));
  if (!on) return;
  L(t("inspect.report.direct.bars", { n: document.querySelectorAll("#video-ultimate-bar").length }));
  vids.forEach((v, i) => {
    const id = v.getAttribute("data-vu-id");
    if (!id) {
      L(t("inspect.report.direct.none", { index: i, width: v.offsetWidth, height: v.offsetHeight, windowWidth: innerWidth, windowHeight: innerHeight }));
      return;
    }
    const bar = document.querySelector('#video-ultimate-bar[data-vu-for="' + id + '"]');
    const top = document.querySelector('#video-ultimate-top[data-vu-for="' + id + '"]');
    const state = !bar ? t("inspect.report.direct.bars.missing") : bar.classList.contains("v-ui-off") ? t("inspect.report.direct.bars.off") : bar.classList.contains("v-ui-hide") ? t("inspect.report.direct.bars.hidden") : t("inspect.report.direct.bars.visible");
    L(top ? t("inspect.report.direct.video", { index: i, id, state }) : t("inspect.report.direct.video.noTop", { index: i, id, state }));
    const b = barsOf(id);
    if (b.top && b.bottom) L("   " + t("inspect.report.direct.position", { top: b.top.top, topEnd: b.top.bottom, bottom: b.bottom.top, bottomEnd: b.bottom.bottom, windowHeight: innerHeight, z: b.z }));
    reportInfo(L, id);
    const root = playerBox(v);
    const hidden = root ? [].slice.call(root.querySelectorAll("[data-vu-hide]")) : [];
    L("   " + t("inspect.report.direct.hidden", { n: hidden.length, list: hidden.length ? hidden.slice(0, 12).map(name).join(", ") : t("inspect.report.nothing") }));
    const posters = root ? [].slice.call(root.querySelectorAll('[data-vu-poster="' + id + '"]')) : [];
    if (posters.length) L("   " + t("inspect.report.direct.posters", { list: posters.map(name).join(", ") }));
    const still = stillVisible(v, root);
    L("   " + t("inspect.report.direct.still") + (still.length ? "" : " " + t("inspect.report.nothing")));
    still.forEach((x) => L("      " + x));
  });
}
