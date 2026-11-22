// Direct's rules for the video and the site's elements, also in the shadow root
// the video lies in: the page's stylesheets do not reach into it (SPEC §11.3).
// An adopted stylesheet of its own, so the site's styles stay untouched and
// closing only has to take it away again.
import { state as s } from "../state.js";
import { SITE_CSS } from "../ui/styles.js";

let sheet = null;
let root = null;

export function releaseShadowStyle() {
  if (root) {
    try {
      root.adoptedStyleSheets = root.adoptedStyleSheets.filter((x) => x !== sheet);
    } catch (e) {}
  }
  root = null;
  sheet = null;
}

// text: the rules of the moment for this video (transform, exposure).
export function shadowStyle(text) {
  const r = s.v ? s.v.getRootNode() : null;
  const want = r && r.host && "adoptedStyleSheets" in r ? r : null;
  if (want !== root) {
    releaseShadowStyle();
    if (want) {
      try {
        sheet = new CSSStyleSheet();
        want.adoptedStyleSheets = want.adoptedStyleSheets.concat([sheet]);
        root = want;
      } catch (e) {
        sheet = null;
      }
    }
  }
  if (sheet) sheet.replaceSync(SITE_CSS + text);
}
