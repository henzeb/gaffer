// Elements in shadow roots (SPEC §11.1): Direct and Inspect follow a video into
// the shadow roots of a page. Open ones through element.shadowRoot, closed ones
// only when capture saw them being made (__gafferCapture.shadowOf).

// A page full of elements is walked again at most this often, for shadow roots
// made before capture started.
const WALK_MS = 5000;

function capture() {
  try {
    const c = window.__gafferCapture;
    return c && typeof c.shadowOf === "function" ? c : null;
  } catch (e) {
    return null;
  }
}

export function shadowOf(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.shadowRoot) return el.shadowRoot;
  const c = capture();
  return c ? c.shadowOf(el) || null : null;
}

// The parent as the page is drawn (the flat tree): the slot an element is shown
// in, from the top of a shadow root on to its host, otherwise the parent
// element. A slot in a closed shadow root is not given; then the parent counts.
export function deepParent(n) {
  if (!n) return null;
  const slot = n.assignedSlot;
  if (slot) return slot;
  const p = n.parentNode;
  if (!p) return null;
  if (p.nodeType === 11) return p.host || null;
  return p.nodeType === 1 ? p : null;
}

// The nearest drawn ancestor that is a box of its own: a slot has none.
export function boxParent(n) {
  let p = deepParent(n);
  while (p && p.localName === "slot") p = deepParent(p);
  return p;
}

export function deepContains(a, b) {
  if (!a || !b) return false;
  for (let n = b; n; n = deepParent(n)) if (n === a) return true;
  return false;
}

export function deepClosest(el, sel) {
  for (let n = el; n; ) {
    let hit = null;
    try {
      hit = n.closest ? n.closest(sel) : null;
    } catch (e) {
      return null;
    }
    if (hit) return hit;
    const root = n.getRootNode ? n.getRootNode() : null;
    n = root && root.host ? root.host : null;
  }
  return null;
}

// The element of the page itself (not in a shadow root) that holds this one:
// itself, or the outermost host around it.
export function inDocument(n) {
  let x = n;
  for (let i = 0; x && i < 50; i++) {
    const r = x.getRootNode ? x.getRootNode() : null;
    if (!r || !r.host) return x;
    x = r.host;
  }
  return x;
}

export function inShadow(n) {
  const r = n && n.getRootNode ? n.getRootNode() : null;
  return !!(r && r.host);
}

// The element under a point, also inside shadow roots.
export function deepElementFromPoint(x, y) {
  let el = document.elementFromPoint(x, y);
  for (let i = 0; el && i < 20; i++) {
    const root = shadowOf(el);
    if (!root) break;
    const inner = root.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

// The element an event really happened on, also inside an open shadow root
// (inside a closed one it stays the host).
export function targetOf(e) {
  const p = e && typeof e.composedPath === "function" ? e.composedPath() : null;
  const t = p && p[0];
  return t && t.nodeType === 1 ? t : e.target;
}

// Every element that matches under root, also in the shadow roots below it.
export function deepQueryAll(root, sel) {
  const out = [];
  const visit = (r) => {
    let list = [];
    try {
      list = r.querySelectorAll(sel);
    } catch (e) {
      return;
    }
    for (let i = 0; i < list.length; i++) out.push(list[i]);
    const own = r.nodeType === 1 ? shadowOf(r) : null;
    if (own) visit(own);
    const all = r.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const s = shadowOf(all[i]);
      if (s) visit(s);
    }
  };
  if (root) visit(root);
  return out;
}

export function deepQuery(root, sel) {
  return deepQueryAll(root, sel)[0] || null;
}

// The children of an element as they are drawn: of a host those of its shadow
// root (its own children only show through its slots), of a slot what is
// assigned to it.
export function deepChildren(el) {
  if (el.localName === "slot" && typeof el.assignedElements === "function") {
    const a = el.assignedElements();
    if (a.length) return a;
  }
  const s = shadowOf(el);
  return [].slice.call(s ? s.children : el.children);
}

let walked = [];
let walkedAt = -Infinity;

function walk() {
  const out = [];
  const visit = (r) => {
    const all = r.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      const s = shadowOf(all[i]);
      if (s) {
        out.push(s);
        visit(s);
      }
    }
  };
  visit(document);
  return out;
}

// The shadow roots of the page: the ones capture saw being made, and the open
// ones found by walking the page.
export function shadowRoots() {
  const now = Date.now();
  if (now - walkedAt >= WALK_MS) {
    walked = walk();
    walkedAt = now;
  }
  const c = capture();
  const known = c && typeof c.roots === "function" ? c.roots() : [];
  return [...new Set(walked.concat(known))].filter((r) => r.host && r.host.isConnected);
}

// Every video of the page, also those in shadow roots.
export function allVideos() {
  const out = [].slice.call(document.querySelectorAll("video"));
  for (const r of shadowRoots()) {
    const list = r.querySelectorAll("video");
    for (let i = 0; i < list.length; i++) if (out.indexOf(list[i]) < 0) out.push(list[i]);
  }
  return out;
}
