import { state as s, quality as q, els } from "../../state.js";
import { guessQuality, dedupe, heightOf, isOriginal } from "../labels.js";
import { restoreStyle } from "../../video/site-controls.js";
import { showOsd } from "../../ui/osd.js";
import { renderQuality } from "../render.js";
import { qualityLabel } from "../index.js";
import { t } from "../../../shared/i18n.js";
import { ms } from "../../../shared/timing.js";
import { safe } from "../../safe.js";
import { tell, nameOf } from "../../tell.js";
import { deepParent, deepQueryAll } from "../../../shared/deep.js";

const BUTTON = /qualit|kwaliteit|resolu/i;

function siteButton() {
  const v = s.v;
  let a = v;
  let lim = 0;
  while (a && deepParent(a) && deepParent(a) !== document.body && lim < 10) {
    a = deepParent(a);
    lim++;
    if (a.offsetHeight > v.offsetHeight * 1.6 + 250 || a.offsetWidth > v.offsetWidth * 1.6 + 250) break;
    const bs = deepQueryAll(a, 'button,[role="button"]');
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (els.bar.contains(b) || els.top.contains(b)) continue;
      const t = (b.getAttribute("title") || "") + " " + (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-testid") || "");
      if (BUTTON.test(t)) return b;
    }
  }
  return null;
}

function ours(n) {
  return n === els.bar || n === els.top || n === els.osd || els.bar.contains(n) || els.top.contains(n) || (n.id && String(n.id).indexOf("vu-") === 0);
}

function text(e) {
  return (e.textContent || "").replace(/\s+/g, " ").trim();
}

function active(e) {
  for (let k = 0; k < 2 && e; k++, e = e.parentElement) {
    if (/(^|[\s_-])(active|selected|checked|current|is-active)([\s_-]|$)/i.test(typeof e.className === "string" ? e.className : "") || e.getAttribute("aria-checked") === "true" || e.getAttribute("aria-selected") === "true") return true;
    const inp = e.querySelector && e.querySelector('input[type="checkbox"],input[type="radio"]');
    if (inp && inp.checked) return true;
    if (e.getAttribute("role") === "switch" && e.getAttribute("aria-checked") === "true") return true;
  }
  return false;
}

const all = (r) => [r].concat([].slice.call(r.querySelectorAll("*")));

export function readItems(roots) {
  const out = [];
  const seen = {};
  function add(el, id, label) {
    const key = String(id).toLowerCase();
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ el, id, label, h: id === "auto" ? 99999 : heightOf(label), act: active(el) });
  }
  roots.forEach((r) => {
    if (!r.isConnected) return;
    all(r).forEach((e) => {
      const d = e.getAttribute("data-resolution") || e.getAttribute("data-quality") || e.getAttribute("data-res");
      if (d && String(d).length < 20 && (guessQuality(d) || isOriginal(d) || /^auto$/i.test(d))) {
        const tl = text(e);
        const lab = tl && tl.length <= 24 && tl.toLowerCase().indexOf(String(d).toLowerCase()) >= 0 ? tl : d;
        add(e, /^auto$/i.test(d) ? "auto" : d, /^auto$/i.test(d) ? t("direct.quality.auto") : lab);
      }
    });
  });
  if (out.length < 2) {
    roots.forEach((r) => {
      if (!r.isConnected) return;
      all(r).forEach((e) => {
        if (e.children.length && text(e.children[0]) === text(e)) return;
        const t = text(e);
        if (/^(\d{3,4}p\d{0,2}|4k|8k)$/i.test(t) || (t.length <= 24 && isOriginal(t))) add(e, t, t);
      });
    });
  }
  roots.forEach((r) => {
    if (!r.isConnected) return;
    all(r).forEach((e) => {
      if (e.children.length > 1) return;
      if (/^auto$/i.test(text(e)) && !seen.auto) {
        const c = e.closest('label,button,[role="switch"],[role="checkbox"],[role="menuitemradio"]') || (e.parentElement && e.parentElement.querySelector('input,[role="switch"],button')) || e;
        add(c, "auto", "Auto");
      }
    });
  });
  const opts = out.filter((x) => x.id !== "auto").map((x) => x.el);
  out.autoNow = false;
  if (opts.length) {
    roots.forEach((r) => {
      if (!r.isConnected) return;
      all(r).forEach((e) => {
        if (e.children.length) return;
        const t = text(e);
        if (!/^\d{3,4}p\d{0,2}$/i.test(t)) return;
        if (opts.some((o) => o === e || o.contains(e))) return;
        if (e.closest("[data-resolution],[data-quality],[data-res]")) return;
        out.autoNow = true;
        out.autoRes = t;
      });
    });
  }
  return out;
}

