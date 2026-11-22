import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTime } from "../../src/direct/playback/seek.js";
import { summarizeManifest } from "../../src/inspect/report/manifests.js";
import { t } from "../../src/shared/i18n.js";

test("formatTime", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3725), "1:02:05");
  assert.equal(formatTime(Infinity), "0:00");
  assert.equal(formatTime(-3), "0:00");
});

test("summarizeManifest: HLS master and media playlist", () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,NAME="hd",CODECS="avc1.64001f"\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=500000\n360.m3u8\n';
  assert.deepEqual(summarizeManifest(master), ["HLS master playlist with 2 variants:", "   1280x720 @ 1500 kbps name hd codecs avc1.64001f", "   ? @ 500 kbps"]);
  assert.deepEqual(summarizeManifest("#EXTM3U\n#EXTINF:6,\na.ts\n"), [t("inspect.manifest.hlsMedia")]);
  assert.deepEqual(summarizeManifest("hello"), [t("inspect.manifest.unknown", { n: 5 })]);
  assert.deepEqual(summarizeManifest("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n")[0], "HLS master playlist with 1 variant:");
});

test("typeOf: a string is only shortened where it holds an address", async () => {
  const { typeOf } = await import("../../src/inspect/report/format.js");
  globalThis.location = { href: "https://page.test/" };
  assert.equal(typeOf("hello world"), 'string "hello world"');
  assert.equal(typeOf("see https://cdn.test/v.m3u8?token=1"), 'string "see https://cdn.test/v.m3u8?…"');
  delete globalThis.location;
});
