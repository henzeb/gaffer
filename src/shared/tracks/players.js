import { call, each, holds, item, isCaption, modeText, enabledAudio } from "./common.js";
import { hlsTracks, dashTracks } from "./libraries.js";

// The JW Player that holds this video: jwplayer() alone gives the first one on
// the page; by the id or the element of its box the others.
export function jwPlayer(video) {
  const jw = window.jwplayer;
  if (typeof jw !== "function") return null;
  const box = video && video.closest ? video.closest(".jwplayer") : null;
  const tries = [() => jw()];
  if (box && box.id) tries.push(() => jw(box.id));
  if (box) tries.push(() => jw(box));
  for (const f of tries) {
    const jp = call(f);
    if (jp && typeof jp.getContainer === "function" && holds(call(() => jp.getContainer()), video)) return jp;
  }
  return null;
}

export function jwTracks(video) {
  const jp = jwPlayer(video);
  if (!jp) return null;
  const caps = () => call(() => jp.getCaptionsList()) || [];
  const auds = () => call(() => jp.getAudioTracks()) || [];
  const text = typeof jp.setCurrentCaptions === "function" && caps().length > 1
    ? {
        name: "JW Player",
        list: () => caps().slice(1).map((c, i) => item(i + 1, c.label, c.language)),
        cur() {
          const i = call(() => jp.getCurrentCaptions());
          return typeof i === "number" && i > 0 ? i : null;
        },
        set(id) {
          jp.setCurrentCaptions(id === null ? 0 : id);
        },
      }
    : null;
  const audio = typeof jp.setCurrentAudioTrack === "function" && auds().length > 1
    ? {
        name: "JW Player",
        list: () => auds().map((a, i) => item(i, a.name || a.label, a.language)),
        cur() {
          const i = call(() => jp.getCurrentAudioTrack());
          return typeof i === "number" && i >= 0 ? i : null;
        },
        set(id) {
          jp.setCurrentAudioTrack(id);
        },
      }
    : null;
  return { text, audio };
}

export function videojsPlayer(video) {
  const vj = window.videojs;
  if (!vj) return null;
  const ps = call(() => (vj.getPlayers ? vj.getPlayers() : vj.players));
  if (ps) {
    for (const k in ps) {
      const p = ps[k];
      if (p && typeof p.el === "function" && holds(call(() => p.el()), video)) return p;
    }
  }
  const host = video.closest && video.closest(".video-js");
  if (host && host.id && typeof vj.getPlayer === "function") return call(() => vj.getPlayer(host.id));
  return null;
}

export function videojsTracks(video) {
  const p = videojsPlayer(video);
  if (!p) return null;
  return {
    text: typeof p.textTracks === "function" ? modeText("video.js", () => p.textTracks()) : null,
    audio: typeof p.audioTracks === "function" ? enabledAudio("video.js", () => p.audioTracks()) : null,
  };
}

export function plyrInstance(video) {
  if (video.plyr) return video.plyr;
  const box = video.closest && video.closest(".plyr");
  return box && box.plyr ? box.plyr : null;
}

export function plyrTracks(video) {
  const p = plyrInstance(video);
  if (!p || typeof p.toggleCaptions !== "function") return null;
  const tracks = () => each(video.textTracks).filter(isCaption);
  if (!tracks().length) return { text: null, audio: null };
  return {
    text: {
      name: "Plyr",
      list: () => tracks().map((t, i) => item(i, t.label, t.language)),
      cur() {
        const on = p.captions ? p.captions.active : false;
        return on && typeof p.currentTrack === "number" && p.currentTrack >= 0 ? p.currentTrack : null;
      },
      set(id) {
        if (id === null) {
          p.toggleCaptions(false);
          return;
        }
        p.currentTrack = id;
        p.toggleCaptions(true);
      },
    },
    audio: null,
  };
}

