import { test } from "node:test";
import assert from "node:assert/strict";
import { guessQuality, dedupe, isOriginal, heightOf, bestQuality, isAuto, ORIGINAL_H } from "../../src/direct/quality/labels.js";

test("guessQuality recognises resolutions and words", () => {
  assert.deepEqual(guessQuality("1080p"), { label: "1080p", h: 1080 });
  assert.deepEqual(guessQuality("HD 720 p60"), { label: "720p", h: 720 });
  assert.deepEqual(guessQuality("Full HD"), { label: "HD", h: 4 });
  assert.deepEqual(guessQuality("4k"), { label: "4K", h: 7 });
  assert.equal(guessQuality("Auto"), null);
  assert.equal(guessQuality(null), null);
});

test("dedupe keeps the first option per label", () => {
  assert.deepEqual(dedupe([{ id: 1, label: "720p" }, { id: 2, label: "720p" }, { id: 3, label: "360p" }]), [{ id: 1, label: "720p" }, { id: 3, label: "360p" }]);
});

test("isOriginal recognises Origineel, Original, Source and Bron without a number", () => {
  for (const t of ["Origineel", "Original", "Source", "Bron", "original (source)"]) assert.equal(isOriginal(t), true, t);
  for (const t of ["1080p Source", "Bron 1", "720p", "Auto", "Resource", ""]) assert.equal(isOriginal(t), false, t);
  assert.equal(heightOf("Origineel"), ORIGINAL_H);
  assert.equal(heightOf("720p"), 720);
  assert.equal(heightOf("unknown"), 0);
});

test("bestQuality: Original above all options with a number", () => {
  assert.equal(bestQuality([{ id: 1, label: "2160p", h: 2160 }, { id: 2, label: "Origineel" }, { id: 3, label: "720p" }]).id, 2);
});

test("bestQuality: highest resolution, then bitrate, then 60, then Source, then the topmost", () => {
  assert.equal(bestQuality([{ id: 1, label: "720p" }, { id: 2, label: "1080p" }]).id, 2);
  assert.equal(bestQuality([{ id: 1, label: "1080p", h: 1080, br: 3e6 }, { id: 2, label: "1080p", h: 1080, br: 6e6 }]).id, 2);
  assert.equal(bestQuality([{ id: 1, label: "1080p" }, { id: 2, label: "1080p60" }, { id: 3, label: "1080p Source" }]).id, 2);
  assert.equal(bestQuality([{ id: 1, label: "1080p" }, { id: 2, label: "1080p (source)" }]).id, 2);
  assert.equal(bestQuality([{ id: 1, label: "1080p" }, { id: 2, label: "1080p" }]).id, 1);
  assert.equal(bestQuality([]), null);
});

test("isAuto: id auto or a label that starts with Auto", () => {
  assert.equal(isAuto({ id: "auto", label: "Auto" }), true);
  assert.equal(isAuto({ id: "Auto (720p)", label: "Auto (720p)" }), true);
  assert.equal(isAuto({ id: 1, label: "720p" }), false);
});
