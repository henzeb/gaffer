import { state as s } from "../../state.js";
import { t } from "../../../shared/i18n.js";

function hooksPlayer(f) {
  if (!f) return null;
  let ms = f.memoizedState;
  let si = 0;
  while (ms && typeof ms === "object" && si < 30) {
    const val = ms.memoizedState;
    const cs = [val];
    try {
      if (val && typeof val === "object" && val.current) cs.push(val.current);
    } catch (e) {}
    for (let ci = 0; ci < cs.length; ci++) {
      const cur = cs[ci];
      try {
        if (cur && typeof cur === "object" && typeof cur.getBitrates === "function" && typeof cur.setBitrate === "function") return cur;
      } catch (e) {}
    }
    ms = ms.next;
    si++;
  }
  return null;
}

export function findRadiant() {
  let a = s.v;
  for (let k = 0; k < 10 && a; k++) {
    let fk = null;
    try {
      fk = Object.keys(a).filter((x) => x.indexOf("__reactFiber") === 0)[0];
    } catch (e) {}
    if (fk) {
      let f = a[fk];
      for (let n = 0; f && n < 40; n++) {
        const hit = hooksPlayer(f) || hooksPlayer(f.alternate);
        if (hit) return { p: hit, props: f.memoizedProps };
        f = f.return;
      }
    }
    a = a.parentElement;
  }
  return null;
}

function urlOf(x) {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") return x.src || x.url || x.file || x.uri || "";
  return "";
}

function heightOf(x) {
  if (x == null) return 0;
  if (typeof x === "object") {
    const c = [x.height, x.h, x.res, x.resolution, x.quality, x.label, x.name];
    for (let i = 0; i < c.length; i++) {
      const y = c[i];
      if (typeof y === "number" && y >= 100 && y <= 4400) return y;
      if (typeof y === "string") {
        let m = y.match(/(\d{3,4})x(\d{3,4})/);
        if (m) return +m[2];
        m = y.match(/(\d{3,4})p/i);
        if (m) return +m[1];
      }
    }
  }
  if (typeof x === "string") {
    const mm = x.match(/[_-](\d{3,4})p?\.(mp4|webm)/i);
    if (mm) return +mm[1];
  }
  return 0;
}

function tipOf(x, u) {
  let t = "";
  try {
    t = JSON.stringify(x).slice(0, 200);
  } catch (e) {
    t = String(x);
  }
  if (u) {
    try {
      const q = new URL(u, location.href);
      t += "\n" + q.pathname.split("/").pop();
    } catch (e) {}
  }
  return t;
}

export function radiantAdapter(p, props) {
  const learned = {};
  function srcList() {
    try {
      const m = props && props.sources && props.sources.mp4;
      if (Array.isArray(m)) return m.map(urlOf);
      if (typeof m === "string") return [m];
    } catch (e) {}
    return [];
  }
  function raw() {
    try {
      return p.getBitrates() || [];
    } catch (e) {
      return [];
    }
  }
  function curI() {
    try {
      const c = p.getCurrentBitrateIndex();
      if (typeof c === "number" && c >= 0) return c;
    } catch (e) {}
    const r = raw();
    for (let i = 0; i < r.length; i++) if (r[i] && r[i].active) return i;
    return null;
  }
  return {
    list() {
      const c = curI();
      if (c != null && s.v && s.v.videoHeight) learned[c] = s.v.videoHeight;
      const seen = {};
      const o = raw().map((x, i) => {
        const u =
          urlOf(x) ||
          (i === c && typeof p.getSrc === "function"
            ? (() => {
                try {
                  return urlOf(p.getSrc());
                } catch (e) {
                  return "";
                }
              })()
            : "") ||
          srcList()[i] ||
          "";
        const h = heightOf(x) || heightOf(u) || learned[i] || 0;
        let label = h ? h + "p" : u ? (/transcod/i.test(u) ? t("direct.quality.transcoded") : t("direct.quality.original")) : x && x.bitrate ? Math.round(x.bitrate / 1000) + " kbps" : t("direct.quality.source", { number: i + 1 });
        if (h && u && srcList().some((z) => /transcod/i.test(z))) label = /transcod/i.test(u) ? label : t("direct.quality.origSuffix", { label });
        if (seen[label]) label = label + " (" + (i + 1) + ")";
        seen[label] = 1;
        return { id: i, h, label, tip: tipOf(x, u) };
      });
      o.sort((a, b) => b.h - a.h);
      return o;
    },
    cur: curI,
    set(id) {
      p.setBitrate(id);
    },
  };
}
