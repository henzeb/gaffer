const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeSegment(seg) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of seg) {
    const d = B64.indexOf(ch);
    value += (d & 31) << shift;
    if (d & 32) {
      shift += 5;
      continue;
    }
    out.push(value & 1 ? -(value >>> 1) : value >>> 1);
    value = 0;
    shift = 0;
  }
  return out;
}

export function originalPosition(map, line, column) {
  let source = 0;
  let srcLine = 0;
  let srcCol = 0;
  let best = null;
  const lines = map.mappings.split(";");
  for (let l = 0; l < lines.length && l <= line; l++) {
    let genCol = 0;
    for (const seg of lines[l].split(",")) {
      if (!seg) continue;
      const f = decodeSegment(seg);
      genCol += f[0];
      if (f.length < 4) continue;
      source += f[1];
      srcLine += f[2];
      srcCol += f[3];
      if (l === line && genCol <= column) best = { source: map.sources[source], line: srcLine, column: srcCol };
    }
  }
  return best;
}