function kalturaPlayer(video) {
  const K = window.KalturaPlayer;
  if (!K || typeof K.getPlayers !== "function") return null;
  const ps = call(() => K.getPlayers()) || {};
  for (const k in ps) {
    const p = ps[k];
    if (p && typeof p.getVideoElement === "function" && call(() => p.getVideoElement()) === video) return p;
  }
  return null;
}

function kalturaId(t, i) {
  return t.index !== undefined ? t.index : i;
}

export function kalturaTracks(video) {
  const p = kalturaPlayer(video);
  if (!p || typeof p.getTracks !== "function" || typeof p.selectTrack !== "function") return null;
  const T = p.Track || {};
  const all = (type) => call(() => p.getTracks(type)) || [];
  const subs = () => all(T.TEXT || "text").filter((t) => t.language !== "off");
  const auds = () => all(T.AUDIO || "audio");
  const text = subs().length
    ? {
        name: "Kaltura",
        list: () => subs().map((t, i) => item(kalturaId(t, i), t.label, t.language)),
        cur() {
          const l = subs();
          const i = l.findIndex((t) => t.active);
          return i < 0 ? null : kalturaId(l[i], i);
        },
        set(id) {
          if (id === null) {
            const off = all(T.TEXT || "text").filter((t) => t.language === "off")[0];
            if (off) p.selectTrack(off);
            else if (typeof p.hideTextTrack === "function") p.hideTextTrack();
            return;
          }
          const t = subs().filter((x, i) => kalturaId(x, i) === id)[0];
          if (!t) return;
          if (typeof p.showTextTrack === "function") call(() => p.showTextTrack());
          p.selectTrack(t);
        },
      }
    : null;
  const audio = auds().length > 1
    ? {
        name: "Kaltura",
        list: () => auds().map((t, i) => item(kalturaId(t, i), t.label, t.language)),
        cur() {
          const l = auds();
          const i = l.findIndex((t) => t.active);
          return i < 0 ? null : kalturaId(l[i], i);
        },
        set(id) {
          const t = auds().filter((x, i) => kalturaId(x, i) === id)[0];
          if (t) p.selectTrack(t);
        },
      }
    : null;
  return { text, audio };
}

export function flowplayerTracks(video) {
  const fp = window.flowplayer;
  if (!fp) return null;
  const list = each(call(() => fp.instances) || []);
  for (let i = 0; i < list.length; i++) {
    const api = list[i];
    if (!api) continue;
    const owns = holds(api.root, video) || holds(api.container, video) || holds(api.el, video) || holds(call(() => api.getVideoElement && api.getVideoElement()), video);
    if (!owns) continue;
    const engine = api.engine || {};
    const inner = [engine.hlsjs, engine.hls, api.hls, engine.dash, api.dash];
    for (let j = 0; j < inner.length; j++) {
      const r = inner[j] && (call(() => hlsTracks(inner[j], video)) || call(() => dashTracks(inner[j], video)));
      if (r) return r;
    }
  }
  return null;
}

// Vidstack: the <media-player> around the video, with its own lists of
// qualities, text tracks and audio tracks.
export function vidstackPlayer(video) {
  return (video && video.closest && video.closest("media-player")) || null;
}

// A list of Vidstack, or anything array-like.
export function listOf(l) {
  return l && typeof l.toArray === "function" ? l.toArray() : l;
}

export function vidstackTracks(video) {
  const p = vidstackPlayer(video);
  if (!p) return null;
  const auds = () => each(call(() => listOf(p.audioTracks)));
  const audio = auds().length > 1
    ? {
        name: "Vidstack",
        list: () => auds().map((t, i) => item(i, t.label, t.language)),
        cur() {
          const i = auds().findIndex((t) => t.selected);
          return i < 0 ? null : i;
        },
        set(id) {
          const t = auds()[id];
          if (t) t.selected = true;
        },
      }
    : null;
  return { text: modeText("Vidstack", () => listOf(p.textTracks)), audio };
}
