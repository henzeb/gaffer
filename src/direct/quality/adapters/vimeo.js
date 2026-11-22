import { menuAdapter } from "./dom-menu.js";

const VIMEO = '.vp-video-wrapper,.vp-player-layout,[data-vimeo-player],[class*="vp-player"]';

export function isVimeo() {
  return /(^|\.)vimeo\.com$/.test(location.hostname) || !!document.querySelector(VIMEO);
}

export function vimeoAdapter() {
  return isVimeo() ? menuAdapter(() => document.body) : null;
}
