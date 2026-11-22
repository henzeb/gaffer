import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ISSUES, TEMPLATE, issueUrl, siteOf, chromeVersion, fitsIssue, reportFileName, ISSUE_ROOM } from "../../src/inspect/issue.js";
import { describeManifest } from "../../src/inspect/report/record.js";

test("the issue address opens the Inspect form with the title and the site, and the report only for a file", () => {
  const u = new URL(issueUrl("example.com"));
  assert.equal(u.origin + u.pathname, ISSUES);
  assert.equal(u.origin, "https://github.com");
  assert.equal(u.searchParams.get("template"), TEMPLATE);
  assert.equal(u.searchParams.get("title"), "Inspect: example.com");
  assert.equal(u.searchParams.get("site"), "example.com");
  assert.deepEqual([...u.searchParams.keys()], ["template", "title", "site"]);
  const f = new URL(issueUrl("example.com", "attach gaffer-inspect-example.com-2026-11-09.txt & more"));
  assert.equal(f.searchParams.get("report"), "attach gaffer-inspect-example.com-2026-11-09.txt & more");
});

test("the form in .github has the fields the address fills in", () => {
  const form = fs.readFileSync(new URL("../../.github/ISSUE_TEMPLATE/" + TEMPLATE, import.meta.url), "utf8");
  for (const id of ["problem", "expected", "site", "report"]) assert.match(form, new RegExp("\\n {4}id: " + id + "\\n"), id);
});

test("the site is the host without www., and something without a host still gets a title", () => {
  assert.equal(siteOf("WWW.Example.com"), "example.com");
  assert.equal(siteOf("player.example.com"), "player.example.com");
  assert.equal(new URL(issueUrl(siteOf(""))).searchParams.get("title"), "Inspect: ?");
});

test("the Chrome version comes from the user agent", () => {
  assert.equal(chromeVersion("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.54 Safari/537.36"), "141.0.7390.54");
  assert.equal(chromeVersion("Something else"), "?");
});

test("a report fits in an issue up to 60,000 characters; a longer one gets a file name", () => {
  assert.equal(fitsIssue("x".repeat(ISSUE_ROOM)), true);
  assert.equal(fitsIssue("x".repeat(ISSUE_ROOM + 1)), false);
  assert.equal(reportFileName("example.com", new Date(2026, 10, 9)), "gaffer-inspect-example.com-2026-11-09.txt");
  assert.equal(reportFileName("", new Date(2026, 0, 2)), "gaffer-inspect-page-2026-01-02.txt");
});

test("the key line of an encrypted stream loses the query of its address", () => {
  globalThis.location = new URL("https://example.com/page");
  const text = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://keys.example.com/k/1?token=secret123"\n#EXTINF:4,\nseg1.ts\n#EXT-X-ENDLIST\n';
  const line = describeManifest("https://cdn.example.com/a.m3u8", text).line;
  assert.match(line, /URI="https:\/\/keys\.example\.com\/k\/1\?…"/);
  assert.doesNotMatch(line, /secret123/);
});