// A click as a mouse gives it, for site controls that listen to more than click.
export function fire(el) {
  tell(t("direct.tell.siteClick", { button: nameOf(el) }));
  const rc = el.getBoundingClientRect();
  const x = rc.left + rc.width / 2;
  const y = rc.top + rc.height / 2;
  const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0 };
  function pe(t, b) {
    if (typeof PointerEvent === "function") {
      const init = { pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: b };
      for (const k in o) init[k] = o[k];
      el.dispatchEvent(new PointerEvent(t, init));
    }
  }
  function me(t, b) {
    const init = { buttons: b };
    for (const k in o) init[k] = o[k];
    el.dispatchEvent(new MouseEvent(t, init));
  }
  try {
    pe("pointerover", 0);
    me("mouseover", 0);
    pe("pointerdown", 1);
    me("mousedown", 1);
    pe("pointerup", 0);
    me("mouseup", 0);
    me("click", 0);
  } catch (e) {
    try {
      el.click();
    } catch (x2) {}
  }
}

function wakePointer(b) {
  try {
    const rc = b.getBoundingClientRect();
    const x = rc.left + rc.width / 2;
    const y = rc.top + rc.height / 2;
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, relatedTarget: null };
    const P = typeof PointerEvent === "function";
    const pe = (el, t, bub) => {
      if (!P) return;
      const init = { pointerId: 1, pointerType: "mouse", isPrimary: true };
      for (const k in o) init[k] = o[k];
      init.bubbles = bub;
      el.dispatchEvent(new PointerEvent(t, init));
    };
    const me = (el, t, bub) => {
      const init = {};
      for (const k in o) init[k] = o[k];
      init.bubbles = bub;
      el.dispatchEvent(new MouseEvent(t, init));
    };
    pe(b, "pointerover", true);
    me(b, "mouseover", true);
    let a = b;
    const ch = [];
    while (a && a !== document.body) {
      ch.unshift(a);
      a = a.parentElement;
    }
    ch.forEach((el) => {
      pe(el, "pointerenter", false);
      me(el, "mouseenter", false);
    });
    [s.v, s.v && s.v.parentElement].forEach((el) => {
      if (el) {
        pe(el, "pointermove", true);
        me(el, "mousemove", true);
      }
    });
    pe(b, "pointermove", true);
    me(b, "mousemove", true);
  } catch (e) {}
}

function openNearby() {
  const n = [].slice.call(document.querySelectorAll("[data-resolution],[data-quality]")).filter((e) => !ours(e) && !e.parentElement.closest("[data-resolution],[data-quality]"));
  if (n.length < 2) return [];
  let c = n[0].parentElement;
  while (c && !c.contains(n[n.length - 1])) c = c.parentElement;
  if (c && c.parentElement && c.parentElement !== document.body) c = c.parentElement;
  return c ? readItems([c]) : [];
}

function shown(x) {
  return x.el.isConnected && !!(x.el.offsetWidth || x.el.offsetHeight);
}

function probe(act, done) {
  const pq = q.pq;
  if (pq.busy) {
    if (act) pq.queue = { act, done };
    else if (done) done(null);
    return;
  }
  const b = siteButton();
  if (!b) {
    if (done) done(null);
    return;
  }
  pq.busy = true;
  const added = [];
  const mo = new MutationObserver(safe((ms) => {
    ms.forEach((m) => {
      [].forEach.call(m.addedNodes, (n) => {
        if (n.nodeType !== 1 || ours(n)) return;
        added.push({ el: n, st: n.getAttribute("style") });
        try {
          n.style.setProperty("visibility", "hidden", "important");
        } catch (e) {}
      });
    });
  }, "quality menu"));
  mo.observe(document.body, { childList: true, subtree: true });
  function fin(res, ar) {
    mo.disconnect();
    added.forEach((x) => {
      if (!x.el.isConnected) return;
      restoreStyle(x.el, x.st);
    });
    pq.busy = false;
    if (done) done(res, ar);
    if (pq.queue) {
      const qq = pq.queue;
      pq.queue = null;
      setTimeout(() => probe(qq.act, qq.done), 30);
    }
  }
  function settle(res, ar) {
    const t2 = Date.now();
    (function w() {
      if (!res.some(shown) || Date.now() - t2 > 400) fin(res, ar);
      else setTimeout(w, 50);
    })();
  }
  function close(res, ar) {
    const t1 = Date.now();
    (function c() {
      if (!res.some(shown)) {
        settle(res, ar);
        return;
      }
      if (Date.now() - t1 >= (act ? 250 : 0)) {
        try {
          b.click();
        } catch (e) {}
        settle(res, ar);
        return;
      }
      setTimeout(c, 50);
    })();
  }
  const pre = openNearby();
  const t0 = Date.now();
  function look() {
    let its = readItems(added.map((x) => x.el));
    if (its.length < 2) its = openNearby();
    return its.length >= 2 ? its : null;
  }
  function step() {
    const res = pre.length >= 2 ? pre : look();
    if (res) {
      let ar = null;
      if (act) {
        try {
          ar = act(res);
        } catch (e) {}
      }
      close(res, ar);
      return;
    }
    if (Date.now() - t0 > 1600) {
      fin(null);
      return;
    }
    setTimeout(step, 50);
  }
  if (pre.length >= 2) step();
  else {
    wakePointer(b);
    setTimeout(() => {
      wakePointer(b);
      try {
        b.click();
      } catch (e) {}
      setTimeout(step, 40);
    }, 120);
  }
}

