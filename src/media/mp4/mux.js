import { readBoxes, children, child, find, bytes, concat, box, u32, u64, setU32, setU64, fourcc, isWebm } from "./boxes.js";

const QUEUE_LIMIT = 300;

function fullBody(b, bx) {
  return bx.start + bx.header;
}

function trexFields(b, trex) {
  const p = fullBody(b, trex);
  return { id: u32(b, p + 4), duration: u32(b, p + 12), flags: u32(b, p + 20) };
}

export function parseInit(b) {
  const top = readBoxes(b).boxes;
  const moov = top.find((x) => x.type === "moov");
  if (!moov) return null;
  const ftyp = top.find((x) => x.type === "ftyp") || null;
  const kids = children(b, moov);
  const mvhd = kids.find((x) => x.type === "mvhd") || null;
  const mvex = kids.find((x) => x.type === "mvex");
  const trexes = mvex ? children(b, mvex).filter((x) => x.type === "trex") : [];
  const tracks = kids
    .filter((x) => x.type === "trak")
    .map((trak) => {
      const tkhd = child(b, trak, "tkhd");
      const tv = b[fullBody(b, tkhd)];
      const idAt = fullBody(b, tkhd) + (tv ? 20 : 12) - trak.start;
      const id = u32(b, trak.start + idAt);
      const mdia = child(b, trak, "mdia");
      const mdhd = child(b, mdia, "mdhd");
      const mv = b[fullBody(b, mdhd)];
      const timescale = u32(b, fullBody(b, mdhd) + (mv ? 20 : 12));
      const hdlr = child(b, mdia, "hdlr");
      const handler = hdlr ? fourcc(b, fullBody(b, hdlr) + 8) : "";
      const stsd = find(b, ["minf", "stbl", "stsd"], children(b, mdia));
      const entry = stsd ? children(b, stsd)[0] : null;
      const trex = trexes.find((x) => trexFields(b, x).id === id) || null;
      return {
        id,
        kind: handler === "vide" ? "video" : handler === "soun" ? "audio" : "other",
        timescale: timescale || 1,
        codec: entry ? entry.type : "",
        stsd: stsd ? bytes(b, stsd).slice() : new Uint8Array(0),
        trak: bytes(b, trak).slice(),
        idAt,
        trex: trex ? bytes(b, trex).slice() : null,
        defaults: trex ? trexFields(b, trex) : { id, duration: 0, flags: 0 },
      };
    });
  return { bytes: b, ftyp: ftyp ? bytes(b, ftyp).slice() : null, mvhd: mvhd ? bytes(b, mvhd).slice() : null, tracks };
}

export function sameCodec(a, b) {
  if (!a || !b || a.tracks.length !== b.tracks.length) return false;
  return a.tracks.every((t, i) => {
    const u = b.tracks[i];
    if (t.kind !== u.kind || t.timescale !== u.timescale || t.stsd.length !== u.stsd.length) return false;
    for (let j = 0; j < t.stsd.length; j++) if (t.stsd[j] !== u.stsd[j]) return false;
    return true;
  });
}

export function parseFragment(b, moof, init) {
  const out = { seqAt: -1, trafs: [] };
  children(b, moof).forEach((k) => {
    if (k.type === "mfhd") out.seqAt = fullBody(b, k) + 4 - moof.start;
    if (k.type !== "traf") return;
    const parts = children(b, k);
    const tfhd = parts.find((x) => x.type === "tfhd");
    if (!tfhd) return;
    let p = fullBody(b, tfhd);
    const flags = u32(b, p) & 0xffffff;
    const id = u32(b, p + 4);
    const track = init ? init.tracks.find((x) => x.id === id) : null;
    let q = p + 8;
    if (flags & 1) q += 8;
    if (flags & 2) q += 4;
    let defDur = track ? track.defaults.duration : 0;
    let defFlags = track ? track.defaults.flags : 0;
    if (flags & 8) {
      defDur = u32(b, q);
      q += 4;
    }
    if (flags & 0x10) q += 4;
    if (flags & 0x20) defFlags = u32(b, q);
    const tfdt = parts.find((x) => x.type === "tfdt");
    let time = 0;
    let tfdtAt = -1;
    let wide = false;
    if (tfdt) {
      const tp = fullBody(b, tfdt);
      wide = b[tp] === 1;
      time = wide ? u64(b, tp + 4) : u32(b, tp + 4);
      tfdtAt = tp + 4 - moof.start;
    }
    let dur = 0;
    let first = null;
    let key = false;
    parts
      .filter((x) => x.type === "trun")
      .forEach((trun) => {
        const rp = fullBody(b, trun);
        const tf = u32(b, rp) & 0xffffff;
        const count = u32(b, rp + 4);
        let r = rp + 8;
        if (tf & 1) r += 4;
        let firstFlags = null;
        if (tf & 4) {
          firstFlags = u32(b, r);
          r += 4;
        }
        for (let i = 0; i < count; i++) {
          let d = defDur;
          let f = defFlags;
          if (tf & 0x100) {
            d = u32(b, r);
            r += 4;
          }
          if (tf & 0x200) r += 4;
          if (tf & 0x400) {
            f = u32(b, r);
            r += 4;
          }
          if (tf & 0x800) r += 4;
          if (i === 0 && firstFlags !== null) f = firstFlags;
          if (first === null) first = f;
          if (((f >>> 16) & 1) === 0) key = true;
          dur += d;
        }
      });
    const scale = track ? track.timescale : 1;
    out.trafs.push({
      id,
      idAt: p + 4 - moof.start,
      kind: track ? track.kind : "other",
      time: time / scale,
      end: (time + dur) / scale,
      ticks: time,
      scale,
      tfdtAt,
      wide,
      sync: first === null || ((first >>> 16) & 1) === 0,
      key: first === null || key,
    });
  });
  return out;
}

