import { modeText, enabledAudio } from "./common.js";

export function nativeTracks(video) {
  return { text: modeText("<video>", () => video.textTracks), audio: enabledAudio("<video>", () => video.audioTracks) };
}
