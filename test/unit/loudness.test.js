import { test } from "node:test";
import assert from "node:assert/strict";
import { createBlocks, volumeFor, stepVolumeTo, statedLoudness, parseLevel, blockLoudness, YOUNG } from "../../src/shared/loudness.js";
import { cleanLevel, withRef } from "../../extension/level.js";

const fill = (b, l, n) => { for (let i = 0; i < n; i++) b.add(l); };
const near = (a, b, d = 0.2) => assert.ok(Math.abs(a - b) <= d, a + " ≈ " + b);

test("loudness: energy to LUFS", () => {
  near(blockLoudness(1), -0.69);
  near(blockLoudness(0.01), -20.69);
});

test("loudness: silence and soft parts do not count, a sudden loud part does at once", () => {
  const b = createBlocks();
  assert.equal(b.level(), null);
  fill(b, -90, 50);
  assert.equal(b.level(), null);
  fill(b, -20, 40);
  fill(b, -50, 40);
  near(b.level(), -20);
  const j = createBlocks();
  fill(j, -40, 60);
  near(j.level(), -40);
  fill(j, -15, 3);
  assert.ok(j.level() > -24, String(j.level()));
  j.clear();
  assert.equal(j.level(), null);
});

test("loudness: young until three seconds of sound", () => {
  const b = createBlocks();
  fill(b, -20, YOUNG - 1);
  assert.equal(b.young(), true);
  fill(b, -20, 1);
  assert.equal(b.young(), false);
  assert.equal(b.full(), false);
  fill(b, -20, 120);
  assert.equal(b.full(), true);
});

test("level: every loudness comes out as loud as the reference", () => {
  for (const l of [-8, -14, -20, -26]) near(l + 20 * Math.log10(volumeFor(50, -20, l)), -26.02, 0.001);
  assert.equal(volumeFor(50, -20, -20), 0.5);
  assert.equal(volumeFor(100, -8, -8), 1);
  assert.ok(volumeFor(50, -14, -24) > 1);
  near(volumeFor(60, -20, -14) / volumeFor(50, -20, -14), 1.2, 0.001);
});

test("level: down fast, up slow, never above 1", () => {
  const db = (x) => 20 * Math.log10(x);
  near(db(stepVolumeTo(1, 0.1, false)), -3, 0.01);
  near(db(stepVolumeTo(1, 0.1, true)), -8, 0.01);
  near(db(stepVolumeTo(0.1, 1, false)), -19.6, 0.01);
  near(db(stepVolumeTo(0.1, 1, true)), -18, 0.01);
  assert.equal(stepVolumeTo(0.99, 1, false), 1);
});

test("level: what YouTube states, first about what really plays", () => {
  const r = (audioConfig, adaptiveFormats) => ({ playerConfig: { audioConfig }, streamingData: { adaptiveFormats } });
  const a = { trackAbsoluteLoudnessLkfs: -23.67, perceptualLoudnessDb: -12 };
  assert.equal(statedLoudness(r(a), null), -23.67);
  assert.equal(statedLoudness(r({ perceptualLoudnessDb: -18.7 }), {}), -18.7);
  assert.equal(statedLoudness(r(a), { volume: "100%/100% DRC (cont.-16.9dB tgt.-14.0dB)" }), -16.9);
  const f = [{ itag: 251, trackAbsoluteLoudnessLkfs: -23 }, { itag: 251, isDrc: true, trackAbsoluteLoudnessLkfs: -17 }, { itag: 140, isDrc: true, trackAbsoluteLoudnessLkfs: -5 }];
  assert.equal(statedLoudness(r(a, f), { volume: "100%/100% DRC", codecs: "av01 (397) / opus (251)" }), -17);
  assert.equal(statedLoudness(r(a, f), { volume: "100%/100%", codecs: "av01 (397) / opus (251)" }), -23);
  assert.equal(statedLoudness(r(a, f), { volume: "100%/52% (cont.-99dB)", codecs: "opus" }), -23.67);
  for (const x of [null, {}, r({}), r({ trackAbsoluteLoudnessLkfs: "x" }), r({ trackAbsoluteLoudnessLkfs: -200 })]) assert.equal(statedLoudness(x, null), null);
});

test("level: only a valid setting is accepted, in the module and in the extension", () => {
  assert.deepEqual(parseLevel('{"on":true,"value":50,"x":1}'), { on: true, value: 50, ref: null });
  assert.deepEqual(parseLevel('{"on":true,"value":50,"ref":-16.94}'), { on: true, value: 50, ref: -16.9 });
  for (const ref of [3, -61, '"x"', "null"]) assert.equal(parseLevel(`{"on":true,"value":50,"ref":${ref}}`).ref, null);
  assert.equal(cleanLevel('{"on":true,"value":50,"ref":-16.94}'), '{"on":true,"value":50,"ref":-16.9}');
  assert.equal(cleanLevel('{"on":true,"value":50,"ref":7}'), '{"on":true,"value":50,"ref":null}');
  const on = '{"on":true,"value":50,"ref":null}';
  assert.equal(withRef(on, '{"on":false,"value":9,"ref":-12}'), '{"on":true,"value":50,"ref":-12}');
  for (const [a, b] of [[null, on], [on, on], [on, "x"], ['{"on":false,"value":50,"ref":null}', '{"on":true,"value":50,"ref":-12}']]) assert.equal(withRef(a, b), null);
  assert.equal(cleanLevel('{"on":true,"value":50.4,"x":1}'), '{"on":true,"value":50,"ref":null}');
  for (const bad of [null, "", "x", "{}", '{"on":1,"value":50}', '{"on":true,"value":0}', '{"on":true,"value":101}', '{"on":true,"value":"a"}', "null", "[]"]) {
    assert.equal(parseLevel(bad), null, String(bad));
    assert.equal(cleanLevel(bad), null, String(bad));
  }
});
