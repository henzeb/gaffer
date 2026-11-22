// The level setting as it is stored, as text, or null: { on, value 1–100, ref }.
// ref is the loudness that value refers to, null while it is not known yet.
export function cleanLevel(text) {
  try {
    const x = JSON.parse(text);
    const value = Math.round(x.value);
    const ref = typeof x.ref === "number" && x.ref >= -60 && x.ref <= 0 ? Math.round(x.ref * 10) / 10 : null;
    return typeof x.on === "boolean" && value >= 1 && value <= 100 ? JSON.stringify({ on: x.on, value, ref }) : null;
  } catch {
    return null;
  }
}

// The stored setting with only the ref of another one, or null when that one is
// not allowed to change it.
export function withRef(stored, text) {
  const a = cleanLevel(stored);
  const b = cleanLevel(text);
  if (!a || !b) return null;
  const x = JSON.parse(a);
  const { ref } = JSON.parse(b);
  return x.on && ref !== null ? JSON.stringify({ ...x, ref }) : null;
}
