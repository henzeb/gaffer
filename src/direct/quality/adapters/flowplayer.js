import { sortedList, call, holds, each } from "./common.js";
import { hlsAdapterFor } from "./hls.js";
import { dashAdapterFor } from "./dashjs.js";

function owns(api) {
  return holds(api.root) || holds(api.container) || holds(api.el) || holds(call(() => api.getVideoElement && api.getVideoElement()));
}

function ownAdapter(api) {
  const video = api.video || {};
  if (!Array.isArray(video.qualities) || video.qualities.length < 2 || typeof api.quality !== "function") return null;
  return {
    list() {
      return sortedList(
        each(api.video.qualities).map((x, i) => {
          const label = typeof x === "object" ? x.label || String(x.value) : String(x);
          const h = parseInt(label, 10) || 0;
          return { id: i, h, label: h ? h + "p" : label };
        }),
      );
    },
    cur() {
      const q = api.video.quality;
      return q === undefined || q === null || q === -1 ? "auto" : q;
    },
    set(id) {
      api.quality(id === "auto" ? -1 : id);
    },
  };
}

export function flowplayerAdapter() {
  const fp = window.flowplayer;
  if (!fp) return null;
  const list = each(call(() => fp.instances) || []);
  for (let i = 0; i < list.length; i++) {
    const api = list[i];
    if (!api || !owns(api)) continue;
    const own = call(() => ownAdapter(api));
    if (own) return own;
    const engine = api.engine || {};
    const inner = [engine.hlsjs, engine.hls, api.hls, engine.dash, api.dash];
    for (let j = 0; j < inner.length; j++) {
      const a = inner[j] && (call(() => hlsAdapterFor(inner[j])) || call(() => dashAdapterFor(inner[j])));
      if (a) return a;
    }
  }
  return null;
}
