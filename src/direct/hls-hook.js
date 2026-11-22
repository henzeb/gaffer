let seen = [];
let orig = null;

export function hookHls() {
  try {
    const H = window.Hls;
    if (!H || !H.prototype || orig) return;
    const P = H.prototype;
    const name = typeof P.trigger === "function" ? "trigger" : typeof P.emit === "function" ? "emit" : null;
    if (!name) return;
    orig = { P, name, fn: P[name] };
    P[name] = function () {
      try {
        if (this && this.media && seen.indexOf(this) < 0) {
          seen.push(this);
          if (seen.length > 8) seen.shift();
        }
      } catch (e) {}
      return orig.fn.apply(this, arguments);
    };
  } catch (e) {}
}

export function unhookHls() {
  if (orig) {
    try {
      orig.P[orig.name] = orig.fn;
    } catch (e) {}
    orig = null;
  }
  seen = [];
}

export function seenHls() {
  return seen;
}
