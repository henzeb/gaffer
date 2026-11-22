import { hlsEncrypted } from "../../media/manifest/hls.js";
import { dashEncrypted } from "../../media/manifest/dash.js";

export function manifestEncrypted(text) {
  return hlsEncrypted(text) || dashEncrypted(text);
}

export function policyReason({ mediaKeys = null, encryptedEvent = false, manifests = [], playerEncrypted = false } = {}) {
  if (mediaKeys || encryptedEvent) return "drm";
  if (playerEncrypted || manifests.some((m) => manifestEncrypted(m))) return "encrypted";
  return null;
}

export function noDownload(controlsList) {
  return /(^|\s)nodownload(\s|$)/i.test(controlsList || "");
}

export function hlsPlayerEncrypted(h) {
  try {
    const levels = h.levels || [];
    for (let i = 0; i < levels.length; i++) {
      const d = levels[i] && levels[i].details;
      if (!d) continue;
      if (d.encryptedFragments && d.encryptedFragments.length) return true;
      const frags = d.fragments || [];
      for (let j = 0; j < Math.min(frags.length, 3); j++) {
        const k = frags[j].decryptdata || (frags[j].levelkeys && Object.values(frags[j].levelkeys)[0]);
        if (k && k.method && String(k.method).toUpperCase() !== "NONE") return true;
      }
    }
  } catch (e) {}
  return false;
}
