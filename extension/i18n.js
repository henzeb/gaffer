function name(key) {
  return key.replace(/\./g, "_");
}

export function msg(key, params) {
  let k = key;
  if (params && typeof params.n === "number" && chrome.i18n.getMessage(name(key + ".singular"))) k = key + (params.n === 1 ? ".singular" : ".plural");
  const subs = params ? Object.keys(params).sort().map((p) => String(params[p])) : undefined;
  return chrome.i18n.getMessage(name(k), subs) || key;
}

export function manifestText(value) {
  const m = /^__MSG_(\w+)__$/.exec(value || "");
  return m ? chrome.i18n.getMessage(m[1]) || value : value;
}

export function fillPage(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = msg(el.getAttribute("data-i18n"));
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = msg(el.getAttribute("data-i18n-title"));
}
