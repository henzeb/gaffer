export function ms(n) {
  const f = globalThis.__gafferTiming;
  return typeof f === "number" && f > 0 ? n * f : n;
}
