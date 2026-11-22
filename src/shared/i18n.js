import en from "../../lang/en.json" with { type: "json" };

export function pluralKey(texts, key, params) {
  if (params && typeof params.n === "number" && texts[key + ".singular"] !== undefined) return key + (params.n === 1 ? ".singular" : ".plural");
  return key;
}

export function format(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m));
}

export function translate(texts, fallback, key, params) {
  const k = pluralKey(texts, key, params);
  const text = texts[k] !== undefined ? texts[k] : fallback[pluralKey(fallback, key, params)];
  return text === undefined ? key : format(text, params);
}

export function t(key, params) {
  return translate(en, en, key, params);
}
