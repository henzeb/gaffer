import { box, concat } from "../mp4/boxes.js";

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
const AC3_RATES = [48000, 44100, 32000];
const AC3_SIZES = [
  [64, 69, 96],
  [80, 87, 120],
  [96, 104, 144],
  [112, 121, 168],
  [128, 139, 192],
  [160, 174, 240],
  [192, 208, 288],
  [224, 243, 336],
  [256, 278, 384],
  [320, 348, 480],
  [384, 417, 576],
  [448, 487, 672],
  [512, 557, 768],
  [640, 696, 960],
  [768, 835, 1152],
  [896, 975, 1344],
  [1024, 1114, 1536],
  [1152, 1253, 1728],
  [1280, 1393, 1920],
];
const AC3_CHANNELS = [2, 1, 2, 3, 3, 4, 4, 5];
const MP3_BITRATES = {
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function adts(b, o) {
  if (o + 7 > b.length) return null;
  if (b[o] !== 0xff || (b[o + 1] & 0xf6) !== 0xf0) return { bad: true };
  const head = b[o + 1] & 1 ? 7 : 9;
  const length = ((b[o + 3] & 3) << 11) | (b[o + 4] << 3) | (b[o + 5] >> 5);
  const index = (b[o + 2] >> 2) & 15;
  if (length < head || index >= AAC_RATES.length) return { bad: true };
  if (o + length > b.length) return null;
  const object = ((b[o + 2] >> 6) & 3) + 1;
  const channels = ((b[o + 2] & 1) << 2) | (b[o + 3] >> 6);
  const blocks = (b[o + 6] & 3) + 1;
  return { length, payload: b.subarray(o + head, o + length), samples: 1024 * blocks, rate: AAC_RATES[index], channels: channels || 2, key: object + "-" + index + "-" + channels, object, index, channelConfig: channels };
}

function mpeg(b, o) {
  if (o + 4 > b.length) return null;
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return { bad: true };
  const version = (b[o + 1] >> 3) & 3;
  const layer = 4 - ((b[o + 1] >> 1) & 3);
  const bi = b[o + 2] >> 4;
  const ri = (b[o + 2] >> 2) & 3;
  if (version === 1 || layer === 4 || bi === 0 || bi === 15 || ri === 3) return { bad: true };
  const v1 = version === 3;
  const table = MP3_BITRATES[v1 ? "1-" + layer : layer === 1 ? "2-1" : "2-2"];
  const bitrate = table[bi] * 1000;
  const rate = MP3_RATES[version][ri];
  const pad = (b[o + 2] >> 1) & 1;
  const samples = layer === 1 ? 384 : layer === 3 && !v1 ? 576 : 1152;
  const length = layer === 1 ? (Math.floor((12 * bitrate) / rate) + pad) * 4 : Math.floor(((samples / 8) * bitrate) / rate) + pad;
  if (length < 4) return { bad: true };
  if (o + length > b.length) return null;
  const channels = b[o + 3] >> 6 === 3 ? 1 : 2;
  return { length, payload: b.subarray(o, o + length), samples, rate, channels, key: version + "-" + layer + "-" + rate + "-" + channels, v1 };
}

function ac3(b, o) {
  if (o + 8 > b.length) return null;
  if (b[o] !== 0x0b || b[o + 1] !== 0x77) return { bad: true };
  const bsid = b[o + 5] >> 3;
  if (bsid > 10) return eac3(b, o);
  const fscod = b[o + 4] >> 6;
  const frmsizecod = b[o + 4] & 63;
  if (fscod === 3 || frmsizecod >= 38) return { bad: true };
  const length = AC3_SIZES[frmsizecod >> 1][fscod] * 2 + (fscod === 1 ? (frmsizecod & 1) * 2 : 0);
  if (o + length > b.length) return null;
  const bsmod = b[o + 5] & 7;
  const acmod = b[o + 6] >> 5;
  let bit = 3;
  if (acmod & 1 && acmod !== 1) bit += 2;
  if (acmod & 4) bit += 2;
  if (acmod === 2) bit += 2;
  const word = (b[o + 6] << 8) | b[o + 7];
  const lfeon = (word >> (15 - bit)) & 1;
  return { length, payload: b.subarray(o, o + length), samples: 1536, rate: AC3_RATES[fscod], channels: AC3_CHANNELS[acmod] + lfeon, key: "ac3-" + fscod + "-" + bsid + "-" + bsmod + "-" + acmod + "-" + lfeon + "-" + (frmsizecod >> 1), codec: "ac-3", fscod, bsid, bsmod, acmod, lfeon, rateCode: frmsizecod >> 1 };
}

function eac3(b, o) {
  if (o + 6 > b.length) return null;
  const strmtyp = b[o + 2] >> 6;
  const length = ((((b[o + 2] & 7) << 8) | b[o + 3]) + 1) * 2;
  if (o + length > b.length) return null;
  const fscod = b[o + 4] >> 6;
  let blocks = 6;
  let rate;
  if (fscod === 3) {
    rate = [24000, 22050, 16000][(b[o + 4] >> 4) & 3];
    if (!rate) return { bad: true };
  } else {
    rate = AC3_RATES[fscod];
    blocks = [1, 2, 3, 6][(b[o + 4] >> 4) & 3];
  }
  const acmod = (b[o + 4] >> 1) & 7;
  const lfeon = b[o + 4] & 1;
  const bsid = b[o + 5] >> 3;
  return { length, payload: b.subarray(o, o + length), samples: 256 * blocks, rate, channels: AC3_CHANNELS[acmod] + lfeon, key: "eac3-" + fscod + "-" + bsid + "-" + acmod + "-" + lfeon, codec: "ec-3", dependent: strmtyp === 1, fscod: fscod === 3 ? 0 : fscod, bsid, acmod, lfeon };
}

const PARSERS = { aac: adts, mp3: mpeg, ac3, eac3: ac3 };

function descriptor(tag, body) {
  return concat([Uint8Array.of(tag, body.length), body]);
}

function esds(object, config, bitrate) {
  const dec = new Uint8Array(13);
  dec[0] = object;
  dec[1] = 0x15;
  const br = [(bitrate >>> 24) & 255, (bitrate >>> 16) & 255, (bitrate >>> 8) & 255, bitrate & 255];
  dec.set(br, 5);
  dec.set(br, 9);
  const decInner = config ? concat([dec, descriptor(5, config)]) : dec;
  const es = concat([Uint8Array.of(0, 1, 0), descriptor(4, decInner), descriptor(6, Uint8Array.of(2))]);
  return box("esds", Uint8Array.of(0, 0, 0, 0), descriptor(3, es));
}

function audioEntry(type, channels, rate, child) {
  const b = new Uint8Array(28);
  b[7] = 1;
  b[17] = channels;
  b[19] = 16;
  const r = rate > 65535 ? 0 : rate;
  b[24] = (r >> 8) & 255;
  b[25] = r & 255;
  return box(type, b, child);
}

function entryFor(kind, f, bitrate) {
  if (kind === "aac") {
    const asc = Uint8Array.of((f.object << 3) | (f.index >> 1), ((f.index & 1) << 7) | (f.channelConfig << 3));
    return audioEntry("mp4a", f.channels, f.rate, esds(0x40, asc, bitrate));
  }
  if (kind === "mp3") return audioEntry("mp4a", f.channels, f.rate, esds(f.v1 ? 0x6b : 0x69, null, bitrate));
  if (f.codec === "ac-3") {
    const v = (f.fscod << 22) | (f.bsid << 17) | (f.bsmod << 14) | (f.acmod << 11) | (f.lfeon << 10) | (f.rateCode << 5);
    return audioEntry("ac-3", f.channels, f.rate, box("dac3", Uint8Array.of((v >> 16) & 255, (v >> 8) & 255, v & 255)));
  }
  const rate = Math.round((f.length * 8 * f.rate) / f.samples / 1000);
  const d = new Uint8Array(5);
  d[0] = (rate >> 5) & 255;
  d[1] = (rate & 31) << 3;
  d[2] = (f.fscod << 6) | (f.bsid << 1);
  d[3] = (f.acmod << 1) | f.lfeon;
  d[4] = 0;
  return audioEntry("ec-3", f.channels, f.rate, box("dec3", d));
}

export function audioKind(b, o = 0) {
  if (b.length < o + 2) return null;
  if (b[o] === 0x0b && b[o + 1] === 0x77) return "ac3";
  if (b[o] === 0xff && (b[o + 1] & 0xf6) === 0xf0) return "aac";
  if (b[o] === 0xff && (b[o + 1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

export function createAudio(kind) {
  const parse = PARSERS[kind];
  let carry = new Uint8Array(0);
  let config = null;
  let configKey = "";
  return {
    kind,
    get config() {
      return config;
    },
    reset() {
      carry = new Uint8Array(0);
    },
    frames(data) {
      const b = carry.length ? concat([carry, data]) : data;
      const carried = carry.length;
      const out = [];
      let o = 0;
      while (o < b.length) {
        const f = parse(b, o);
        if (!f) break;
        if (f.bad) {
          o++;
          continue;
        }
        if (f.dependent && out.length) {
          const last = out[out.length - 1];
          last.data = concat([last.data, f.payload]);
          o += f.length;
          continue;
        }
        if (f.key !== configKey) {
          configKey = f.key;
          config = { rate: f.rate, codec: kind === "aac" || kind === "mp3" ? "mp4a" : f.codec, box: entryFor(kind, f, 0) };
        }
        out.push({ data: f.payload, samples: f.samples, rate: f.rate, config, carried: o < carried });
        o += f.length;
      }
      carry = o < b.length ? b.slice(o) : new Uint8Array(0);
      return out;
    },
  };
}
