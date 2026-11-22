import { test } from "node:test";
import assert from "node:assert/strict";
import { onClose, runCleanups } from "../../src/direct/state.js";
import { hookManifests } from "../../src/shared/net-hook.js";

test("closing: a cleanup that fails does not stop the ones after it", () => {
  const ran = [];
  const error = console.error;
  console.error = () => {};
  try {
    onClose(() => ran.push("first"));
    onClose(() => {
      throw new Error("broken");
    });
    onClose(() => ran.push("last"));
    runCleanups();
  } finally {
    console.error = error;
  }
  assert.deepEqual(ran, ["last", "first"]);
});

test("manifest hook: undoing it keeps what the page patched afterwards", () => {
  class Xhr {
    open() {}
    send() {}
  }
  const open = Xhr.prototype.open;
  const send = Xhr.prototype.send;
  globalThis.window = {};
  globalThis.XMLHttpRequest = Xhr;
  try {
    const undo = hookManifests(() => {});
    assert.notEqual(Xhr.prototype.open, open);
    const page = function () {};
    Xhr.prototype.open = page;
    undo();
    assert.equal(Xhr.prototype.open, page, "the page's own open stays");
    assert.equal(Xhr.prototype.send, send, "send is back");
  } finally {
    delete globalThis.window;
    delete globalThis.XMLHttpRequest;
  }
});
