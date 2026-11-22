import crypto from "node:crypto";
import http from "node:http";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const PING_INTERVAL = 20000;

export function acceptKey(key) {
  return crypto.createHash("sha1").update(key + GUID).digest("base64");
}

export function encodeFrame(text, opcode = 1) {
  const payload = Buffer.from(text);
  const n = payload.length;
  let head;
  if (n < 126) {
    head = Buffer.from([0x80 | opcode, n]);
  } else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

export function startServer({ port, host = "127.0.0.1", hello, pingInterval = PING_INTERVAL }) {
  const clients = new Set();
  const server = http.createServer((req, res) => {
    res.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
    res.end("Gaffer (dev): alleen WebSocket\n");
  });

  const send = (socket, msg) => {
    try {
      socket.write(encodeFrame(JSON.stringify(msg)));
    } catch {
      clients.delete(socket);
    }
  };

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
      socket.destroy();
      return;
    }
    socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Accept: " + acceptKey(key), "", ""].join("\r\n"));
    socket.setNoDelay(true);
    clients.add(socket);
    const drop = () => clients.delete(socket);
    socket.on("close", drop);
    socket.on("error", drop);
    socket.on("data", (data) => {
      if ((data[0] & 0x0f) === 8) {
        socket.end(encodeFrame("", 8));
        drop();
      }
    });
    send(socket, { type: "hello", ...hello() });
  });

  const timer = setInterval(() => {
    for (const s of clients) send(s, { type: "ping" });
  }, pingInterval);

  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      server.off("error", fail);
      ok({
        port: server.address().port,
        clients,
        broadcast(msg) {
          for (const s of clients) send(s, msg);
        },
        close() {
          clearInterval(timer);
          for (const s of clients) s.destroy();
          return new Promise((done) => server.close(() => done()));
        },
      });
    });
  });
}
