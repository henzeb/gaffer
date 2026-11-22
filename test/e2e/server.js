import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const roots = {
  "/fixtures/": path.join(import.meta.dirname, "..", "fixtures"),
  "/": path.join(import.meta.dirname, "pages"),
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".mpd": "application/dash+xml",
  ".vtt": "text/vtt; charset=utf-8",
  ".json": "application/json",
};

function resolve(urlPath, extra) {
  const all = { ...extra, ...roots };
  for (const prefix of Object.keys(all)) {
    if (!urlPath.startsWith(prefix)) continue;
    if (!all[prefix]) return null;
    const file = path.normalize(path.join(all[prefix], urlPath.slice(prefix.length)));
    if (!file.startsWith(all[prefix])) return null;
    return file;
  }
  return null;
}

function serveFile(req, res, file) {
  const stat = fs.statSync(file);
  const type = types[path.extname(file)] || "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    const start = range[1] ? +range[1] : 0;
    const end = range[2] ? Math.min(+range[2], stat.size - 1) : stat.size - 1;
    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(file).pipe(res);
}

// /stall/<file>: a media file that loads up to byte server.stallAt and no
// further until server.release().
function serveStalled(server, req, res, file) {
  const size = fs.statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "") || [];
  const start = +(range[1] || 0);
  const end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
  const at = Math.max(start, Math.min(server.stallAt, end + 1));
  const rest = () => fs.createReadStream(file, { start: at, end }).pipe(res);
  res.writeHead(206, {
    "Content-Type": types[path.extname(file)],
    "Content-Length": end - start + 1,
    "Content-Range": `bytes ${start}-${end}/${size}`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  res.flushHeaders();
  const more = () => {
    if (at > end) res.end();
    else if (server.stalled) server.stalled.add(rest);
    else rest();
  };
  res.on("close", () => server.stalled && server.stalled.delete(rest));
  if (at > start) fs.createReadStream(file, { start, end: at - 1 }).on("end", more).pipe(res, { end: false });
  else more();
}

const LIVE = path.join(roots["/fixtures/"], "media", "hls-fmp4");
const LIVE_WINDOW = 4;

function livePlaylist(file, since) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const map = lines.find((l) => l.startsWith("#EXT-X-MAP"));
  const segs = [];
  lines.forEach((l, i) => {
    if (l.startsWith("#EXTINF")) segs.push([l, lines[i + 1]]);
  });
  const head = Math.min(segs.length - 1, LIVE_WINDOW - 1 + Math.floor((Date.now() - since) / 4000));
  const first = Math.max(0, head - LIVE_WINDOW + 1);
  const out = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-TARGETDURATION:4", "#EXT-X-MEDIA-SEQUENCE:" + first, map];
  for (let i = first; i <= head; i++) out.push(...segs[i]);
  return out.join("\n") + "\n";
}

function serveLive(server, req, res, rest) {
  const file = path.normalize(path.join(LIVE, rest));
  if (!file.startsWith(LIVE) || !fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  if (rest === "master.m3u8") server.liveSince = Date.now();
  if (rest.endsWith("/index.m3u8")) {
    res.writeHead(200, { "Content-Type": types[".m3u8"], "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    res.end(livePlaylist(file, server.liveSince || Date.now()));
    return;
  }
  serveFile(req, res, file);
}

export function start(port = 0, extra = {}) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath.startsWith("/live/")) {
      serveLive(server, req, res, urlPath.slice("/live/".length));
      return;
    }
    if (urlPath.startsWith("/stall/")) {
      serveStalled(server, req, res, path.join(roots["/fixtures/"], "media", path.basename(urlPath)));
      return;
    }
    let file = resolve(urlPath, server.extra);
    if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    serveFile(req, res, file);
  });
  server.extra = extra;
  server.stallAt = 0;
  server.stalled = null;
  server.stall = (at) => {
    server.stallAt = at;
    server.stalled = new Set();
  };
  server.release = () => {
    const all = server.stalled || [];
    server.stalled = null;
    all.forEach((go) => go());
  };
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] === import.meta.filename) {
  start(+process.env.PORT || 8765).then((s) => {
    const port = s.address().port;
    console.log(`http://127.0.0.1:${port}/  (cross-origin: http://localhost:${port}/)`);
  });
}
