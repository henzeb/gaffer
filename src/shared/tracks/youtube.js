import { call, item } from "./common.js";

export function youtubePlayer(video) {
  const yt = video && video.closest && video.closest(".html5-video-player");
  if (!yt) return null;
  return typeof yt.getPlayerState === "function" || typeof yt.getAvailableQualityLevels === "function" ? yt : null;
}

function captionId(t) {
  const code = t.languageCode || "";
  return t.kind === "asr" ? "a." + code : code;
}

function captionLabel(t) {
  const n = t.name || t.displayName;
  if (typeof n === "string") return n;
  if (n && n.simpleText) return n.simpleText;
  if (n && n.runs && n.runs[0]) return n.runs.map((r) => r.text).join("");
  return "";
}

function captionTracks(yt) {
  const r = call(() => yt.getPlayerResponse());
  const fromResponse = r && r.captions && r.captions.playerCaptionsTracklistRenderer && r.captions.playerCaptionsTracklistRenderer.captionTracks;
  if (Array.isArray(fromResponse) && fromResponse.length) return fromResponse;
  const fromOption = call(() => yt.getOption("captions", "tracklist"));
  return Array.isArray(fromOption) ? fromOption : [];
}

function text(yt) {
  if (typeof yt.setOption !== "function") return null;
  if (!captionTracks(yt).length) return null;
  return {
    name: "YouTube",
    list: () => captionTracks(yt).map((t) => item(captionId(t), captionLabel(t), t.languageCode)),
    cur() {
      const t = call(() => yt.getOption("captions", "track"));
      return t && t.languageCode ? captionId(t) : null;
    },
    set(id) {
      if (id === null) {
        call(() => yt.setOption("captions", "track", {}));
        call(() => yt.unloadModule("captions"));
        return;
      }
      const t = captionTracks(yt).filter((x) => captionId(x) === id)[0];
      if (!t) return;
      call(() => yt.loadModule("captions"));
      const want = { languageCode: t.languageCode };
      if (t.kind) want.kind = t.kind;
      yt.setOption("captions", "track", want);
    },
  };
}

function audioId(t, i) {
  return call(() => t.getLanguageInfo().getId()) || (t.id !== undefined ? String(t.id) : String(i));
}

function audioLabel(t) {
  return call(() => t.getLanguageInfo().getName()) || t.name || t.label || "";
}

function audio(yt) {
  if (typeof yt.getAvailableAudioTracks !== "function" || typeof yt.setAudioTrack !== "function") return null;
  const tracks = () => call(() => yt.getAvailableAudioTracks()) || [];
  if (tracks().length < 2) return null;
  return {
    name: "YouTube",
    list: () => tracks().map((t, i) => item(audioId(t, i), audioLabel(t), call(() => t.getLanguageInfo().getId()) || t.language || "")),
    cur() {
      const c = call(() => yt.getAudioTrack());
      if (!c) return null;
      // The player may give a new object for the same track: compare by id.
      const l = tracks();
      let i = l.indexOf(c);
      if (i < 0) i = l.findIndex((x, k) => audioId(x, k) === audioId(c, k));
      return i < 0 ? null : audioId(l[i], i);
    },
    set(id) {
      const t = tracks().filter((x, i) => audioId(x, i) === id)[0];
      if (t) yt.setAudioTrack(t);
    },
  };
}

export function youtubeTracks(video) {
  const yt = youtubePlayer(video);
  if (!yt) return null;
  return { text: call(() => text(yt)), audio: call(() => audio(yt)) };
}

export function youtubeRates(video) {
  const yt = youtubePlayer(video);
  if (!yt || typeof yt.setPlaybackRate !== "function") return null;
  const rates = call(() => yt.getAvailablePlaybackRates()) || [];
  return { rates, set: (r) => yt.setPlaybackRate(r) };
}
