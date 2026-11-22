import { test } from "node:test";
import assert from "node:assert/strict";
import { chaptersFromResponse, clean } from "../../src/shared/chapters.js";

const response = (...maps) => ({ playerOverlays: { playerOverlayRenderer: { decoratedPlayerBarRenderer: { decoratedPlayerBarRenderer: { playerBar: { multiMarkersPlayerBarRenderer: { markersMap: maps } } } } } } });
const map = (key, ...titles) => ({ key, value: { chapters: titles.map((x, i) => ({ chapterRenderer: { title: { simpleText: x }, timeRangeStartMillis: i * 1500 } })) } });

test("YouTube response: the maker's chapters go before the automatic ones", () => {
  assert.deepEqual(chaptersFromResponse(response(map("AUTO_CHAPTERS", "a", "b"), map("DESCRIPTION_CHAPTERS", "c", "d"))).map((c) => [c.start, c.title.simpleText]), [[0, "c"], [1.5, "d"]]);
  assert.equal(chaptersFromResponse(response(map("AUTO_CHAPTERS", "a", "b"))).length, 2);
  assert.deepEqual(chaptersFromResponse(response({ key: "HEATSEEKER", value: { markers: [] } })), []);
  for (const r of [null, {}, { playerOverlays: {} }, response()]) assert.deepEqual(chaptersFromResponse(r), []);
});

test("chapters are sorted, unusable ones drop out, and one chapter is none", () => {
  assert.deepEqual(clean([{ start: 30, title: "b" }, { start: "0", title: { runs: [{ text: "a" }, { text: "!" }] } }, { start: NaN, title: "x" }, { start: -1, title: "y" }]), [{ start: 0, title: "a!" }, { start: 30, title: "b" }]);
  assert.deepEqual(clean([{ start: 0, title: "a" }]), []);
  assert.deepEqual(clean(null), []);
});
