import { call } from "./common.js";
import { youtubeTracks } from "./youtube.js";
import { jwTracks, videojsTracks, plyrTracks, kalturaTracks, flowplayerTracks, vidstackTracks } from "./players.js";
import { hlsTracks, shakaTracks, dashTracks, bitmovinTracks, theoTracks, clapprTracks } from "./libraries.js";
import { nativeTracks } from "./native.js";
import { windowObjects } from "../globals.js";

const PLAYERS = [youtubeTracks, jwTracks, videojsTracks, plyrTracks, kalturaTracks, flowplayerTracks, vidstackTracks];
const LIBRARIES = [dashTracks, bitmovinTracks, theoTracks, clapprTracks, hlsTracks, shakaTracks];

export function candidates(video, extra) {
  const own = [video.dash, video.player, video.bitmovinPlayer, video.theoplayer, window.player, video.hls, video._hls, video.shaka];
  return own.concat(extra || [], windowObjects()).filter((c) => c && typeof c === "object");
}

function* sources(video, extra) {
  for (let i = 0; i < PLAYERS.length; i++) yield call(() => PLAYERS[i](video));
  const cands = candidates(video, extra);
  for (let j = 0; j < cands.length; j++) {
    const c = cands[j];
    for (let k = 0; k < LIBRARIES.length; k++) yield call(() => LIBRARIES[k](c, video));
  }
  yield call(() => nativeTracks(video));
}

export function findTracks(video, extra, want = { text: true, audio: true }) {
  const out = { text: null, audio: null };
  if (!video) return out;
  for (const r of sources(video, extra)) {
    if (!r) continue;
    if (want.text && !out.text && r.text) out.text = r.text;
    if (want.audio && !out.audio && r.audio) out.audio = r.audio;
    if ((!want.text || out.text) && (!want.audio || out.audio)) break;
  }
  return out;
}

export { youtubeRates } from "./youtube.js";
