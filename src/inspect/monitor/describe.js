import { shortIn } from "../../shared/address.js";
export function describe(a) {
  if (!a || !a.tagName) return "?";
  const c = typeof a.className === "string" ? a.className.trim() : (a.getAttribute && a.getAttribute("class")) || "";
  return a.tagName.toLowerCase() + (a.id ? "#" + a.id : "") + (c ? "." + c.split(/\s+/).slice(0, 3).join(".") : "") + (a.getAttribute("role") ? "[role=" + a.getAttribute("role") + "]" : "") + (a.getAttribute("data-testid") ? "[data-testid=" + a.getAttribute("data-testid") + "]" : "");
}

export function path(a) {
  const p = [];
  let n = a;
  for (let i = 0; i < 5 && n && n.tagName && n !== document.body; i++) {
    p.unshift(describe(n));
    n = n.parentElement;
  }
  return p.join(" > ");
}

export function text(a) {
  const t = (a.textContent || "").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 60) + "…" : t;
}

export function attributes(el) {
  const r = [];
  let a = el;
  for (let k = 0; k < 3 && a && a.attributes; k++, a = a.parentElement) {
    [].forEach.call(a.attributes, (x) => {
      if (/^data-|^value$|^aria-label$|^aria-checked$|^aria-selected$|^title$/.test(x.name) && x.value.length < 60) r.push(x.name + "=" + shortIn(x.value));
    });
  }
  return r.slice(0, 10).join(" ");
}

export function reactInfo(el) {
  const r = [];
  let a = el;
  for (let k = 0; k < 4 && a; k++, a = a.parentElement) {
    const fk = Object.keys(a).filter((x) => x.indexOf("__reactFiber") === 0 || x.indexOf("__reactProps") === 0)[0];
    if (!fk) continue;
    const mp = fk.indexOf("__reactProps") === 0 ? a[fk] : a[fk] && a[fk].memoizedProps;
    let f = fk.indexOf("__reactFiber") === 0 ? a[fk] : null;
    if (f) {
      for (let n = 0; f && n < 6; n++, f = f.return) {
        const t = f.type;
        if (t && typeof t !== "string") {
          const nm = t.displayName || t.name || "";
          const p = f.memoizedProps;
          if (p && typeof p === "object") {
            const bits = [];
            Object.keys(p).forEach((pk) => {
              if (pk === "children") return;
              const v = p[pk];
              const ty = typeof v;
              if (ty === "function") bits.push(pk + "()");
              else if (ty === "string" || ty === "number" || ty === "boolean") bits.push(pk + "=" + shortIn(String(v)).slice(0, 30));
              else if (v && ty === "object" && !v.$$typeof && !(v instanceof Node)) bits.push(pk + "={" + Object.keys(v).slice(0, 5).join(",") + "}");
            });
            if (bits.length) r.push((nm || "?") + "(" + bits.slice(0, 10).join(", ") + ")");
          }
        }
      }
    } else if (mp) {
      const b2 = [];
      Object.keys(mp).forEach((pk) => {
        if (pk !== "children" && typeof mp[pk] === "function") b2.push(pk + "()");
      });
      if (b2.length) r.push("props: " + b2.join(", "));
    }
    if (r.length) break;
  }
  return r.slice(0, 4);
}
