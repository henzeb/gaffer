import { t } from "./i18n.js";

export const LIBRARIES = {
  Hls: "hls.js",
  shaka: "Shaka Player",
  dashjs: "dash.js",
  videojs: "video.js",
  jwplayer: "JW Player",
  Plyr: "Plyr",
  flowplayer: "Flowplayer",
  Clappr: "Clappr",
  bitmovin: "Bitmovin",
  THEOplayer: "THEOplayer",
  fluidPlayer: "Fluid Player",
  MediaElementPlayer: "MediaElement.js",
  YT: "YouTube API",
  muxjs: "mux.js",
  RadiantMP: "Radiant Media Player",
  mpegts: "mpegts.js",
  flvjs: "flv.js",
};

export const PLAYER_ROOTS = ".video-js,.jwplayer,.plyr,.rmp-container,.vjs-player";

export const PLAYER_SCRIPT = /hls|dash|shaka|video|player|jw|plyr|flow|clappr|bitmovin|theo|mux/i;

export function isPlayer(o) {
  try {
    return !!o && typeof o === "object" && (("levels" in o && "currentLevel" in o) || typeof o.getVariantTracks === "function" || typeof o.qualityLevels === "function" || typeof o.getQualityLevels === "function" || typeof o.getBitrates === "function" || typeof o.setBitrate === "function");
  } catch (e) {
    return false;
  }
}

export function isQualityPlayer(o) {
  return !!o && typeof o === "object" && (("levels" in o && "currentLevel" in o) || typeof o.getVariantTracks === "function" || typeof o.qualityLevels === "function" || typeof o.getQualityLevels === "function");
}

export function playerMethods(o) {
  const m = [];
  try {
    let p = o;
    for (let d = 0; p && d < 3; d++) {
      Object.getOwnPropertyNames(p).forEach((k) => {
        try {
          if (typeof o[k] === "function" && /bitrate|qualit|level|track|src|source|rendition/i.test(k) && m.indexOf(k) < 0) m.push(k);
        } catch (e) {}
      });
      p = Object.getPrototypeOf(p);
    }
  } catch (e) {}
  return m.slice(0, 25).join(",");
}

export function globalMatches(k, o) {
  const m = [];
  if ("levels" in o && "currentLevel" in o) m.push(t("inspect.report.globals.hlsLike"));
  if (typeof o.getVariantTracks === "function") m.push("Shaka (getVariantTracks)");
  if (typeof o.getBitrateInfoListFor === "function" || typeof o.getRepresentationsByType === "function") m.push("dash.js");
  if (typeof o.qualityLevels === "function") m.push("qualityLevels()");
  if (typeof o.getQualityLevels === "function") m.push("getQualityLevels()");
  if (typeof o.setQuality === "function" || typeof o.setCurrentQuality === "function") m.push("setQuality");
  if (o.media instanceof HTMLMediaElement) m.push(t("inspect.report.globals.mediaIsVideo"));
  if (typeof o.getBitrates === "function" || typeof o.setBitrate === "function") m.push(t("inspect.report.globals.radiantLike", { methods: playerMethods(o) }));
  if (/rmp|radiant/i.test(k)) m.push(t("inspect.report.globals.radiantName"));
  return m;
}
