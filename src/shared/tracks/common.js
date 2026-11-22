export function call(fn) {
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

export function each(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  const out = [];
  const n = typeof list.length === "number" ? list.length : 0;
  for (let i = 0; i < n; i++) out.push(typeof list.item === "function" ? list.item(i) : list[i]);
  return out.filter(Boolean);
}

export function holds(el, video) {
  return !!el && (el === video || (typeof el.contains === "function" && el.contains(video)));
}

let names = null;

export function langName(code) {
  if (!code || typeof code !== "string") return "";
  try {
    if (!names) names = new Intl.DisplayNames([navigator.language || "en"], { type: "language" });
    const n = names.of(code);
    return n && n !== code ? n : code;
  } catch (e) {
    return code;
  }
}

export function item(id, label, lang) {
  const l = typeof lang === "string" ? lang : "";
  return { id, label: (typeof label === "string" && label.trim()) || langName(l), lang: l };
}

export function isCaption(t) {
  return !!t && (t.kind === "subtitles" || t.kind === "captions");
}

export function modeText(name, getList) {
  const tracks = () => each(call(getList)).filter(isCaption);
  if (!tracks().length) return null;
  return {
    name,
    list: () => tracks().map((t, i) => item(i, t.label, t.language)),
    cur() {
      const i = tracks().findIndex((t) => t.mode === "showing");
      return i < 0 ? null : i;
    },
    set(id) {
      tracks().forEach((t, i) => {
        t.mode = i === id ? "showing" : "disabled";
      });
    },
  };
}

export function enabledAudio(name, getList) {
  const tracks = () => each(call(getList));
  if (tracks().length < 2) return null;
  return {
    name,
    list: () => tracks().map((t, i) => item(i, t.label, t.language)),
    cur() {
      const i = tracks().findIndex((t) => t.enabled);
      return i < 0 ? null : i;
    },
    set(id) {
      const l = tracks();
      if (l[id]) l[id].enabled = true;
      l.forEach((t, i) => {
        if (i !== id) t.enabled = false;
      });
    },
  };
}
