import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const seconds = (ms) => (ms / 1000).toFixed(1).padStart(6) + " s";
const short = (file) => path.relative(root, file);

export default async function* durations(source) {
  const files = [];
  const tests = [];
  for await (const event of source) {
    if (event.type !== "test:complete" || !event.data.file) continue;
    const { name, file, nesting, details } = event.data;
    if (path.resolve(name) === file) files.push({ file, ms: details.duration_ms });
    else if (nesting === 0) tests.push({ name, file, ms: details.duration_ms });
  }
  if (!files.length) return;
  yield "\nDuration per file\n";
  for (const f of files.sort((a, b) => b.ms - a.ms)) yield seconds(f.ms) + "  " + short(f.file) + "\n";
  yield "\nSlowest tests\n";
  for (const t of tests.sort((a, b) => b.ms - a.ms).slice(0, 5)) yield seconds(t.ms) + "  " + t.name + " (" + path.basename(t.file) + ")\n";
}
