export function hasPopover() {
  return typeof HTMLElement.prototype.showPopover === "function";
}

export function el(tag, cls, txt, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  if (parent) parent.appendChild(e);
  return e;
}

export function button(parent, text, tip, onClick, cls) {
  const b = el("button", cls || "", text, parent);
  b.title = tip;
  b.onclick = (e) => {
    e.stopPropagation();
    onClick(e);
  };
  return b;
}

export function showInTopLayer(e) {
  if (!e.showPopover) return;
  try {
    e.showPopover();
  } catch (x) {}
}

export function raise(e) {
  if (!e.hidePopover) return;
  try {
    e.hidePopover();
    e.showPopover();
  } catch (x) {}
}

// Writes only what changed. Every write makes the browser lay out and paint
// the page again, which costs a lot on a page with a large DOM.
export function setText(e, text) {
  if (e.textContent !== text) e.textContent = text;
}

export function setStyle(st, key, value) {
  if (st.getPropertyValue(key) !== value || st.getPropertyPriority(key) !== "important") st.setProperty(key, value, "important");
}
