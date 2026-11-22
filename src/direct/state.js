export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10];

export const state = {
  id: 1,
  bound: null,
  shown: false,
  ownSwitch: 0,
  lastDur: NaN,
  pendingDur: null,
  v: null,
  pop: false,
  R: 0,
  S: 1,
  X: 0,
  Y: 0,
  FX: 1,
  FY: 1,
  // Brightness and contrast, 100 is unchanged (SPEC §11.3).
  B: 100,
  C: 100,
  F: false,
  over: false,
  idleTimer: null,
  seeking: false,
  lastHref: "",
  mx: -1,
  my: -1,
  drag: null,
  noClick: false,
  autoP: false,
  loading: false,
  shareAt: 0,
  bufSince: 0,
  bufLastAh: 0,
  hold: false,
  unguard: null,
  pitchOn: true,
  keep: null,
  sx: 0,
  sy: 0,
  hidden: [],
  nativeControls: false,
  downPaused: null,
  downAt: 0,
  preload: null,
  recording: false,
  closing: false,
  ad: false,
  adAt: 0,
  adRate: 1,
  userRate: 1,
  adRestore: null,
};

export function freshPortal(has) {
  return { tries: 0, busy: false, items: null, cur: null, btn: null, next: 0, has, own: false, pend: 0, want: null, at: 0 };
}

export const quality = {
  adapter: null,
  sel: null,
  open: false,
  tick: 0,
  maxDone: false,
  user: false,
  maxOn: true,
  pq: freshPortal(false),
  key: "",
  bad: {},
  check: null,
  sig: "",
};

export const tracks = {
  text: null,
  audio: null,
  key: "",
  last: null,
  tick: 0,
  sig: { text: "", audio: "" },
};

export function resetTracks() {
  tracks.text = null;
  tracks.audio = null;
  tracks.key = "";
  tracks.last = null;
  tracks.tick = 0;
  tracks.sig = { text: "", audio: "" };
}

export const els = {};

const cleanups = [];

export function onClose(fn) {
  cleanups.push(fn);
}

// Every cleanup runs, also after one that fails: closing must restore the page
// completely (SPEC §11.9).
export function runCleanups() {
  while (cleanups.length) {
    try {
      cleanups.pop()();
    } catch (e) {
      console.error("[Gaffer Direct] close", e);
    }
  }
}

export function resetView() {
  state.R = 0;
  state.S = 1;
  state.X = 0;
  state.Y = 0;
  state.FX = 1;
  state.FY = 1;
  state.B = 100;
  state.C = 100;
}
