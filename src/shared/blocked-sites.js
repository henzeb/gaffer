// Sites whose terms forbid downloading and whose owners can hold Gaffer to that
// in the Chrome Web Store (SPEC §11.10.1, §8 decision 12). Fixed in the code,
// never fetched. A domain covers all its subdomains.
export const BLOCKED_SITES = [
  // Tier 1: enforced by Google itself.
  "youtube.com", "youtube-nocookie.com", "youtubekids.com",
  // Tier 2: streaming.
  "netflix.com", "disneyplus.com", "primevideo.com", "max.com", "hbomax.com", "hulu.com", "tv.apple.com",
  "paramountplus.com", "peacocktv.com", "crunchyroll.com", "dazn.com", "viaplay.com", "skyshowtime.com",
  "videoland.com", "npo.nl", "nlziet.nl", "ziggogo.tv", "tv.kpn.com",
  // Tier 2: music.
  "spotify.com", "deezer.com", "soundcloud.com", "music.apple.com",
  // Tier 2: social media.
  "instagram.com", "facebook.com", "tiktok.com", "x.com", "twitter.com", "twitch.tv", "snapchat.com", "linkedin.com",
  // Tier 2: paid courses.
  "udemy.com", "coursera.org", "skillshare.com", "masterclass.com", "domestika.org",
  // Tier 2: paid creators.
  "onlyfans.com", "fansly.com", "patreon.com",
];

function clean(host) {
  return String(host || "").toLowerCase().replace(/\.$/, "");
}

// Extra hosts from the test setting __gafferBlockedHosts. It can only add
// blocks, never lift one, so a page setting it gains nothing.
function extra() {
  const list = globalThis.__gafferBlockedHosts;
  return Array.isArray(list) ? list.map(clean).filter(Boolean) : [];
}

export function blockedHost(host, more = extra()) {
  const h = clean(host);
  if (!h) return false;
  return BLOCKED_SITES.concat(more).some((d) => h === d || h.endsWith("." + d));
}

function hostOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch (e) {
    return "";
  }
}

// The frame itself and every page around it count, so an embedded player of a
// blocked site is blocked everywhere, and so is any frame inside a blocked page.
export function blockedPage(loc = globalThis.location) {
  if (!loc) return false;
  const more = extra();
  if (blockedHost(loc.hostname, more)) return true;
  const anc = loc.ancestorOrigins;
  if (anc) for (let i = 0; i < anc.length; i++) if (blockedHost(hostOf(anc[i]), more)) return true;
  return false;
}
