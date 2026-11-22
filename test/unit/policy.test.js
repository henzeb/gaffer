import { test } from "node:test";
import assert from "node:assert/strict";
import { policyReason, noDownload, hlsPlayerEncrypted } from "../../src/direct/record/policy.js";

test("DRM and encryption block, nodownload only warns", () => {
  assert.equal(policyReason({}), null);
  assert.equal(policyReason({ mediaKeys: {} }), "drm");
  assert.equal(policyReason({ encryptedEvent: true }), "drm");
  assert.equal(policyReason({ manifests: ["#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n"] }), "encrypted");
  assert.equal(policyReason({ manifests: ["#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n"] }), null);
  assert.equal(policyReason({ manifests: ['<MPD><Period><AdaptationSet><ContentProtection schemeIdUri="x"/></AdaptationSet></Period></MPD>'] }), "encrypted");
  assert.equal(policyReason({ playerEncrypted: true }), "encrypted");
  assert.equal(policyReason({ mediaKeys: {}, playerEncrypted: true }), "drm");
  assert.equal(noDownload("nofullscreen nodownload"), true);
  assert.equal(noDownload("noremoteplayback"), false);
  assert.equal(noDownload(null), false);
});

test("hls.js levels with encrypted fragments are recognised", () => {
  assert.equal(hlsPlayerEncrypted({ levels: [{ details: { encryptedFragments: [{}] } }] }), true);
  assert.equal(hlsPlayerEncrypted({ levels: [{ details: { fragments: [{ decryptdata: { method: "AES-128" } }] } }] }), true);
  assert.equal(hlsPlayerEncrypted({ levels: [{ details: { fragments: [{ decryptdata: { method: "NONE" } }] } }] }), false);
  assert.equal(hlsPlayerEncrypted({ levels: [{}] }), false);
});
