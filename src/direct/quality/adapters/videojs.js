import { state as s } from "../../state.js";
import { dedupe, guessQuality, heightOf } from "../labels.js";
import { t } from "../../../shared/i18n.js";

function player() {
  try {
    const vj = window.videojs;
    if (!vj) return null;
    const ps = vj.getPlayers ? vj.getPlayers() : vj.players;
    if (ps) {
      for (const k in ps) {
        const p = ps[k];
        if (p && p.el && p.el() && p.el().contains(s.v)) return p;
      }
    }
    const host = s.v.closest && s.v.closest(".video-js");
    if (host && host.id && vj.getPlayer) return vj.getPlayer(host.id) || null;
  } catch (e) {}
  return null;
}

function levelsAdapter(ql) {
  return {
    list() {
      const a = [];
      for (let i = 0; i < ql.length; i++) a.push({ id: i, h: ql[i].height || 0, br: ql[i].bitrate || 0, label: ql[i].height ? ql[i].height + "p" : Math.round((ql[i].bitrate || 0) / 1000) + "k" });
      a.sort((x, y) => y.h - x.h || y.br - x.br);
      return dedupe([{ id: "auto", label: t("direct.quality.auto") }].concat(a));
    },
    cur() {
      let en = 0;
      let last = -1;
      for (let i = 0; i < ql.length; i++) {
        if (ql[i].enabled) {
          en++;
          last = i;
        }
      }
      return en === ql.length ? "auto" : last;
    },
    set(id) {
      for (let i = 0; i < ql.length; i++) ql[i].enabled = id === "auto" || i === id;
    },
  };
}

function sourcesAdapter(p, cs) {
  function lab(x, i) {
    if (x.label) return { label: String(x.label), h: heightOf(x.label) };
    if (x.res) return { label: x.res + "p", h: +x.res };
    const g = guessQuality((x.src || "").split("?")[0].split("/").pop());
    return g || { label: t("direct.quality.source", { number: i + 1 }), h: 0 };
  }
  return {
    list() {
      const o = cs.map((x, i) => {
        const l = lab(x, i);
        return { id: i, label: l.label, h: l.h, tip: (x.src || "").split("?")[0].split("/").pop() };
      });
      o.sort((a, b) => b.h - a.h);
      return o;
    },
    cur() {
      let c = "";
      try {
        c = p.currentSrc();
      } catch (e) {}
      for (let i = 0; i < cs.length; i++) if (cs[i].src === c) return i;
      return null;
    },
    set(id) {
      const x = cs[id];
      if (!x) return;
      let t = 0;
      let pa = true;
      let rt = 1;
      try {
        t = p.currentTime();
        pa = p.paused();
        rt = p.playbackRate();
      } catch (e) {}
      p.src({ src: x.src, type: x.type });
      p.one("loadedmetadata", () => {
        try {
          p.currentTime(t);
          p.playbackRate(rt);
        } catch (e) {}
        if (!pa) {
          const pr = p.play();
          if (pr && pr.catch) pr.catch(() => {});
        }
      });
    },
  };
}

export function videojsAdapter() {
  try {
    const vp = player();
    if (!vp) return null;
    if (typeof vp.qualityLevels === "function") {
      const ql = vp.qualityLevels();
      if (ql && ql.length > 1) return levelsAdapter(ql);
    }
    let cs = [];
    try {
      cs = (vp.currentSources() || []).filter((x) => x && x.src);
    } catch (e) {}
    const sd = {};
    cs = cs.filter((x) => {
      if (sd[x.src]) return false;
      sd[x.src] = 1;
      return true;
    });
    if (cs.length > 1) return sourcesAdapter(vp, cs);
  } catch (e) {}
  return null;
}
