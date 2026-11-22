// Measures a copy of the video's sound (SPEC §11.15). The sound itself is not
// rerouted, so nothing can go silent and nothing has to be restored.
import { blockLoudness, createBlocks } from "../../shared/loudness.js";

const SIZE = 16384;

export function createMeter(v) {
  const blocks = createBlocks();
  const buf = new Float32Array(SIZE);
  let stream = null;
  let own = false;
  let failed = false;
  let track = null;
  let source = null;
  let graph = null;

  function build(ac) {
    const shelf = ac.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 1681.97;
    shelf.gain.value = 4;
    shelf.channelCount = 2;
    shelf.channelCountMode = "explicit";
    const high = ac.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 38.135;
    high.Q.value = -6.02;
    const split = ac.createChannelSplitter(2);
    shelf.connect(high).connect(split);
    const ends = [0, 1].map((i) => {
      const a = ac.createAnalyser();
      a.fftSize = SIZE;
      split.connect(a, i);
      return a;
    });
    graph = { ac, first: shelf, ends };
  }

  function unhook() {
    if (source) source.disconnect();
    source = null;
    track = null;
  }

  function drop() {
    unhook();
    if (stream && own) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    failed = false;
  }

  function hook(ac) {
    if (!graph || graph.ac !== ac) {
      unhook();
      build(ac);
    }
    if (!stream) {
      own = !(v.srcObject instanceof MediaStream);
      try {
        stream = own ? v.captureStream() : v.srcObject;
      } catch (e) {
        failed = true;
        return;
      }
    }
    // The picture is not needed.
    if (own) stream.getVideoTracks().forEach((t) => t.stop());
    const live = stream.getAudioTracks().filter((t) => t.readyState === "live")[0] || null;
    if (live === track) return;
    unhook();
    track = live;
    if (!live) return;
    source = ac.createMediaStreamSource(new MediaStream([live]));
    source.connect(graph.first);
  }

  function energy() {
    return graph.ends.reduce((sum, a) => {
      a.getFloatTimeDomainData(buf);
      let x = 0;
      for (let i = 0; i < SIZE; i++) x += buf[i] * buf[i];
      return sum + x / SIZE;
    }, 0);
  }

  return {
    tick(ac) {
      if (failed || !ac || v.paused || v.seeking || v.readyState < 2) return;
      hook(ac);
      if (source) blocks.add(blockLoudness(energy()));
    },
    level: blocks.level,
    young: blocks.young,
    full: blocks.full,
    failed: () => failed,
    // The site changed the source: the old capture ends with it.
    recapture: drop,
    reset() {
      drop();
      blocks.clear();
    },
    close: drop,
  };
}
