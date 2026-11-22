// The objects on window, where players without a known global live. Walking
// window is costly on large pages, and quality, tracks and chapters each look
// in the same scan, so the list is kept for a short while.
const KEEP_OBJECTS = 500;
let objects = null;
let objectsAt = 0;

export function windowObjects() {
  const now = Date.now();
  if (objects && now - objectsAt < KEEP_OBJECTS) return objects;
  let keys = [];
  try {
    keys = Object.keys(window);
  } catch (e) {}
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    let o;
    try {
      o = window[keys[i]];
    } catch (e) {
      continue;
    }
    if (o && typeof o === "object") out.push(o);
  }
  objects = out;
  objectsAt = now;
  return out;
}
