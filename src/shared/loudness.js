// Loudness of a video and the volume that goes with a level (SPEC §11.15).
// Loudness is in LUFS, measured over blocks (ITU-R BS.1770 gating).
export const ASSUMED = -18;
export const YOUNG = 12;
const KEEP = 120;
const SILENCE = -70;

export function blockLoudness(energy) {
  return -0.691 + 10 * Math.log10(energy + 1e-12);
}

function mean(blocks) {
  return blockLoudness(blocks.reduce((sum, l) => sum + Math.pow(10, (l + 0.691) / 10), 0) / blocks.length);
}

// The last half minute of sound. Silence does not count, and neither do parts
// far below the rest. A part that is suddenly louder counts at once.
export function createBlocks() {
  let blocks = [];
  return {
    add(l) {
      if (!(l > SILENCE)) return;
      blocks.push(l);
      if (blocks.length > KEEP) blocks.shift();
    },
    clear() {
      blocks = [];
    },
    young: () => blocks.length < YOUNG,
    full: () => blocks.length >= KEEP,
    level() {
      if (!blocks.length) return null;
      const floor = mean(blocks) - 10;
      const full = mean(blocks.filter((l) => l > floor));
      const last = mean(blocks.slice(-YOUNG));
      return last > full + 4 ? last - 1 : full;
    },
  };
}

// The volume (0 to 1, or above 1 when the video is too quiet) at which a video
// of this loudness sounds as loud as one of loudness ref at volume value (1 to
// 100).
export function volumeFor(value, ref, loudness) {
  return (value / 100) * Math.pow(10, (ref - loudness) / 20);
}

// One step from the current volume towards the wanted one: down fast, up slow,
// both faster in the first seconds.
export function stepVolumeTo(current, wanted, young) {
  const db = (x) => 20 * Math.log10(Math.max(x, 0.001));
  const d = db(wanted) - db(current);
  const max = d < 0 ? (young ? 8 : 3) : young ? 2 : 0.4;
  if (Math.abs(d) <= max) return wanted;
  return Math.min(1, Math.pow(10, (db(current) + Math.sign(d) * max) / 20));
}

function valid(n) {
  return typeof n === "number" && n > -70 && n < 5 ? n : null;
}

// What YouTube states about the sound that plays. It often plays a version with
// its own compression ("stable volume", DRC), which has another loudness than
// the video itself: r is the player response, n are the stats for nerds.
export function statedLoudness(r, n) {
  const text = String((n && n.volume) || "");
  const cont = /cont\.\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(text);
  if (cont && valid(+cont[1]) !== null) return +cont[1];
  const itag = /\((\d+)\)\s*$/.exec(String((n && n.codecs) || ""));
  const formats = (r && r.streamingData && r.streamingData.adaptiveFormats) || [];
  const f = itag && formats.filter((x) => x.itag === +itag[1] && !!x.isDrc === /DRC/.test(text))[0];
  if (f && valid(f.trackAbsoluteLoudnessLkfs) !== null) return f.trackAbsoluteLoudnessLkfs;
  const a = r && r.playerConfig && r.playerConfig.audioConfig;
  if (!a) return null;
  return valid(typeof a.trackAbsoluteLoudnessLkfs === "number" ? a.trackAbsoluteLoudnessLkfs : a.perceptualLoudnessDb);
}

// The loudness the setting refers to, or null while it is not known yet.
export function cleanRef(x) {
  return typeof x === "number" && x >= -60 && x <= 0 ? Math.round(x * 10) / 10 : null;
}

// A stored or received level setting, or null when it is not a valid one.
export function parseLevel(text) {
  try {
    const x = JSON.parse(text);
    const value = Math.round(x.value);
    return typeof x.on === "boolean" && value >= 1 && value <= 100 ? { on: x.on, value, ref: cleanRef(x.ref) } : null;
  } catch (e) {
    return null;
  }
}
