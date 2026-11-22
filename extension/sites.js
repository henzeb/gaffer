export const SITE_PREFIX = "site:";

const WEB_STORE = ["chromewebstore.google.com", "chrome.google.com"];

export function siteOf(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function pageHost(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (WEB_STORE.includes(u.hostname)) return null;
  return u.hostname ? siteOf(u.hostname) : null;
}

export function covers(site, host) {
  return host === site || host.endsWith("." + site);
}

export const DEFAULT_KEY = "default";

export function rulesFrom(items) {
  const sites = {};
  for (const k of Object.keys(items)) {
    if (k.startsWith(SITE_PREFIX) && typeof items[k] === "boolean") sites[k.slice(SITE_PREFIX.length)] = items[k];
  }
  return { def: items[DEFAULT_KEY] === true, sites };
}

export function ruleFor(host, rules) {
  if (!host) return { on: false, via: null };
  let via = null;
  for (const site of Object.keys(rules.sites)) {
    if (covers(site, host) && (via === null || site.length > via.length)) via = site;
  }
  return via === null ? { on: rules.def, via: null } : { on: rules.sites[via], via };
}

export function isOn(host, rules) {
  return !!host && ruleFor(host, rules).on;
}

// Gaffer is on somewhere, but the permission for all sites was taken away
// (chrome://extensions): then nothing runs, whatever the rules say.
export function accessLost(rules, granted) {
  return !granted && anyOn(rules);
}

export function anyOn(rules) {
  return rules.def || Object.values(rules.sites).includes(true);
}

export function switchSite(host, on, rules) {
  const sites = { ...rules.sites };
  const next = () => ({ def: rules.def, sites });
  const r = ruleFor(host, next());
  if (r.on === on) return {};
  const changes = {};
  if (r.via !== null) {
    delete sites[r.via];
    changes[SITE_PREFIX + r.via] = null;
  }
  if (ruleFor(host, next()).on !== on) {
    sites[siteOf(host)] = on;
    changes[SITE_PREFIX + siteOf(host)] = on;
  }
  return changes;
}

export function rulesBefore(after, changes) {
  const before = { def: after.def, sites: { ...after.sites } };
  for (const k of Object.keys(changes)) {
    const old = changes[k].oldValue;
    if (k === DEFAULT_KEY) before.def = old === true;
    else if (k.startsWith(SITE_PREFIX)) {
      const site = k.slice(SITE_PREFIX.length);
      if (typeof old === "boolean") before.sites[site] = old;
      else delete before.sites[site];
    }
  }
  return before;
}

export function fillPrelude(prelude, rules, code) {
  return prelude.replace("__RULES__", () => JSON.stringify({ d: rules.def, s: rules.sites })).replace("__MODULE__", () => code);
}

// Match patterns for a site and all its subdomains. Patterns ignore the port.
function patterns(site) {
  return site.startsWith("[") ? [`*://${site}/*`] : [`*://${site}/*`, `*://*.${site}/*`];
}

// The content scripts for the top frame (§4.5): one per part of the web where
// Gaffer is on. Each part is a rule that says on (or the default), minus every
// rule below it; a rule below it that says on again gets its own part. So a
// page matches exactly the part of its closest rule.
export function contentScripts(rules) {
  const sites = Object.keys(rules.sites).sort();
  const below = (site) => sites.filter((s) => s !== site && covers(site, s));
  const out = [];
  if (rules.def) out.push({ key: "*", matches: ["*://*/*"], excludeMatches: sites.flatMap(patterns) });
  for (const site of sites) if (rules.sites[site]) out.push({ key: site, matches: patterns(site), excludeMatches: below(site).flatMap(patterns) });
  return out;
}
