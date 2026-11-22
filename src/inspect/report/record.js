import { short } from "./format.js";
import { isHls, parseHls, hlsEncrypted, attrs } from "../../media/manifest/hls.js";
import { parseMpd, dashEncrypted } from "../../media/manifest/dash.js";
import { t } from "../../shared/i18n.js";
import { blockedPage } from "../../shared/blocked-sites.js";

const DOWNLOAD_TEXT = /download|herunterladen|t[ée]l[ée]charger|descargar|scarica|downloaden/i;
const FILE_LINK = /\.(mp4|m4v|webm|mov|mkv|m3u8|mpd)([?#]|$)/i;

function quote(s) {
  return '"' + String(s).replace(/(["\\$`])/g, "\\$1") + '"';
}

function sourceOf(v) {
  if (v.srcObject) return t("inspect.record.source.stream");
  const src = v.currentSrc || v.src || "";
  if (!src) return t("inspect.report.videos.empty");
  if (/^blob:/.test(src)) return t("inspect.record.source.mse");
  return t("inspect.record.source.file", { url: short(src) });
}

// The key's address without its query, which may hold a token (SPEC §12.1).
function keyLines(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((l) => /^#EXT-X-(SESSION-)?KEY:/.test(l) && (attrs(l.slice(l.indexOf(":") + 1)).METHOD || "NONE").toUpperCase() !== "NONE")
    .slice(0, 2)
    .map((l) => l.replace(/URI="([^"]*)"/, (m, u) => 'URI="' + short(u) + '"'));
}

export function describeManifest(url, text) {
  if (!text) return { kind: "?", line: t("inspect.record.manifest.unreadable") };
  if (isHls(text)) {
    const p = parseHls(text, url);
    const enc = hlsEncrypted(text);
    const kind = p.master ? t("inspect.record.manifest.hlsMaster", { n: p.variants.length, audio: p.renditions.filter((r) => r.type === "AUDIO").length }) : t("inspect.record.manifest.hlsMedia", { n: p.segments.length, format: p.format || "?", live: p.live ? "live" : "VOD" });
    return { kind: "hls", master: p.master, encrypted: enc, line: kind + (enc ? " · " + t("inspect.record.manifest.encrypted", { lines: keyLines(text).join(" | ") }) : "") };
  }
  if (/<(\w+:)?MPD[\s>]/.test(text)) {
    const p = parseMpd(text, url);
    const enc = dashEncrypted(text);
    const reps = p ? p.representations : [];
    const kind = t("inspect.record.manifest.dash", { video: reps.filter((r) => r.kind === "video").length, audio: reps.filter((r) => r.kind === "audio").length, live: p && p.live ? "live" : "VOD" });
    return { kind: "dash", master: true, encrypted: enc, line: kind + (enc ? " · " + t("inspect.record.manifest.protection") : "") };
  }
  return { kind: "?", line: t("inspect.record.manifest.unknown") };
}

function siteDownloads() {
  const out = [];
  try {
    document.querySelectorAll("a[href],button,[role=button]").forEach((e) => {
      if (out.length >= 8) return;
      const href = e.getAttribute("href") || "";
      const label = ((e.getAttribute("aria-label") || "") + " " + (e.getAttribute("title") || "") + " " + (e.textContent || "")).trim().replace(/\s+/g, " ").slice(0, 60);
      if (e.hasAttribute("download") || FILE_LINK.test(href) || DOWNLOAD_TEXT.test(label)) out.push((e.tagName === "A" ? "<a" + (e.hasAttribute("download") ? " download" : "") + "> " : "<" + e.tagName.toLowerCase() + "> ") + (label || "") + (href && !/^javascript:/i.test(href) ? " → " + short(href) : ""));
    });
  } catch (e) {}
  return out;
}

function captureLines(v) {
  const c = window.__gafferCapture;
  if (!/^blob:/.test(v.currentSrc || v.src || "")) return [];
  if (!c || typeof c.buffers !== "function") return [t("inspect.record.capture.off")];
  let list = [];
  try {
    list = c.buffers(v) || [];
  } catch (e) {}
  if (!list.length) return [t("inspect.record.capture.none")];
  return [t("inspect.record.capture.buffers", { n: list.length, list: list.map((e) => (e.mime || "?") + (e.init ? " · init " + e.init.length + " B" : " · " + t("inspect.record.capture.noInit"))).join("; ") })];
}

function directLine(v) {
  const id = v.getAttribute("data-vu-id");
  if (!id) return t("inspect.record.direct.none");
  const top = document.querySelector('#video-ultimate-top[data-vu-for="' + id + '"] .rec');
  if (!top) return t("inspect.record.direct.none");
  return t("inspect.record.direct.button", { label: top.textContent, tip: top.title, state: top.classList.contains("off") ? t("inspect.record.direct.off") : t("inspect.record.direct.on") });
}

// dev: the ffmpeg commands, with full addresses, only in Gaffer (dev) (SPEC §12.3).
export async function reportRecord(L, vids, urls, { dev = false } = {}) {
  L("== " + t("inspect.record.title"));
  if (blockedPage()) {
    L(t("inspect.record.blocked"));
    return;
  }
  L(t("inspect.record.warning"));
  let drm = false;
  vids.forEach((v, i) => {
    let keys = null;
    try {
      keys = v.mediaKeys;
    } catch (e) {}
    if (keys) drm = true;
    const cl = v.getAttribute("controlslist") || "";
    L("#" + (i + 1) + " " + sourceOf(v));
    L("   " + t("inspect.record.drm", { state: keys ? t("inspect.record.drm.yes", { system: (keys && keys.keySystem) || "?" }) : t("inspect.report.none") }));
    L("   " + t("inspect.record.controlslist", { value: cl || t("inspect.report.none") }) + (/nodownload/i.test(cl) ? " " + t("inspect.record.nodownload") : ""));
    captureLines(v).forEach((l) => L("   " + l));
    L("   " + directLine(v));
  });
  const links = siteDownloads();
  L(t("inspect.record.siteLinks", { n: links.length }));
  links.forEach((l) => L("   " + l));
  const texts = await Promise.all(urls.slice(0, 8).map((u) => fetch(u).then((r) => (r.ok ? r.text() : ""), () => "")));
  const info = urls.slice(0, 8).map((u, i) => ({ url: u, text: texts[i], d: describeManifest(u, texts[i]) }));
  L(t("inspect.record.manifests", { n: info.length }));
  info.forEach((m) => L("   " + short(m.url) + " — " + m.d.line));
  const top = info.filter((m) => m.d.master);
  const targets = top.length ? top : info.filter((m) => m.d.kind !== "?");
  const anyEncrypted = info.some((m) => m.d.encrypted);
  if (!dev) return;
  L(t("inspect.record.commands"));
  if (!targets.length) L("   " + t("inspect.report.none"));
  const ua = navigator.userAgent;
  const ref = location.href;
  targets.forEach((m) => {
    if (drm) return L("   " + t("inspect.record.noCommand", { reason: t("inspect.record.reason.drm") }));
    if (m.d.encrypted || anyEncrypted) return L("   " + t("inspect.record.noCommand", { reason: t("inspect.record.reason.encrypted") }) + " (" + short(m.url) + ")");
    L("   ffmpeg -user_agent " + quote(ua) + " -referer " + quote(ref) + " -i " + quote(m.url) + " -c copy out.mp4");
  });
}