function store(res) {
  if (!res) return;
  const pq = q.pq;
  pq.btn = siteButton();
  pq.at = Date.now();
  pq.items = res
    .map((x, i) => ({ id: x.id, label: x.id === "auto" && res.autoNow ? t("direct.quality.auto") : x.label, h: x.h, o: i }))
    .sort((a, b) => b.h - a.h || a.o - b.o);
  if (pq.own) return;
  let cur = null;
  let au = null;
  res.forEach((x) => {
    if (x.id === "auto") {
      au = x;
      return;
    }
    if (x.act && cur === null) cur = x.id;
  });
  if (res.autoNow) cur = "auto";
  else if (cur === null && au && au.act) cur = "auto";
  if (cur === null && s.v && s.v.videoHeight) {
    res.forEach((x) => {
      if (cur === null && x.id !== "auto" && x.h === s.v.videoHeight) cur = x.id;
    });
  }
  pq.cur = cur;
}

function itemHeight(id) {
  const l = q.pq.items || [];
  for (let i = 0; i < l.length; i++) if (String(l[i].id) === String(id)) return l[i].h;
  return 0;
}

function confirmed() {
  const pq = q.pq;
  if (!pq.pend) return;
  pq.cur = pq.want;
  pq.pend = 0;
  q.sel = null;
  q.sig = "";
  showOsd(qualityLabel(pq.cur) || String(pq.cur));
  renderQuality();
}

export function onResize() {
  if (!s.v) return;
  if (q.pq.pend && q.pq.want !== "auto") confirmed();
  else {
    q.sig = "";
    renderQuality();
  }
}

function failed(message) {
  q.pq.pend = 0;
  q.sel = null;
  showOsd(message);
}

function portalAdapter() {
  return {
    list() {
      return dedupe(q.pq.items || []);
    },
    cur() {
      return q.pq.cur;
    },
    pend() {
      return q.pq.pend ? q.pq.want : null;
    },
    stale() {
      return !q.pq.at || Date.now() - q.pq.at > 60000;
    },
    set(id) {
      const pq = q.pq;
      pq.own = true;
      const el0 = s.v;
      const h0 = s.v ? s.v.videoHeight : 0;
      const th = itemHeight(id);
      pq.want = id;
      pq.pend = Date.now();
      const mine = pq.pend;
      renderQuality();
      function choose(its) {
        if (id === "auto") {
          if (its.autoNow) return "same";
          const au = its.filter((x) => x.id === "auto")[0];
          if (au) {
            fire(au.el);
            return null;
          }
          return "missing";
        }
        const t = its.filter((x) => String(x.id) === String(id))[0];
        if (!t) return "missing";
        fire(t.el);
        return null;
      }
      probe(choose, (r, ar) => {
        if (q.pq.pend !== mine) return;
        if (!r) {
          failed(t("direct.quality.menuMissing"));
          renderQuality();
          return;
        }
        if (ar === "missing") {
          q.pq.own = false;
          store(r);
          failed(t("direct.quality.gone", { label: qualityLabel(id) }));
          q.sig = "";
          renderQuality();
          return;
        }
        if (id === "auto" || ar === "same" || (th && s.v && s.v.videoHeight === th)) {
          confirmed();
          return;
        }
        setTimeout(() => {
          if (q.pq.pend !== mine || !s.v || s.v !== el0) return;
          probe(null, (r2) => {
            if (q.pq.pend !== mine) return;
            let act = null;
            if (r2) {
              r2.forEach((x) => {
                if (x.id !== "auto" && x.act && act === null) act = x.id;
              });
            }
            if (String(act) === String(id) || (s.v && s.v.videoHeight !== h0)) {
              confirmed();
              return;
            }
            failed(t("direct.quality.noResponse"));
            q.sig = "";
            renderQuality();
          });
        }, 6000);
      });
    },
    refresh(cb) {
      probe(null, (r) => {
        if (r) store(r);
        if (cb) cb();
      });
    },
  };
}

function got(r) {
  if (!r) return;
  store(r);
  if (!q.adapter && s.v) q.adapter = portalAdapter();
  renderQuality();
}

export function readPortalNow() {
  if (!q.pq.busy) {
    q.pq.next = Date.now() + ms(3000);
    probe(null, (r) => {
      got(r);
      renderQuality();
    });
  }
}

export function findPortal() {
  const pq = q.pq;
  const b = siteButton();
  pq.has = !!b;
  if (!b) return null;
  if (pq.items && pq.items.length >= 2 && pq.btn && pq.btn.isConnected) return portalAdapter();
  if (!pq.busy && Date.now() >= pq.next) {
    pq.tries++;
    pq.next = Date.now() + ms(pq.tries < 10 ? 3000 : 15000);
    probe(null, got);
  }
  return null;
}
