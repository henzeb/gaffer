const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function decode(s) {
  return s.replace(/&(lt|gt|amp|quot|apos);/g, (m, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[e]);
}

function local(name) {
  const i = name.indexOf(":");
  return i < 0 ? name : name.slice(i + 1);
}

export function parseXml(text) {
  const root = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[3]) {
      if (m[2]) {
        const name = local(m[3]);
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === name) {
            stack.length = i;
            break;
          }
        }
        continue;
      }
      const node = { name: local(m[3]), attrs: {}, children: [], text: "" };
      let a;
      ATTR.lastIndex = 0;
      while ((a = ATTR.exec(m[4] || ""))) node.attrs[local(a[1])] = decode(a[2] !== undefined ? a[2] : a[3]);
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[1] !== undefined) top.text += m[1];
    else if (m[6]) top.text += decode(m[6]);
  }
  return root;
}

const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const kid = (n, name) => kids(n, name)[0] || null;

export function isoDuration(s) {
  const m = /^-?P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s || "");
  if (!m) return NaN;
  const n = (i) => parseFloat(m[i] || "0");
  return n(1) * 31536000 + n(2) * 2592000 + n(3) * 604800 + n(4) * 86400 + n(5) * 3600 + n(6) * 60 + n(7);
}

function resolve(u, base) {
  try {
    return new URL(u, base).href;
  } catch (e) {
    return u;
  }
}

function baseOf(node, base) {
  const b = kid(node, "BaseURL");
  return b && b.text.trim() ? resolve(b.text.trim(), base) : base;
}

function hasProtection(n) {
  if (n.name === "ContentProtection") return true;
  return n.children.some(hasProtection);
}

export function dashEncrypted(text) {
  return /<(\w+:)?ContentProtection[\s>/]/.test(text || "");
}

function pad(n, width) {
  let s = String(n);
  while (s.length < width) s = "0" + s;
  return s;
}

export function fillTemplate(tpl, vars) {
  return tpl.replace(/\$(RepresentationID|Number|Time|Bandwidth|)([^$]*)\$/g, (m, name, fmt) => {
    if (!name) return fmt ? m : "$";
    const v = vars[name];
    if (v === undefined) return m;
    const w = /0?(\d+)d$/.exec(fmt);
    return w && name !== "RepresentationID" ? pad(v, +w[1]) : String(v);
  });
}

function merged(nodes, name) {
  const found = nodes.map((n) => kid(n, name)).filter(Boolean);
  if (!found.length) return null;
  const out = { attrs: {}, timeline: null, initialization: null, urls: null };
  found.forEach((f) => {
    Object.assign(out.attrs, f.attrs);
    const tl = kid(f, "SegmentTimeline");
    if (tl) out.timeline = kids(tl, "S").map((s) => ({ t: s.attrs.t !== undefined ? +s.attrs.t : null, d: +s.attrs.d || 0, r: s.attrs.r !== undefined ? +s.attrs.r : 0 }));
    const init = kid(f, "Initialization");
    if (init) out.initialization = init.attrs;
    const urls = kids(f, "SegmentURL");
    if (urls.length) out.urls = urls.map((u) => u.attrs);
  });
  return out;
}

function byteRange(s) {
  const m = /^(\d+)-(\d+)$/.exec(s || "");
  return m ? { offset: +m[1], length: +m[2] - +m[1] + 1 } : null;
}

