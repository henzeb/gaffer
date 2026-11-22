export function createOsd(id, popover) {
  const e = document.createElement("div");
  e.id = id;
  if (popover) e.setAttribute("popover", "manual");
  let timer = null;
  return {
    el: e,
    show(text) {
      e.textContent = text;
      e.classList.add("show");
      clearTimeout(timer);
      timer = setTimeout(() => e.classList.remove("show"), 700);
    },
    remove() {
      clearTimeout(timer);
      e.remove();
    },
  };
}