function defaultFtyp() {
  const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  return box("ftyp", ascii("isom"), Uint8Array.of(0, 0, 2, 0), ascii("isom"), ascii("iso6"), ascii("mp41"));
}

function makeTrex(id) {
  const b = new Uint8Array(24);
  setU32(b, 4, id);
  setU32(b, 8, 1);
  return box("trex", b);
}

function withTrackId(track, id) {
  const trak = track.trak.slice();
  setU32(trak, track.idAt, id);
  let trex;
  if (track.trex) {
    trex = track.trex.slice();
    setU32(trex, 12, id);
  } else trex = makeTrex(id);
  return { trak, trex };
}

export function mergedHeader(video, audio) {
  const v = withTrackId(video.tracks[0], 1);
  const a = withTrackId(audio.tracks[0], 2);
  const mvhd = (video.mvhd || audio.mvhd).slice();
  setU32(mvhd, mvhd.length - 4, 3);
  return concat([video.ftyp || defaultFtyp(), box("moov", mvhd, v.trak, a.trak, box("mvex", v.trex, a.trex))]);
}

function initBytes(init) {
  const top = readBoxes(init.bytes).boxes.filter((x) => x.type === "ftyp" || x.type === "moov");
  return concat(top.map((x) => bytes(init.bytes, x)));
}

export function rebase(b, trafs, t0) {
  trafs.forEach((t) => {
    if (t.tfdtAt < 0) return;
    const ticks = Math.max(0, t.ticks - Math.round(t0 * t.scale));
    if (t.wide) setU64(b, t.tfdtAt, ticks);
    else setU32(b, t.tfdtAt, ticks);
  });
}

