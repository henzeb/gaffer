import { createMuxer } from "../../media/mp4/mux.js";
import { isWebm, readBoxes } from "../../media/mp4/boxes.js";
const INIT_WAIT = 12000;
const AFTER_SWITCH = 4000;

export function captureApi() {
  const c = window.__gafferCapture;
  return c && typeof c.buffers === "function" && typeof c.listen === "function" ? c : null;
}

export function isMse(v) {
  return !!v && /^blob:/.test(v.currentSrc || v.src || "");
}

export function mseBuffers(v, ms) {
  const c = captureApi();
  if (!c || !isMse(v)) return [];
  try {
    return c.buffers(v, ms) || [];
  } catch (e) {
    return [];
  }
}

export function webmBuffers(list) {
  return list.some((e) => /webm/i.test(e.mime || "") || (e.init && isWebm(e.init)));
}

export function startMse(v, ms, { write, part, unsupported, noInit, requestInit }) {
  const c = captureApi();
  const list = mseBuffers(v, ms);
  const keys = new Map(list.map((e, i) => [e, "b" + i]));
  // The inits already known can be refused right here; the caller only hears
  // that once startMse has returned, so it can stop it.
  let early = null;
  let returned = false;
  const onUnsupported = (r) => (returned ? unsupported(r) : (early = { r }));
  const muxer = createMuxer({ sources: list.length, onData: write, onPart: part, onUnsupported });
  list.forEach((e) => {
    if (e.init) muxer.push(keys.get(e), e.init);
  });
  let armed = !list.some((e) => !e.init);
  const off = c.listen((e, bytes) => {
    const k = keys.get(e);
    if (k && armed) muxer.push(k, bytes);
  });
  let timer = null;
  let gave = false;
  const give = () => {
    if (gave || muxer.ready || muxer.unsupported) return;
    gave = true;
    noInit();
  };
  if (!armed) {
    Promise.resolve(requestInit(list)).then((ok) => {
      if (!ok) return give();
      armed = true;
      setTimeout(give, AFTER_SWITCH);
    });
    timer = setTimeout(give, INIT_WAIT);
  }
  returned = true;
  if (early) Promise.resolve().then(() => unsupported(early.r));
  return {
    muxer,
    stop() {
      gave = true;
      clearTimeout(timer);
      off();
      muxer.end();
    },
  };
}

// The writers for startRaw, each counting only its own bytes: startRaw decides
// on that whether an init still belongs at the start of the file.
export function rawWriters(list) {
  return list.map((w) => {
    let size = 0;
    return {
      write(x) {
        size += x.length;
        return w.write(x);
      },
      get size() {
        return size;
      },
    };
  });
}

// The header of a file: WebM's EBML header, or an MP4 init (moov).
function isInit(bytes) {
  return isWebm(bytes) || readBoxes(bytes).boxes.some((b) => b.type === "moov");
}

export function startRaw(v, ms, writers) {
  const c = captureApi();
  const list = mseBuffers(v, ms);
  list.forEach((e, i) => {
    if (e.init && writers[i]) writers[i].write(e.init);
  });
  const off = c.listen((e, bytes) => {
    const i = list.indexOf(e);
    if (i < 0 || !writers[i]) return;
    const init = isInit(bytes);
    if (init ? writers[i].size > 0 : writers[i].size === 0) return;
    writers[i].write(bytes);
  });
  return { stop: off, count: list.length, kinds: list.map((e) => (/audio/i.test(e.mime || "") ? "audio" : "video")) };
}
