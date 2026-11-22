# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

Gaffer is a Chrome extension (Manifest V3) that loads two page tools on demand:

- **Gaffer Direct** (was "Video Control"): overlay controls for any video or live stream (rotate, flip, zoom, pan, playback, speed, quality, live mode, recording and downloading).
- **Gaffer Inspect** (was "Video Analyse"): a page analyser that produces a report about players, streams and manifests for a GitHub issue, with a monitor mode.

The extension carries Direct and Inspect in its package and is published in the Chrome Web Store, which does not allow code from elsewhere. Both tools are also built as bookmarklets from the same source.

## Source of truth

**`SPEC.md` is the specification. Build from it.** It describes the extension (Part A, §2–§10), Direct (Part B, §11), Inspect (Part C, §12), shared rules (§13), the code structure (§14) and the build order (§15).

- Everything in §8 has been decided. Don't reopen those decisions.
- Items marked **[gepland]** are not built yet. Everything else describes current behaviour that must be preserved.
- When the code and the spec disagree, or the spec is silent or ambiguous, ask the user. Don't guess. If a decision is made, update `SPEC.md` in the same change.

## Current state

- **Phase:** phases 1–16 are done.
- **Sources:** `src/direct/`, `src/capture/`, `src/inspect/`, `src/shared/` and `src/media/` follow §14. Captions and audio tracks per player live in `src/shared/tracks/` (pure lookups that take the video, also used by Inspect); `src/direct/tracks/` holds the CC and Audio buttons and the C shortcut. Direct exposes per-video info to Inspect through `window.__vuInfo(id)` (`src/direct/info.js`) and tells the monitor what it does with `gaffer:direct` events (`src/direct/tell.js`); every timer, handler and observer of Direct runs through the guard in `src/direct/safe.js`, which keeps the errors per part; Inspect's issue address is built in `src/inspect/issue.js` and opens the form in `.github/ISSUE_TEMPLATE/inspect.yml`; addresses in reports lose their query (`src/shared/address.js`). Capture also keeps the page's errors from the start (`src/capture/errors.js`, `__gafferErrors`); Inspect's monitor also runs in frames with a video (`src/inspect/report/frames.js`). `src/media/ts/` converts TS chunks and packed audio to fMP4 for the manifest download (§11.10.3). The recording block list lives in `src/shared/blocked-sites.js` (used by Direct and Inspect); YouTube ads are followed in `src/direct/video/ad.js`. Chapters per player are in `src/shared/chapters.js`, the marks and the list in `src/direct/playback/chapters.js` (§11.14). The mouse pointer over the video is in `src/direct/ui/cursor.js` (§11.2). The same level for every video is in `src/direct/level/` with the calculations in `src/shared/loudness.js` (§11.15); the shell's `bridge.js` (user script world) keeps its setting. Direct's state lives in `src/direct/state.js`; closing runs the registered cleanups in reverse order. Videos in shadow roots are followed through `src/shared/deep.js` (flat-tree parents, `composedPath()`, the element under a point); capture remembers the shadow roots the page makes, also closed ones, and Direct's stylesheet for such a video goes into the shadow root's `adoptedStyleSheets`.
- **Build:** `build/build.js` bundles with esbuild into `dist/direct.js`, `dist/inspect.js` (with sourcemaps) and the bookmarklets, and copies the shell from `extension/` into `dist/extension/` (`build/extension.js`). The icon PNGs are committed; after changing `extension/icons/icon.svg` run `npm run icons`. `dist/extension/` gets the modules in `modules/`. `build/release.js` builds the Web Store zip for a given version (`dist/gaffer-extension-<version>.zip`).
- **Extension:** `extension/` holds the unbundled shell (§4.1): `background.js`, `inject.js` (content scripts and `chrome.scripting` with files from the package), `popup.*`, `auto.js` (quiet mode), `bridge.js` (isolated world, every frame: asks whether the page is on, starts frames inside it, level setting), the pure helpers `sites.js` (also the match patterns per part, `contentScripts`) and `level.js` (unit-tested in node), and `i18n.js` (`msg()` and the `data-i18n` fill-in). The build adds `_locales/` from `lang/` (`build/lang.js`) and the modules. Capture and Direct are registered per part for the top frame (`gaffer-capture:<part>` at `document_start`, `gaffer-direct:<part>` at `document_idle`); a new version from the Web Store waits in tabs with a running recording (`__gafferRecording`, `gaffer:recorded`, §4.6). Gaffer (dev) replaces `inject.js` and `bridge.js` with `extension/dev/` and adds `source.js` and `prelude.js` (§7.4): user scripts with the rules in a prelude, modules from its own folder, WebSocket signal from `npm run dev`.
- **Dev version:** `build/dev.js` (`npm run dev`) builds Gaffer (dev) into `dist/extension-dev/`, follows `src/`, `extension/` and `lang/` by looking at the files (`build/watch.js`), restarts itself when `build/` changes (supervisor in `build/supervise.js`), and signals the shell through the WebSocket server in `build/devserver.js` (hand-written, no dependency).
- **Tests:** `test/unit/` (node:test) and `test/e2e/`: the CDP harness (`harness.js`, local server in `server.js`), the test pages (`pages/`) and the e2e tests for Direct (split by subject into `direct-*.test.js`, shared setup and helpers in `direct-helpers.js`), Inspect, the extension (`extension.test.js`: a test build of the shell with a throwaway key, served releases from `/release/`, see §9) and the dev version (`dev.test.js`). Copies of hls.js and dash.js live in `test/e2e/pages/vendor/`; keep them on the newest release (`npm run vendor:hls`, `npm run vendor:dash`, `npm test` warns). Test media (MP4, HLS, DASH) is generated by `test/fixtures/make.sh`. See `README.md`. `DIRECT_BM` and `INSPECT_BM` point the e2e tests at another bookmarklet file, for example an older build to compare behaviour. The files run in parallel; the harness scales Direct's wait times by `__gafferTiming` (default 0.2, `GAFFER_TIMING=1` for real time, see `src/shared/timing.js` and §9). Wait for a condition with `waitFor`, not a fixed `sleep`. `test/reporter.js` prints the duration per file and the slowest tests.
- **CI:** `.github/workflows/ci.yml` runs `npm test` on every push to `main` and every pull request; it keeps no build (§7.3).
- **Git and hosting:** public repository `henzeb/gaffer` (push via `git@henzeb.github.com:henzeb/gaffer.git`). Releases: push a semver tag (`vX.Y.Z`) on `main`; `.github/workflows/release.yml` tests, runs `npm run release` and creates a GitHub release with the extension zip, which is uploaded to the Chrome Web Store by hand (§7.2). No release has been published yet. Ask before pushing a tag.

