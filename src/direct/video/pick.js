export function visible(x) {
  return !!x && x.isConnected && x.offsetWidth > 0 && x.offsetHeight > 0;
}

export function bigEnough(x) {
  const w = x.offsetWidth;
  const h = x.offsetHeight;
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  return w >= iw * 0.45 || h >= ih * 0.5 || w * h >= iw * ih * 0.2;
}

export function candidate(x) {
  return visible(x) && bigEnough(x);
}
