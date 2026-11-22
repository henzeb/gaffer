import { t } from "../../shared/i18n.js";

const DOM_PLAYERS = [
  [".html5-video-player,#movie_player", "YouTube"],
  [".video-js,[data-vjs-player],video-js", "video.js"],
  [".jwplayer,.jw-wrapper", "JW Player"],
  [".plyr", "Plyr"],
  [".shaka-video-container", "Shaka Player"],
  [".flowplayer,.fp-player", "Flowplayer"],
  [".bitmovinplayer-container,.bmpui-ui-uicontainer", "Bitmovin"],
  [".theoplayer-container,.theo-player", "THEOplayer"],
  [".rmp-container", "Radiant Media Player"],
  [".vp-video-wrapper,.vp-player-layout", "Vimeo"],
  ["[class*='playkit-']", "Kaltura"],
  ["[data-player] .media-control,.media-control-layer", "Clappr"],
  [".bc-player-default_default,[data-video-id][data-account]", "Brightcove"],
  [".mejs__container,.mejs-container", "MediaElement.js"],
  [".fluid_video_wrapper", "Fluid Player"],
  ["media-controller", "Media Chrome"],
  ["media-player", "Vidstack"],
  [".wistia_embed,.w-vulcan-v2,wistia-player", "Wistia"],
  ["mux-player", "Mux Player"],
];

export function domPlayers(v) {
  const found = [];
  DOM_PLAYERS.forEach(([sel, name]) => {
    try {
      const el = v.closest(sel) || (v.parentElement && v.parentElement.querySelector(sel));
      if (el && found.indexOf(name) < 0) found.push(name);
    } catch (e) {}
  });
  return found;
}

export function reportDomPlayers(L, vids) {
  L("== " + t("inspect.report.domPlayers.title"));
  if (!vids.length) {
    L(t("inspect.report.domPlayers.noVideo"));
    return;
  }
  vids.forEach((v, i) => {
    const f = domPlayers(v);
    L("#" + i + ": " + (f.length ? f.join(", ") : t("inspect.report.domPlayers.unknown")));
  });
}