## Working rules

- **Build order.** Follow §15 in order, one phase at a time. Finish each phase with passing tests and a usable build before starting the next. Report to the user at the end of each phase.
- **Phase 2 is a pure refactor.** Split the code into the §14 structure without changing behaviour. The phase 1 tests must pass before and after.
- **Players.** Every supported player keeps working and keeps an e2e test (real or stand-in player, see `test/e2e/pages/players.html`). New adapters come with such a test.
- **Dependencies.** Respect the dependency direction and cleanup rules in §14. Every module that adds listeners, intervals, observers or patches registers a cleanup function, so closing restores the page completely (§11.9).
- **Bookmarklet constraint.** The bundled bookmarklet must not contain `%` anywhere, including CSS (use `from`/`to` keyframes) and strings. The build checks this and names the source location (§7.1).
- **Language.** User-facing text (tooltips, messages, buttons, report, popup) is in English and comes from the language file `lang/en.json` through `t()` (modules) or `chrome.i18n` (extension), never written directly in the code (§13.1). Plurals use `<key>.singular` / `<key>.plural` with an `n` parameter. `test/unit/lang.test.js` checks the keys. Build, test and tool messages for developers are plain English strings in the code. Recognition patterns for site texts (kwaliteit, vorige, …) are not interface texts. The spec, README and AGENTS.md are in English. Code, identifiers and comments are in English. The user communicates in Dutch.
- **No runtime dependencies.** esbuild is the only devDependency. No external scripts at runtime.

### Ask before doing these

- Creating the GitHub repository `henzeb/gaffer`, pushing, publishing a release, or anything in the Chrome Web Store dashboard. Each one publishes code publicly.
- Installing system software (Chrome for Testing, ffmpeg).

### Git

- Run `git init` at the start of phase 1, once the user agrees.
- Commit messages are a single line and must not mention Claude.
- Ignore `dist/`, `test/.chrome-profile/`, `test/fixtures/media/` (generated) and `node_modules/`.

## Commands

```bash
npm run build                       # dist/direct.js, dist/inspect.js, bookmarklets, dist/extension/ (with the modules)
npm run dev                         # Gaffer (dev) in dist/extension-dev/: modules from the working directory, applied on save, restarts itself on build/ changes (GAFFER_DEV_PORT, default 8423)
npm run chrome                      # install Chrome for Testing into ~/.cache/gaffer/
npm test                            # build + unit + e2e in parallel, with durations per file (needs Chrome for Testing and ffmpeg); GAFFER_TIMING=1 for real-time waits
node test/e2e/test.js '[steps]'     # single steps; env: PAGE, URL, BM
npm run vendor:hls                  # update the hls.js copy in test/e2e/pages/vendor/
npm run vendor:dash                 # update the dash.js copy in test/e2e/pages/vendor/
npm run icons                       # PNGs from extension/icons/icon.svg (needs Chrome for Testing)
npm run extension                   # dist/gaffer-extension-<version>.zip
npm run release -- 1.2.0            # dist/gaffer-extension-1.2.0.zip for the Chrome Web Store, modules and manifest with that version
```

Keep this section up to date when the scripts change.

## Things learned the hard way

These are already reflected in the spec, but they're easy to break during refactoring:

