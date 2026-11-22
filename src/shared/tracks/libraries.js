import { call, each, holds, item, modeText, enabledAudio } from "./common.js";

export function hlsTracks(c, video) {
  if (!c || c.media !== video || !("subtitleTrack" in c || "audioTrack" in c)) return null;
  const subs = () => (Array.isArray(c.subtitleTracks) ? c.subtitleTracks : []);
  const auds = () => (Array.isArray(c.audioTracks) ? c.audioTracks : []);
  const text = subs().length
    ? {
        name: "hls.js",
        list: () => subs().map((t, i) => item(i, t.name, t.lang)),
        cur: () => (c.subtitleDisplay !== false && c.subtitleTrack >= 0 ? c.subtitleTrack : null),
        set(id) {
          if (id === null) {
            c.subtitleTrack = -1;
            return;
          }
          c.subtitleDisplay = true;
          c.subtitleTrack = id;
        },
      }
    : null;
  const audio = auds().length > 1
    ? {
        name: "hls.js",
        list: () => auds().map((t, i) => item(i, t.name, t.lang)),
        cur: () => (c.audioTrack >= 0 ? c.audioTrack : null),
        set(id) {
          c.audioTrack = id;
        },
      }
    : null;
  return { text, audio };
}

function shakaAudio(sp) {
  if (typeof sp.getAudioTracks === "function" && typeof sp.selectAudioTrack === "function") {
    const tracks = () => call(() => sp.getAudioTracks()) || [];
    if (tracks().length < 2) return null;
    return {
      name: "Shaka Player",
      list: () => tracks().map((t, i) => item(i, t.label, t.language)),
      cur() {
        const i = tracks().findIndex((t) => t.active);
        return i < 0 ? null : i;
      },
      set(id) {
        const t = tracks()[id];
        if (t) sp.selectAudioTrack(t);
      },
    };
  }
  if (typeof sp.getAudioLanguagesAndRoles !== "function" || typeof sp.selectAudioLanguage !== "function") return null;
  const langs = () => {
    const seen = {};
    return (call(() => sp.getAudioLanguagesAndRoles()) || []).filter((x) => x && !seen[x.language] && (seen[x.language] = true));
  };
  if (langs().length < 2) return null;
  return {
    name: "Shaka Player",
    list: () => langs().map((x) => item(x.language, x.label, x.language)),
    cur() {
      const v = (call(() => sp.getVariantTracks()) || []).filter((t) => t.active)[0];
      return v && v.language ? v.language : null;
    },
    set(id) {
      sp.selectAudioLanguage(id);
    },
  };
}

export function shakaTracks(sp, video) {
  if (!sp || typeof sp.getMediaElement !== "function" || call(() => sp.getMediaElement()) !== video) return null;
  const subs = () => call(() => sp.getTextTracks()) || [];
  const text = typeof sp.selectTextTrack === "function" && subs().length
    ? {
        name: "Shaka Player",
        list: () => subs().map((t) => item(t.id, t.label, t.language)),
        cur() {
          if (!call(() => sp.isTextTrackVisible())) return null;
          const t = subs().filter((x) => x.active)[0];
          return t ? t.id : null;
        },
        set(id) {
          if (id === null) {
            sp.setTextTrackVisibility(false);
            return;
          }
          const t = subs().filter((x) => x.id === id)[0];
          if (!t) return;
          sp.selectTextTrack(t);
          sp.setTextTrackVisibility(true);
        },
      }
    : null;
  return { text, audio: call(() => shakaAudio(sp)) };
}

function dashLabel(t) {
  const l = t.labels && t.labels[0];
  return (l && (l.text || l)) || t.label || "";
}