export function createMuxer({ sources = 1, onData, onPart = () => {}, onUnsupported = () => {} }) {
  const src = new Map();
  let header = null;
  let mode = null;
  let started = false;
  let t0 = 0;
  let seq = 0;
  let unsupported = null;
  let part = 1;
  const queues = { video: [], audio: [], both: [] };

  function source(key) {
    if (!src.has(key)) src.set(key, { pending: new Uint8Array(0), ftyp: null, moof: null, init: null, kind: null });
    return src.get(key);
  }

  function fail(reason) {
    if (unsupported) return;
    unsupported = reason;
    onUnsupported(reason);
  }

  function plan() {
    const inits = [...src.values()].filter((x) => x.init);
    if (inits.length < sources) return false;
    if (inits.length === 1) {
      mode = "pass";
      header = { inits: inits.map((x) => x.init), bytes: initBytes(inits[0].init) };
    } else {
      const v = inits.find((x) => x.init.tracks.length === 1 && x.init.tracks[0].kind === "video");
      const a = inits.find((x) => x.init.tracks.length === 1 && x.init.tracks[0].kind === "audio");
      if (inits.length !== 2 || !v || !a) {
        fail("structure");
        return false;
      }
      mode = "mux";
      header = { inits: [v.init, a.init], bytes: mergedHeader(v.init, a.init) };
    }
    return true;
  }

  function writeHeader() {
    if (header && !header.written) {
      header.written = true;
      onData(header.bytes);
    }
  }

  function hasVideo() {
    return header.inits.some((i) => i.tracks.some((t) => t.kind === "video"));
  }

  function emit(f) {
    writeHeader();
    rebase(f.bytes, f.trafs, t0);
    if (mode === "mux") {
      setU32(f.bytes, f.seqAt, ++seq);
      setU32(f.bytes, f.idAt, f.kind === "video" ? 1 : 2);
    }
    onData(f.bytes);
  }

  function start(time) {
    t0 = time;
    started = true;
    return true;
  }

  function align(all) {
    if (started) return true;
    if (!hasVideo()) {
      const first = queues.both[0] || queues.audio[0];
      return first ? start(first.start) : false;
    }
    const vq = mode === "pass" ? queues.both : queues.video;
    while (vq.length && !vq[0].sync) vq.shift();
    if (!vq.length) {
      if (queues.audio.length > QUEUE_LIMIT) queues.audio.shift();
      return false;
    }
    const v0 = vq[0].time;
    while (queues.audio.length && queues.audio[0].end <= v0) queues.audio.shift();
    if (mode === "mux" && !queues.audio.length && !all && vq.length <= QUEUE_LIMIT) return false;
    return start(Math.min(vq[0].start, queues.audio.length ? queues.audio[0].start : Infinity));
  }

  function drain(all) {
    if (!header || unsupported) return;
    if (!align(all)) return;
    if (mode === "pass") {
      while (queues.both.length) emit(queues.both.shift());
      return;
    }
    const v = queues.video;
    const a = queues.audio;
    while (v.length || a.length) {
      if (v.length && a.length) emit(v[0].time <= a[0].time ? v.shift() : a.shift());
      else if (all || v.length > QUEUE_LIMIT || a.length > QUEUE_LIMIT) emit((v.length ? v : a).shift());
      else break;
    }
  }

  function setInit(s, init) {
    if (!init.tracks.length) return;
    const prev = s.init;
    s.init = init;
    if (!header) {
      plan();
      return;
    }
    if (prev && sameCodec(prev, init)) return;
    if (!header.written) {
      header = null;
      mode = null;
      plan();
      return;
    }
    drain(true);
    part++;
    onPart(part);
    header = null;
    mode = null;
    started = false;
    seq = 0;
    plan();
  }

  function fragment(s, moofBytes, mdatBytes) {
    if (!s.init) return;
    const b = concat([moofBytes, mdatBytes]);
    const moof = readBoxes(b).boxes[0];
    const info = parseFragment(b, moof, s.init);
    const traf = info.trafs.find((x) => x.kind === "video") || info.trafs[0];
    if (!traf) return;
    const q = sources === 1 || s.init.tracks.length > 1 || !queues[traf.kind] ? queues.both : queues[traf.kind];
    q.push({ bytes: b, kind: traf.kind, time: traf.time, start: Math.min(...info.trafs.map((x) => x.time)), end: traf.end, sync: traf.kind !== "video" || traf.key, seqAt: info.seqAt, idAt: traf.idAt, trafs: info.trafs });
  }

  function push(key, data) {
    if (unsupported) return;
    const s = source(key);
    if (!s.pending.length && !s.init && isWebm(data)) {
      fail("webm");
      return;
    }
    const b = s.pending.length ? concat([s.pending, data]) : data;
    const { boxes, rest } = readBoxes(b);
    boxes.forEach((bx) => {
      const raw = bytes(b, bx);
      if (bx.type === "ftyp") s.ftyp = raw.slice();
      else if (bx.type === "moov") {
        const init = parseInit(s.ftyp ? concat([s.ftyp, raw]) : raw.slice());
        s.ftyp = null;
        if (init) setInit(s, init);
      } else if (bx.type === "moof") s.moof = raw.slice();
      else if (bx.type === "mdat" && s.moof) {
        fragment(s, s.moof, raw);
        s.moof = null;
      }
    });
    s.pending = rest < b.length ? b.slice(rest) : new Uint8Array(0);
    drain(false);
  }

  function end() {
    if (!header && !unsupported && [...src.values()].some((x) => x.init)) {
      sources = [...src.values()].filter((x) => x.init).length;
      plan();
      if (mode === "pass") queues.both.push(...queues.video.splice(0), ...queues.audio.splice(0));
    }
    drain(true);
    writeHeader();
  }

  return {
    push,
    end,
    get mode() {
      return mode;
    },
    get part() {
      return part;
    },
    get unsupported() {
      return unsupported;
    },
    get ready() {
      return !!header;
    },
  };
}
