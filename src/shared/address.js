// Addresses without their query, which often holds tokens, signatures or
// session ids (SPEC §12.1): the report goes into a public issue.
export function short(u) {
  try {
    const x = new URL(u, location.href);
    return x.origin + x.pathname + (x.search ? "?…" : "");
  } catch (e) {
    return String(u).slice(0, 120);
  }
}

// Every address inside a text, shortened.
export function shortIn(text) {
  return String(text).replace(/https?:\/\/[^\s"'<>()]+/g, (u) => short(u));
}
