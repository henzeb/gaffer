const TYPES = {
  mp4: { description: "MP4", mime: "video/mp4" },
  webm: { description: "WebM", mime: "video/webm" },
  m4a: { description: "MP4 audio", mime: "audio/mp4" },
};

function memoryWriter(name, mime) {
  const parts = [];
  let size = 0;
  return {
    name,
    memory: true,
    get size() {
      return size;
    },
    write(b) {
      parts.push(b);
      size += b.length;
      return Promise.resolve();
    },
    async close() {
      const url = URL.createObjectURL(new Blob(parts, { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    async abort() {
      parts.length = 0;
    },
  };
}

function fileWriter(handle, stream) {
  let chain = Promise.resolve();
  let size = 0;
  let failed = null;
  return {
    name: handle.name,
    memory: false,
    get size() {
      return size;
    },
    write(b) {
      size += b.length;
      chain = chain.then(() => (failed ? null : stream.write(b))).catch((e) => {
        failed = failed || e;
        throw e;
      });
      return chain;
    },
    async close() {
      await chain.catch(() => {});
      if (failed) throw failed;
      await stream.close();
    },
    async abort() {
      await chain.catch(() => {});
      try {
        await stream.abort();
      } catch (e) {}
      try {
        if (handle.remove) await handle.remove();
      } catch (e) {}
    },
  };
}

export function extensionOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "mp4";
}

export async function openWriter(name, { extra = false } = {}) {
  const type = TYPES[extensionOf(name)] || TYPES.mp4;
  const test = window.__gafferWriter;
  if (typeof test === "function") return test(name, { extra });
  if (!extra && typeof window.showSaveFilePicker === "function") {
    const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: type.description, accept: { [type.mime]: ["." + extensionOf(name)] } }] });
    return fileWriter(handle, await handle.createWritable());
  }
  return memoryWriter(name, type.mime);
}

export function fileName(ext, date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const site = (location.hostname || "video").replace(/^www\./, "");
  return site + "-" + date.getFullYear() + "-" + p(date.getMonth() + 1) + "-" + p(date.getDate()) + "-" + p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds()) + "." + ext;
}

export function partName(name, n, suffix = "part" + n) {
  return name.replace(/(\.[a-z0-9]+)?$/i, (ext) => "-" + suffix + (ext || ".mp4"));
}
