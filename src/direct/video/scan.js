import { state as s, resetView } from "../state.js";
import { render } from "../view/transform.js";
import { place, show, checkOverlay } from "../ui/bar.js";
import { keepCursor } from "../ui/cursor.js";
import { updateLayer } from "../view/layer.js";
import { hideSiteControls } from "./site-controls.js";
import { updateQuality } from "../quality/index.js";
import { updateTracks } from "../tracks/index.js";
import { candidate } from "./pick.js";
import { attach } from "./attach.js";
import { renderCast } from "../playback/cast.js";
import { renderNav } from "../playback/sitenav.js";
import { followAds } from "./ad.js";
import { updateChapters } from "../playback/chapters.js";
import { tell } from "../tell.js";
import { t } from "../../shared/i18n.js";

// The number of site elements Direct hides, when it changes (SPEC §12.2).
let toldHidden = 0;
function tellHidden() {
  const n = s.hidden.length;
  if (n === toldHidden) return;
  toldHidden = n;
  tell(t("direct.tell.hidden", { count: n }));
}

export function scan() {
  place();
  if (s.v) {
    followAds();
    hideSiteControls();
    tellHidden();
    checkOverlay();
    keepCursor();
    updateLayer();
    if (!s.ad) {
      updateQuality();
      updateTracks();
    }
    updateChapters();
    renderCast();
    renderNav();
  }
  if (s.F && s.v && s.v.isConnected) return;
  const h = location.href;
  const urlChanged = h !== s.lastHref;
  s.lastHref = h;
  const ok = !!s.bound && s.bound.isConnected && candidate(s.bound);
  if (!s.v) {
    if (ok) {
      attach(s.bound);
      show(true);
      s.shown = true;
    }
    return;
  }
  if (urlChanged) {
    resetView();
    render();
  }
  if (ok !== s.shown) {
    show(ok);
    s.shown = ok;
  }
}
