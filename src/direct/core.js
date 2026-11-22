import { hasPopover } from "../shared/dom.js";
import { isolate } from "./view/layer.js";
import { banner, errorText, setQuiet } from "../shared/errors.js";
import { load } from "../shared/storage.js";
import { state as s, quality as q, onClose, runCleanups } from "./state.js";
import { host, setHost } from "./host.js";
import { injectStyles } from "./ui/styles.js";
import { createBar, buildRows, place, show } from "./ui/bar.js";
import { createTop, buildTop } from "./ui/topbar.js";
import { buildPanel, installPanel } from "./ui/panel.js";
import { createDirectOsd } from "./ui/osd.js";
import { createLoader } from "./ui/loader.js";
import { render } from "./view/transform.js";
import { onFullscreenChange } from "./view/fullscreen.js";
import { candidate } from "./video/pick.js";
import { attach, detach } from "./video/attach.js";
import { scan } from "./video/scan.js";
import { guard } from "./playback/buffer-guard.js";
import { installBuffering } from "./playback/buffering.js";
import { installMouse } from "./input/mouse.js";
import { installWheel } from "./input/wheel.js";
import { installKeyboard } from "./input/keyboard.js";
import { installHold } from "./playback/hold.js";
import { installPopups } from "./ui/popup.js";
import { want } from "./playback/play.js";
import { installRecord } from "./record/index.js";
import { installLevel, levelTick } from "./level/index.js";
import { ms } from "../shared/timing.js";
import { installAds } from "./video/ad.js";
import { t } from "../shared/i18n.js";
import { directInfo } from "./info.js";
import { safe } from "./safe.js";

function onResize() {
  if (s.v) render();
}

export function start(video, h) {
  setHost(h);
  setQuiet(host.quiet);
  s.id = host.id;
  s.bound = video;
  s.pop = hasPopover();
  s.lastHref = location.href;
  q.maxOn = load("vu-max") !== "0";

  injectStyles();
  const bar = createBar();
  const top = createTop();
  buildTop();
  buildPanel();
  buildRows();
  const osd = createDirectOsd();
  const loader = createLoader();
  document.body.appendChild(loader);
  document.body.appendChild(top);
  document.body.appendChild(bar);
  document.body.appendChild(osd.el);
  isolate(top);
  isolate(bar);
  onClose(() => {
    clearTimeout(s.idleTimer);
    top.remove();
    bar.remove();
    osd.remove();
    loader.remove();
  });

  onClose(installLevel());
  if (candidate(video)) {
    try {
      attach(video);
    } catch (e) {
      banner(t("direct.error.attach", { error: errorText(e) }));
      console.error(e);
    }
    show(true);
    s.shown = true;
  } else {
    show(false);
  }
  onClose(detach);

  onClose(installHold());
  onClose(installPopups());
  onClose(installPanel());
  onClose(installMouse());
  onClose(installWheel());
  onClose(installKeyboard());
  onClose(installRecord());
  onClose(installAds());
  const onScroll = safe(place, "scroll");
  const onFull = safe(onFullscreenChange, "fullscreen");
  const onSize = safe(onResize, "resize");
  window.addEventListener("scroll", onScroll, true);
  document.addEventListener("fullscreenchange", onFull);
  window.addEventListener("resize", onSize);
  onClose(() => {
    window.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("fullscreenchange", onFull);
    window.removeEventListener("resize", onSize);
  });

  onClose(installBuffering(safe));
  const bufferTimer = setInterval(safe(guard, "buffer"), 250);
  const scanTimer = setInterval(safe(scan, "scan"), 1000);
  const levelTimer = setInterval(safe(levelTick, "level"), ms(250));
  onClose(() => {
    clearInterval(levelTimer);
    clearInterval(bufferTimer);
    clearInterval(scanTimer);
  });

  return {
    close: () => {
      s.closing = true;
      runCleanups();
    },
    refresh: place,
    info: () => directInfo(safe.errors),
    pause: () => want(false),
    activate: () => {
      if (!s.v) return;
      try {
        s.v.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (e) {}
      want(true);
    },
  };
}
