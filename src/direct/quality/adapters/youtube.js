import { state as s } from "../../state.js";
import { t } from "../../../shared/i18n.js";

const NAMES = { highres: "4320p", hd2160: "2160p", hd1440: "1440p", hd1080: "1080p", hd720: "720p", large: "480p", medium: "360p", small: "240p", tiny: "144p" };

export function youtubeAdapter() {
  const yt = s.v.closest && s.v.closest(".html5-video-player");
  if (!yt || typeof yt.getAvailableQualityLevels !== "function") return null;
  return {
    list() {
      let l = yt.getAvailableQualityLevels() || [];
      if (l.indexOf("auto") < 0) l = l.concat(["auto"]);
      return l.map((q) => ({ id: q, label: q === "auto" ? t("direct.quality.auto") : NAMES[q] || q }));
    },
    cur() {
      return yt.getPlaybackQuality ? yt.getPlaybackQuality() : null;
    },
    set(id) {
      if (yt.setPlaybackQualityRange) yt.setPlaybackQualityRange(id, id);
      if (yt.setPlaybackQuality) yt.setPlaybackQuality(id);
    },
  };
}
