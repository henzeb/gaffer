import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const media = path.join(import.meta.dirname, "media");
const need = ["v360.mp4", "v720.mp4", "v1080.mp4", "audio-only.mp4", "hls/master.m3u8", "dash/manifest.mpd", "short.mp4", "hls-fmp4/master.m3u8", "frag.mp4", "loud.mp4", "soft.mp4", "frag-mid.mp4", "ts/h264-aac/index.m3u8", "ts/hevc-aac/index.m3u8", "ts/audio-only/index.m3u8", "ts/mp3/index.m3u8", "ts/ac3/index.m3u8", "ts/eac3/index.m3u8", "ts/wrap/index.m3u8", "ts/discontinuity/index.m3u8", "ts/packed/list.csv", "ts/mpeg2.ts"];

export function ensureFixtures() {
  if (need.every((f) => fs.existsSync(path.join(media, f)))) return;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg is missing. It is needed to create the test media (test/fixtures/make.sh).");
  }
  execFileSync(path.join(import.meta.dirname, "make.sh"), { stdio: "inherit" });
}

if (process.argv[1] === import.meta.filename) {
  try {
    ensureFixtures();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