- **Ignore synthetic events.** Direct ignores events with `isTrusted === false`. Its own synthetic clicks into site menus would otherwise toggle playback.
- **Pointer activity first.** Some site menus only open when the pointer is "active". Send a synthetic hover/move before the programmatic click (§11.6.1, step 2).
- **No blind close clicks.** Never click a site menu button blindly to close it. That knocks the site's toggle out of phase. Reuse a menu that is already open.
- **Confirm by resolution.** A quality switch is confirmed by a change in `videoHeight` (the `resize` event), not by the site's menu state.
- **Stream identity.** A new stream is detected by `location.href`, a new `<video>` element, or a new source in the same element whose duration differs by more than 1 s and that Direct did not request (§11.1). Never by `currentSrc` alone: players that switch files per quality would otherwise reset state on every switch.
- **One core per video.** `src/direct/core.js` is bundled separately and wrapped as `makeCore()` in the main bundle (`build/build.js`), so every video gets fresh module state. Shared things (`__vuClose`, hls hook, `<html>` classes, fullscreen) live in `index.js` and reach the core through `host.js`.
- **Inline style sync.** After `style.setProperty()`, Chrome writes the `style` attribute lazily; a direct `removeAttribute("style")` can then leave `style=""`. Read the attribute first (`restoreStyle` in `site-controls.js`).
- **Live detection.** A live stream has `duration === Infinity`. The live edge is `seekable.end`, otherwise `buffered.end`.
- **Overlays stay clickable.** Clicks on foreign dialogs, popovers and the Inspect panel must pass through Direct, even when they lie on top of the video (§11.7).
- **No newlines in the bundle.** esbuild turns strings with `\n` into template literals with real newlines, which a bookmarklet URL drops. The build disables template literals (§7.1).
- **Test browser sandbox.** Chrome for Testing needs `--no-sandbox` on Ubuntu 23.10+ (AppArmor blocks its sandbox). The harness always passes it.
- **Developer mode in tests.** `chrome.runtime.reload()` disables an extension loaded with `--load-extension` (`unsupportedDeveloperExtension`) unless the profile is in developer mode. The harness turns it on.
- **Register after install.** `onInstalled` (also after a reload or an update) always registers again: dynamic user scripts are gone after a reload, even when the modules are unchanged. Open tabs keep the old Direct after a reload; the regular extension restarts it there.
- **Chrome sorts the patterns.** `getRegisteredContentScripts` gives `matches` and `excludeMatches` back sorted. Compare sorted, and change a script in place (`updateContentScripts`), or every registration replaces the scripts and a page that loads meanwhile gets nothing.
- **Frames follow the page.** Whether Gaffer is on in a frame depends on the top window; match patterns only see the frame's address. So capture and Direct are registered for the top frame only, and the bridge asks the background to start a frame.
- **The bridge listens first.** Direct can ask for the level setting before the background has said whether the page is on; the bridge keeps that question and answers it once it knows.
- **No `%` through constant folding.** esbuild folds `String.fromCharCode(37)` into a literal `%`. Build the character at run time in a way it cannot fold (`String.fromCharCode.apply(null, [37])`).
- **Init segments after a late start.** hls.js only sends a new init segment on a real level switch, not when the same level is set again, and not for a separate audio rendition. Players also buffer far ahead, so a VOD recording through MSE may receive nothing for a while (§11.10).
- **One capture at a time.** `captureStream()` takes the sound away from an earlier capture of the same video, which then records silence. The level meter steps aside for MediaRecorder (`holdMeter`).
- **New shell files.** Add them to `SHELL_FILES` (or `DEV_FILES`) in `build/extension.js` before anything imports them, and to `SHELL` in `extension/dev/source.js`. Otherwise Gaffer (dev) reloads into a shell that cannot start and cannot recover by itself.
- **`executeScript` and `userScripts.execute` can wait forever** on a tab that never finishes loading; always use `run` / `runInTab` (time limit).
- **Never by rectangle alone.** Whether the mouse is on the video is decided by the element under it (`belongs`), not by the video's rectangle: page headers and popups may lie over it.
- **`all:unset!important` stops animations.** It also sets `transform` with `!important`, which wins from a keyframe animation.
- **Mute through the site.** A feed (TikTok) gives every new video its own sound state; setting `v.muted` alone is lost on the next video. Direct clicks the site's mute button (`playback/volume.js`).
- **No `fs.watch`.** On Linux a recursive `fs.watch` misses later writes to a file that was replaced (`sed -i`, the editors of agents), and it fails without a free inotify instance. `build/watch.js` looks at the files itself.
- **Not in the working directory.** `npm run dev` applies every save in the user's browser. Run mutations and half-finished work in a copy.
- **Live is not only Infinity.** A live stream with a rewind window (NOS, video.js) has a finite duration that grows. Live is also the player's flag or a growing duration (`playback/live.js`).
- **Controls mounted on hover.** Some players (NOS) add their control bar again on every mouse-over; the scan is too late. `site-controls.js` hides added nodes from a MutationObserver.
- **YouTube's stated loudness.** `audioConfig` is about the video, not about the DRC version that often plays. Measure.
- **Compare against the old build.** For refactors, build the previous commit's bookmarklets and run the e2e tests with `DIRECT_BM`/`INSPECT_BM` pointing at them; both must pass.
