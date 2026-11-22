import { sortedList, labelFor, call, holds, each } from "./common.js";

function track(p) {
  const tracks = each(p.videoTracks);
  return tracks.filter((t) => t && t.enabled !== false && each(t.qualities).length > 1)[0] || null;
}

export function theoAdapterFor(p) {
  if (!p || !p.videoTracks || !holds(p.element)) return null;
  if (!track(p)) return null;
  const qualities = () => {
    const t = track(p);
    return t ? each(t.qualities) : [];
  };
  return {
    list() {
      return sortedList(qualities().map((x) => ({ id: x.id, h: x.height || 0, br: x.bandwidth || 0, label: x.height ? x.height + "p" : x.name || x.label || labelFor(0, x.bandwidth) })));
    },
    cur() {
      const t = track(p);
      if (!t) return null;
      const tq = t.targetQuality;
      const one = Array.isArray(tq) ? (tq.length === 1 ? tq[0] : null) : tq;
      return one ? one.id : "auto";
    },
    set(id) {
      const t = track(p);
      if (!t) return;
      if (id === "auto") {
        t.targetQuality = undefined;
        return;
      }
      const x = each(t.qualities).filter((y) => String(y.id) === String(id))[0];
      if (x) t.targetQuality = x;
    },
  };
}