function segmentsFor(rep, chain, base, periodStart, periodDuration) {
  const vars = { RepresentationID: rep.id, Bandwidth: rep.bandwidth };
  const tpl = merged(chain, "SegmentTemplate");
  if (tpl) {
    const a = tpl.attrs;
    const scale = +a.timescale || 1;
    const offset = +a.presentationTimeOffset || 0;
    const startNumber = a.startNumber !== undefined ? +a.startNumber : 1;
    const init = a.initialization ? { uri: resolve(fillTemplate(a.initialization, vars), base), range: null } : null;
    const segs = [];
    if (tpl.timeline) {
      let t = 0;
      let n = startNumber;
      const end = isFinite(periodDuration) ? periodDuration * scale + offset : Infinity;
      tpl.timeline.forEach((s, i) => {
        if (s.t !== null) t = s.t;
        let count = s.r + 1;
        if (s.r < 0) {
          const nextT = tpl.timeline[i + 1] && tpl.timeline[i + 1].t !== null ? tpl.timeline[i + 1].t : end;
          count = isFinite(nextT) && s.d ? Math.ceil((nextT - t) / s.d) : 0;
        }
        for (let k = 0; k < count; k++) {
          segs.push({ uri: resolve(fillTemplate(a.media || "", { ...vars, Number: n, Time: t }), base), start: periodStart + (t - offset) / scale, duration: s.d / scale, range: null });
          t += s.d;
          n++;
        }
      });
    } else if (+a.duration) {
      const d = +a.duration / scale;
      const count = isFinite(periodDuration) ? Math.ceil(periodDuration / d - 1e-6) : 0;
      for (let k = 0; k < count; k++) {
        segs.push({ uri: resolve(fillTemplate(a.media || "", { ...vars, Number: startNumber + k, Time: Math.round(k * +a.duration) }), base), start: periodStart + k * d, duration: Math.min(d, periodDuration - k * d), range: null });
      }
    }
    return { init, segments: segs };
  }
  const list = merged(chain, "SegmentList");
  if (list && list.urls) {
    const a = list.attrs;
    const scale = +a.timescale || 1;
    const d = (+a.duration || 0) / scale;
    const init = list.initialization ? { uri: resolve(list.initialization.sourceURL || "", base), range: byteRange(list.initialization.range) } : null;
    return {
      init,
      segments: list.urls.map((u, k) => ({ uri: resolve(u.media || "", base), start: periodStart + k * d, duration: d, range: byteRange(u.mediaRange) })),
    };
  }
  return { init: null, segments: [{ uri: base, start: periodStart, duration: periodDuration, range: null, whole: true }] };
}

export function parseMpd(text, url) {
  const doc = parseXml(String(text || ""));
  const mpd = kid(doc, "MPD");
  if (!mpd) return null;
  const live = (mpd.attrs.type || "static") === "dynamic";
  const total = isoDuration(mpd.attrs.mediaPresentationDuration);
  const mpdBase = baseOf(mpd, url);
  const periods = kids(mpd, "Period");
  const reps = new Map();
  let start = 0;
  periods.forEach((p, pi) => {
    const pStart = p.attrs.start ? isoDuration(p.attrs.start) : start;
    const next = periods[pi + 1] && periods[pi + 1].attrs.start ? isoDuration(periods[pi + 1].attrs.start) : NaN;
    const pDur = p.attrs.duration ? isoDuration(p.attrs.duration) : isFinite(next) ? next - pStart : total - pStart;
    const pBase = baseOf(p, mpdBase);
    kids(p, "AdaptationSet").forEach((as, ai) => {
      const asBase = baseOf(as, pBase);
      kids(as, "Representation").forEach((r) => {
        const mime = r.attrs.mimeType || as.attrs.mimeType || "";
        const type = as.attrs.contentType || mime.split("/")[0] || (r.attrs.width || as.attrs.maxWidth ? "video" : "");
        const id = r.attrs.id || ai + "-" + reps.size;
        const rep = {
          id,
          kind: type === "video" || type === "audio" ? type : "other",
          mime,
          codecs: r.attrs.codecs || as.attrs.codecs || "",
          bandwidth: +r.attrs.bandwidth || 0,
          width: +(r.attrs.width || as.attrs.width || 0),
          height: +(r.attrs.height || as.attrs.height || 0),
          language: as.attrs.lang || "",
        };
        const seg = segmentsFor(rep, [p, as, r], baseOf(r, asBase), pStart, pDur);
        // Every period can have its own init segment.
        seg.segments.forEach((x) => (x.init = seg.init));
        const key = id + "|" + rep.kind;
        if (reps.has(key)) reps.get(key).segments.push(...seg.segments);
        else reps.set(key, { ...rep, init: seg.init, segments: seg.segments });
      });
    });
    start = pStart + (isFinite(pDur) ? pDur : 0);
  });
  return {
    kind: "dash",
    live,
    duration: isFinite(total) ? total : start,
    representations: [...reps.values()],
    encrypted: hasProtection(mpd),
  };
}
