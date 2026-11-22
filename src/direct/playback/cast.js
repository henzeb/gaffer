import { state as s, els } from "../state.js";
import { showOsd } from "../ui/osd.js";
import { t } from "../../shared/i18n.js";
import { safe } from "../safe.js";

const STATES = ["connect", "connecting", "disconnect"];
let watch = null;

function isMse(v) {
  return !!v.srcObject || /^blob:/.test(v.currentSrc || v.src || "");
}

export function renderCast() {
  const b = els.cast;
  if (!b) return;
  const v = s.v;
  const ok = !!(watch && watch.v === v && watch.available);
  b.classList.toggle("gone", !ok);
  if (!ok) return;
  const mse = isMse(v);
  const st = v.remote.state;
  b.classList.toggle("off", mse && st === "disconnected");
  b.classList.toggle("live", st !== "disconnected");
  b.textContent = st === "connected" ? t("direct.cast.active") : st === "connecting" ? t("direct.cast.connecting") : t("direct.cast");
  b.title = mse && st === "disconnected" ? t("direct.cast.unsupported") : st === "disconnected" ? t("direct.cast.tip") : t("direct.cast.stop");
}

export function stopCast() {
  if (!watch) return;
  const w = watch;
  watch = null;
  STATES.forEach((n) => w.v.remote.removeEventListener(n, onCast));
  if (w.id !== null) {
    try {
      const p = w.v.remote.cancelWatchAvailability(w.id);
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  renderCast();
}

const onCast = safe(renderCast, "cast");

export function watchCast(v) {
  stopCast();
  if (!v || !v.remote || v.disableRemotePlayback || typeof v.remote.watchAvailability !== "function") return renderCast();
  const w = { v, id: null, available: false };
  watch = w;
  STATES.forEach((n) => v.remote.addEventListener(n, onCast));
  try {
    v.remote
      .watchAvailability((available) => {
        if (watch !== w) return;
        w.available = !!available;
        renderCast();
      })
      .then(
        (id) => {
          if (watch === w) w.id = id;
          else {
            try {
              const p = v.remote.cancelWatchAvailability(id);
              if (p && p.catch) p.catch(() => {});
            } catch (e) {}
          }
        },
        () => {
          if (watch === w) w.available = false;
          renderCast();
        },
      );
  } catch (e) {}
  renderCast();
}

export function castClick() {
  const v = s.v;
  if (!v || !v.remote) return;
  if (isMse(v) && v.remote.state === "disconnected") {
    showOsd(t("direct.cast.unsupported"));
    return;
  }
  try {
    const p = v.remote.prompt();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