export function dashTracks(p, video) {
  if (!p || typeof p.getVideoElement !== "function" || typeof p.getTracksFor !== "function" || call(() => p.getVideoElement()) !== video) return null;
  const subs = () => call(() => p.getTracksFor("text")) || [];
  const auds = () => call(() => p.getTracksFor("audio")) || [];
  const text = typeof p.setTextTrack === "function" && subs().length
    ? {
        name: "dash.js",
        list: () => subs().map((t, i) => item(i, dashLabel(t), t.lang)),
        cur() {
          if (typeof p.isTextEnabled === "function" && !call(() => p.isTextEnabled())) return null;
          const i = call(() => p.getCurrentTextTrackIndex());
          return typeof i === "number" && i >= 0 ? i : null;
        },
        set(id) {
          if (id === null) {
            p.setTextTrack(-1);
            if (typeof p.enableText === "function") p.enableText(false);
            return;
          }
          if (typeof p.enableText === "function") p.enableText(true);
          p.setTextTrack(id);
        },
      }
    : null;
  const audio = typeof p.setCurrentTrack === "function" && auds().length > 1
    ? {
        name: "dash.js",
        list: () => auds().map((t, i) => item(i, dashLabel(t), t.lang)),
        cur() {
          const c = call(() => p.getCurrentTrackFor("audio"));
          if (!c) return null;
          const l = auds();
          let i = l.indexOf(c);
          if (i < 0) i = l.findIndex((t) => t.id === c.id && t.lang === c.lang);
          return i < 0 ? null : i;
        },
        set(id) {
          const t = auds()[id];
          if (t) p.setCurrentTrack(t);
        },
      }
    : null;
  return { text, audio };
}

export function bitmovinTracks(p, video) {
  if (!p || (typeof p.getAvailableAudio !== "function" && !p.subtitles)) return null;
  if (!holds(call(() => p.getVideoElement && p.getVideoElement()), video) && !holds(call(() => p.getContainer && p.getContainer()), video)) return null;
  const subs = () => call(() => p.subtitles.list()) || [];
  const auds = () => call(() => p.getAvailableAudio()) || [];
  const text = p.subtitles && typeof p.subtitles.enable === "function" && subs().length
    ? {
        name: "Bitmovin",
        list: () => subs().map((t) => item(t.id, t.label, t.lang)),
        cur() {
          const t = subs().filter((x) => x.enabled)[0];
          return t ? t.id : null;
        },
        set(id) {
          subs().forEach((t) => {
            if (t.enabled && t.id !== id) p.subtitles.disable(t.id);
          });
          if (id !== null) p.subtitles.enable(id, true);
        },
      }
    : null;
  const audio = typeof p.setAudio === "function" && auds().length > 1
    ? {
        name: "Bitmovin",
        list: () => auds().map((t) => item(t.id, t.label, t.lang)),
        cur() {
          const a = call(() => p.getAudio());
          return a ? a.id : null;
        },
        set(id) {
          p.setAudio(id);
        },
      }
    : null;
  return { text, audio };
}

export function theoTracks(p, video) {
  if (!p || !holds(p.element, video) || !(p.textTracks || p.audioTracks)) return null;
  return { text: modeText("THEOplayer", () => p.textTracks), audio: enabledAudio("THEOplayer", () => p.audioTracks) };
}

function playbackOf(o) {
  const core = o && o.core;
  if (!core || typeof core !== "object") return null;
  return core.activePlayback || call(() => core.getCurrentPlayback && core.getCurrentPlayback()) || null;
}

export function clapprTracks(o, video) {
  const pb = playbackOf(o);
  if (!pb || pb.el !== video) return null;
  const subs = () => (Array.isArray(pb.closedCaptionsTracks) ? pb.closedCaptionsTracks : []);
  const auds = () => each(pb.audioTracks);
  const text = subs().length && "closedCaptionsTrackId" in pb
    ? {
        name: "Clappr",
        list: () => subs().map((t, i) => item(t.id !== undefined ? t.id : i, t.name, t.track && t.track.language)),
        cur: () => (pb.closedCaptionsTrackId === -1 || pb.closedCaptionsTrackId === undefined ? null : pb.closedCaptionsTrackId),
        set(id) {
          pb.closedCaptionsTrackId = id === null ? -1 : id;
        },
      }
    : null;
  const audio = auds().length > 1 && typeof pb.switchAudioTrack === "function"
    ? {
        name: "Clappr",
        list: () => auds().map((t, i) => item(t.id !== undefined ? t.id : i, t.label || t.name, t.language)),
        cur: () => (pb.currentAudioTrack ? pb.currentAudioTrack.id : null),
        set(id) {
          pb.switchAudioTrack(id);
        },
      }
    : null;
  if (text || audio) return { text, audio };
  return pb._hls ? hlsTracks(pb._hls, video) : null;
}
