const MANIFEST = /\.m3u8|\.mpd|manifest|playlist/i;

export function isManifestUrl(u) {
  return MANIFEST.test(u);
}

export function hookManifests(onBody) {
  const undo = [];
  const of = window.fetch;
  if (of) {
    const nf = function (inp) {
      const p = of.apply(this, arguments);
      try {
        const u = typeof inp === "string" ? inp : (inp && inp.url) || String(inp);
        if (MANIFEST.test(u)) {
          p.then(
            (r) => {
              try {
                r.clone().text().then((t) => onBody(u, t), () => {});
              } catch (x) {}
            },
            () => {},
          );
        }
      } catch (x) {}
      return p;
    };
    window.fetch = nf;
    undo.push(() => {
      if (window.fetch === nf) window.fetch = of;
    });
  }
  const XP = XMLHttpRequest.prototype;
  const oo = XP.open;
  const os = XP.send;
  const ownOpen = function (m, u) {
    try {
      this.__vaU = String(u);
    } catch (x) {}
    return oo.apply(this, arguments);
  };
  const ownSend = function () {
    const x = this;
    try {
      if (x.__vaU && MANIFEST.test(x.__vaU)) {
        x.addEventListener("load", () => {
          try {
            if (!x.responseType || x.responseType === "text") onBody(x.__vaU, x.responseText);
            else if (x.responseType === "arraybuffer" && x.response) onBody(x.__vaU, new TextDecoder().decode(x.response));
          } catch (e) {}
        });
      }
    } catch (e) {}
    return os.apply(this, arguments);
  };
  XP.open = ownOpen;
  XP.send = ownSend;
  // Only our own: a later patch by the page stays.
  undo.push(() => {
    if (XP.open === ownOpen) XP.open = oo;
    if (XP.send === ownSend) XP.send = os;
  });
  return () => undo.forEach((f) => f());
}
