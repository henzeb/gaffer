export async function openFile(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
  return r;
}

export async function pipeFile(r, { write, progress, signal }) {
  const total = +r.headers.get("content-length") || 0;
  const reader = r.body.getReader();
  let done = 0;
  try {
    for (;;) {
      if (signal && signal.aborted) throw new DOMException("aborted", "AbortError");
      const { value, done: end } = await reader.read();
      if (end) break;
      done += value.length;
      await write(value);
      progress(done, total);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (e) {}
  }
}

export function plainSource(v) {
  const src = (v && (v.currentSrc || v.src)) || "";
  return /^https?:/i.test(src) && !v.srcObject ? src : null;
}
