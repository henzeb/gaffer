export const QUALITY_WORDS = { lq: 1, sd: 2, sq: 2, hq: 3, hd: 4, fhd: 5, qhd: 6, uhd: 7, "4k": 7, "8k": 8 };

export function dedupe(options) {
  const seen = {};
  const out = [];
  options.forEach((x) => {
    if (seen[x.label]) return;
    seen[x.label] = 1;
    out.push(x);
  });
  return out;
}

export function guessQuality(t) {
  t = String(t || "");
  let m = t.match(/(\d{3,4})\s?p/i);
  if (m) return { label: m[1] + "p", h: +m[1] };
  m = t.match(/(^|[^a-z0-9])(lq|sd|sq|hq|hd|fhd|qhd|uhd|4k|8k)([^a-z0-9]|$)/i);
  if (m) return { label: m[2].toUpperCase(), h: QUALITY_WORDS[m[2].toLowerCase()] };
  return null;
}

export const ORIGINAL_H = 99998;

export function isOriginal(label) {
  const t = String(label || "");
  return !/\d/.test(t) && /(^|[^a-z])(origine(el|le)?|original|source|bron)([^a-z]|$)/i.test(t);
}

export function heightOf(label) {
  const g = guessQuality(label);
  return g ? g.h : isOriginal(label) ? ORIGINAL_H : 0;
}

function rank(x) {
  const label = String(x.label || "");
  return [isOriginal(label) ? 1 : 0, x.h || heightOf(label), x.br || 0, /p\s?60(?!\d)|60\s?fps/i.test(label) ? 1 : 0, /source|origin|bron/i.test(label) ? 1 : 0];
}

export function isAuto(x) {
  return x.id === "auto" || /^auto\b/i.test(String(x.label || ""));
}

export function bestQuality(list) {
  let best = null;
  let br = null;
  list.forEach((x) => {
    const r = rank(x);
    if (best) {
      let i = 0;
      while (i < r.length && r[i] === br[i]) i++;
      if (i === r.length || r[i] < br[i]) return;
    }
    best = x;
    br = r;
  });
  return best;
}
