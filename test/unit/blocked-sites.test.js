import { test } from "node:test";
import assert from "node:assert/strict";
import { blockedHost, blockedPage, BLOCKED_SITES } from "../../src/shared/blocked-sites.js";

test("block list: domains, subdomains and www match", () => {
  for (const h of ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "WWW.YouTube.com", "youtube.com.", "www.youtube-nocookie.com", "tv.apple.com", "www.netflix.com", "npo.nl", "start.npo.nl", "x.com", "www.linkedin.com"]) {
    assert.equal(blockedHost(h, []), true, h);
  }
});

test("block list: look-alike hosts and other sites do not match", () => {
  for (const h of ["notyoutube.com", "youtube.com.evil.test", "myoutube.com", "apple.com", "www.apple.com", "kpn.com", "box.com", "vimeo.com", "dailymotion.com", "example.com", "127.0.0.1", "", null]) {
    assert.equal(blockedHost(h, []), false, String(h));
  }
});

test("block list: entries are plain lower-case host names without duplicates", () => {
  assert.equal(new Set(BLOCKED_SITES).size, BLOCKED_SITES.length);
  for (const d of BLOCKED_SITES) assert.match(d, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, d);
});

test("blocked page: the frame or any ancestor on the list blocks", () => {
  const loc = (hostname, ancestors = []) => ({ hostname, ancestorOrigins: ancestors });
  assert.equal(blockedPage(loc("www.youtube.com")), true);
  assert.equal(blockedPage(loc("www.youtube-nocookie.com", ["https://blog.example.com"])), true);
  assert.equal(blockedPage(loc("player.example.com", ["https://www.twitch.tv"])), true);
  assert.equal(blockedPage(loc("player.example.com", ["https://blog.example.com", "https://www.facebook.com"])), true);
  assert.equal(blockedPage(loc("player.example.com", ["https://blog.example.com"])), false);
  assert.equal(blockedPage(loc("example.com", ["not a url"])), false);
  assert.equal(blockedPage(undefined), false);
});

test("blocked page: the test setting can only add hosts", () => {
  try {
    globalThis.__gafferBlockedHosts = ["127.0.0.1"];
    assert.equal(blockedPage({ hostname: "127.0.0.1" }), true);
    assert.equal(blockedPage({ hostname: "localhost", ancestorOrigins: ["http://127.0.0.1:8000"] }), true);
    assert.equal(blockedPage({ hostname: "localhost" }), false);
    globalThis.__gafferBlockedHosts = "youtube.com";
    assert.equal(blockedPage({ hostname: "www.youtube.com" }), true);
    assert.equal(blockedPage({ hostname: "127.0.0.1" }), false);
  } finally {
    delete globalThis.__gafferBlockedHosts;
  }
});
