import { holdMeter } from "../level/index.js";

const MP4 = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
const WEBM = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

export function recorderType() {
  const R = window.MediaRecorder;
  if (!R || typeof R.isTypeSupported !== "function") return null;
  const mp4 = MP4.find((t) => R.isTypeSupported(t));
  if (mp4) return { mime: mp4, ext: "mp4" };
  const webm = WEBM.find((t) => R.isTypeSupported(t));
  return webm ? { mime: webm, ext: "webm" } : null;
}

export function canCapture(v) {
  return !!(v && typeof v.captureStream === "function" && recorderType());
}

export function startRecorder(v, type, { write, fail }) {
  const own = !v.srcObject;
  // Chrome gives the sound to one capture at a time.
  holdMeter(true);
  let rec;
  let stream;
  try {
    stream = v.captureStream();
    rec = new MediaRecorder(stream, { mimeType: type.mime });
  } catch (e) {
    holdMeter(false);
    throw e;
  }
  let chain = Promise.resolve();
  let stopped = null;
  rec.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    // A part that cannot be read stops the recording with a message, instead of
    // silently dropping everything after it.
    chain = chain
      .then(() => e.data.arrayBuffer())
      .then((b) => write(new Uint8Array(b)))
      .catch((x) => fail(x));
  };
  rec.onerror = (e) => fail((e && e.error) || new Error("MediaRecorder"));
  rec.start(1000);
  const end = () => {
    if (own) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
    }
    holdMeter(false);
  };
  return {
    stop() {
      if (stopped) return stopped;
      stopped = new Promise((resolve) => {
        if (rec.state === "inactive") return resolve();
        rec.onstop = () => resolve();
        try {
          rec.stop();
        } catch (e) {
          resolve();
        }
      })
        .then(() => chain)
        .finally(end);
      return stopped;
    },
  };
}
