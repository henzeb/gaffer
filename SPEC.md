# Gaffer — specification

## 1. Purpose

Gaffer is a Chrome extension that makes two tools available on websites:

| Name | Was | What it does |
|---|---|---|
| **Gaffer Direct** | Video Control | Overlay controls for any video or stream: rotate, flip, zoom, pan, playback, speed, quality, live mode. |
| **Gaffer Inspect** | Video Analyse | Analyses players, streams and manifests on a page and produces a report for an issue, with a monitor mode. |

Direct and Inspect are in the extension package, which is published in the Chrome Web Store. The bookmarklets remain and are built from the same source.

The spec has these parts:

- **Part A (§2–§10):** the extension.
- **Part B (§11):** Gaffer Direct.
- **Part C (§12):** Gaffer Inspect.
- **§13:** what applies to both tools, as bookmarklet and as module.
- **§14:** the code structure.
- **§15:** the build order.

What already works is described as a requirement. What still has to be built is marked **[planned]**. Part A (the extension, §2–§10) was built in phase 3, recording and capture in phase 9, tracks and player integration in phase 11.

## 2. Requirements

1. Direct, capture and Inspect are in the installation package. Gaffer fetches no code (§3).
2. By default Gaffer is **off** on every site.
3. One switch per site: on or off. There is no list or management screen.
4. When switched **on**, Direct starts immediately on the open tabs of that site and from then on on every page of that site.
5. When switched **off**, Direct closes on the open tabs of that site and restores the original view. After that it no longer starts there.
6. Inspect only runs when asked, with a button, on the active tab.
7. New versions come from the Chrome Web Store and are applied by themselves (§4.6).
8. Gaffer works without internet: everything it runs is in the package.

## 3. What Chrome allows

- **No code from elsewhere.** The Chrome Web Store does not allow an extension to run code that is not in its package: not code from its own server, not signed code, and not through the `userScripts` API, which is meant for scripts the user writes. So Gaffer carries the modules in the package and puts them into pages with content scripts and `chrome.scripting`, with files from the package only (§4.3).
- **Chrome Web Store.** Gaffer is published there, and Chrome updates it from there (§4.6, §7.2).
- **Content scripts are files.** A registered content script cannot carry the rules per site as code, so match patterns decide which pages it runs on (§4.5).
- **Gaffer (dev)** is never published and keeps using the `userScripts` API (§7.4). There the user has to switch on **"Allow User Scripts"** for it once.
- **Minimum Chrome version:** 138.

## 4. Architecture

### 4.1 Parts

```
extension/                 the shell
  manifest.json
  background.js            service worker: switch, register, start and close in tabs, updates
  inject.js                content scripts and chrome.scripting with the files from the package (§4.5)
  popup.html / popup.js    switch, Inspect button, version
  auto.js                  quiet mode before Direct (§6.1)
  bridge.js                in every frame, in the extension's isolated world: on or off for the frame, level setting (§4.5)
  level.js                 check of a level setting
  sites.js                 site of a page, closest rule for a site, match patterns per rule
  i18n.js                  msg() and the data-i18n fill-in
  dev/                     only in Gaffer (dev) (§7.4): inject.js, bridge.js, prelude.js, source.js
  icons/
  modules/                 added by the build: capture.js, direct.js, inspect.js
```

### 4.2 Modules in the package

- The build copies `dist/capture.js`, `dist/direct.js` and `dist/inspect.js` into `modules/` of the extension (§7.1). They carry the version of the extension: a release builds them with that version as `__BUILD__` (§7.2).
- The shell and the modules change together. A new version of Direct is a new version of the extension in the Web Store.
- `capture` is the small interception of `appendBuffer` for recording (§11.10). It is a separate module because it has to run before the player. Capture has no controls of its own: the record button is in Direct's top bar (§11.2, §11.10), not in the popup. The Direct bookmarklet contains capture in front of Direct; it then starts late (§11.10).

### 4.3 Security

- **Only files from the package.** Gaffer runs content scripts and `chrome.scripting.executeScript` with `files` from the package, and a few small functions of the shell itself (`func`: closing Direct, the header for Inspect, the recording check). No `eval`, no code as text, no downloaded code. A unit test checks that the regular shell contains no `userScripts`, `fetch(`, `eval(`, `new Function`, `importScripts` or `WebSocket` (§9).
- **Permissions:** `scripting`, `storage`, `activeTab`, and `<all_urls>` as an optional host permission, asked once (§8, decision 2).
- **Messages.** The background only answers messages of its own extension (`sender.id`): the popup, and the bridge in the extension's isolated world, which the page cannot reach. What the bridge passes on from the page is checked (§4.5).

### 4.4 Storage

| Key | Content |
|---|---|
| `default` (in `chrome.storage.sync`) | `true` if Gaffer is on by default on all sites. Missing or `false`: off by default. |
| `level` | The level setting (§11.15) as text, `{"on":true,"value":50,"ref":-16.9}`. Per device, because it depends on the speakers. |
| `site:<host>` (in `chrome.storage.sync`) | `true` for a site that is on, `false` for a site that is off. Internal; never shown as a list. |
| `updateWaiting` (in `chrome.storage.session`) | `true` while a new version waits for a recording (§4.6). |

- **Gaffer (dev)** also keeps the modules it read and their build in `chrome.storage.local` (§7.4).
- **The sites** live in `chrome.storage.sync` and travel with the Chrome profile to other devices. Every site is its own key, because sync allows at most 8 KB per key. That leaves room for about 500 sites.
- **Change on another device.** On `chrome.storage.onChanged` for a `site:` or `default` key Gaffer registers again (§4.5). If a site goes off, Direct closes on the open tabs of that site, as when switching off (§4.5). If a site goes on, Direct starts on the open tabs, as when switching on. The switch in the popup only writes sync storage; the background does the rest through the same event.
- **Sync unavailable.** If sync is switched off, `storage.sync` behaves like local storage.

A site is the host name without `www.`. Switching on `example.com` also applies to `www.example.com` and all subdomains.

- **On or off by default.** With the checkbox "On by default on all sites" in the popup the user chooses what applies to a site without a rule of its own. On a new installation it is off. Switching it on first asks for permission for all sites, if that has not been granted yet.
- **Which rule counts.** On a page the rule (`site:<host>`, on or off) closest to the host name counts. If there is none, the default applies. If `foo.com` is on and you are on `player.foo.com`, the switch is on and the popup shows "on via foo.com". If the default is on and `foo.com` is off, the popup on `player.foo.com` shows "off via foo.com". If only the default applies and it is on, the popup shows "on (default)".
- **Switching.** The switch first removes the closest rule that says the opposite. If the site is still not right after that, Gaffer adds a rule for the host name of the page without `www.`. So switching off on `player.foo.com` with "on via foo.com" switches `foo.com` off, and switching off while the default is on becomes an exception for that site. The rules are kept when the default changes.

### 4.5 Running

**Registration.** While at least one site (or the default) is on, Gaffer registers content scripts (`chrome.scripting.registerContentScripts`) with files from the package:

| Script | Frames | `runAt` | World | Files |
|---|---|---|---|---|
| `gaffer-bridge` | all, `*://*/*` | `document_start` | `ISOLATED` | `bridge.js` |
| `gaffer-capture:<part>` | top frame | `document_start` | `MAIN` | `modules/capture.js` |
| `gaffer-direct:<part>` | top frame | `document_idle` | `MAIN` | `auto.js`, `modules/direct.js` |

- **Parts.** A content script cannot check the rules itself, so match patterns do it (`contentScripts` in `sites.js`, unit-tested). Every rule that says on is a part: `*://<site>/*` and `*://*.<site>/*` (patterns ignore the port), minus every rule below it (`excludeMatches`). A rule below it that says on again gets its own part. When the default is on, it is a part too: `*://*/*` minus all rules. So a page matches exactly the part of its closest rule (§4.4).
- **Registering again** happens on every change of the rules, after installation and an update, at the start of Chrome and when the popup opens. Only what differs changes: a changed part is updated in place (`updateContentScripts`), so a page that loads meanwhile still gets it. Chrome gives the patterns back sorted.
- **Frames inside the page.** Whether Gaffer is on in a frame depends on the page (the top window), not on the frame: an embedded player from another domain gets Direct on a site that is on, and an embedded player of a site that is on gets nothing on a page that is off. Match patterns only see the frame's own address, so capture and Direct are registered for the top frame only. In every frame the bridge asks the background (`frame`); the background takes the site of the page (`sender.tab.url`, for the top frame `sender.url`) and starts capture and Direct in that frame (`executeScript` with the frame's `documentId`). There capture starts a little later than in the top frame. The bridge asks one question at a time, and asks for a start only while it does not know that Gaffer is on, so a frame gets Direct once.
- **Quiet mode.** `auto.js` sets `window.__gafferAuto` before Direct (§6.1).
- **Capture** intercepts `SourceBuffer.prototype.appendBuffer` before the player starts. Per SourceBuffer it only keeps the last init segment (a few kB), no media data. Only when Direct starts a recording does capture pass the chunks on to Direct. It also remembers which shadow roots the page makes (`Element.prototype.attachShadow`, only looking), also closed ones, so Direct can find a video inside them (§11.1). On close capture restores `appendBuffer` and `attachShadow`.
- **Capture also keeps the errors of the page** from the start (`window.__gafferErrors`), so Inspect can report a bug that happened while the page loaded (§12.1): every `error` on `window` (also a picture, script or media file that fails to load) and every promise rejection nobody handles, the last 20, each with the time since the page loaded, the message cut to 300 characters and addresses without their query. Only listeners: the console is not wrapped. Closing removes them, together with the rest of capture. From the bookmarklet capture starts with the click, so it keeps the errors from then on.
- **The bridge** runs in the extension's isolated world, which the page cannot reach. While Gaffer is on, it keeps the level setting (§11.15) in the extension, so it is the same on every site. Direct sends `gaffer:level-get` and `gaffer:level-set` on `document`; the bridge asks the background (`runtime.sendMessage`) and answers with `gaffer:level`. It listens from the start, and answers a question Direct asks before the background has said whether Gaffer is on as soon as that is known. A page can send the same events, so the bridge only passes a change on within 3 s of a real action of the user (`isTrusted`), and the background only stores a valid setting. The loudness that goes with it (`ref`) is only known some seconds after the action: from a page where the user switched it on, the bridge passes a later change on as `level-ref`, with which the background changes nothing but `ref`, and only while the level is on. It also passes on the end of a recording (`gaffer:recorded`, §4.6). Running `bridge.js` again makes it check again; that is how switching on and off reaches it. A bridge whose extension was reloaded stops by itself.
- **A tab that does not answer** (a page or frame that never finishes loading) is skipped after 4 s, and the tabs are handled side by side, so one tab cannot hold up switching or an update.

**Switching on.** Gaffer:

1. asks for permission for all sites the first time it is switched on (§8, decision 2). That happens once. After that every other site simply stays off;
2. sets `site:<host>` in sync storage and registers again;
3. runs the bridge in all frames of the open tabs of that site, and capture and Direct in their top frame, with `chrome.scripting.executeScript`. The bridge starts the other frames.

**Switching off.** Gaffer:

0. If a recording or download is running in a tab, it is closed properly first. The file is kept.
1. removes `site:<host>` from sync storage and registers again;
2. calls `window.__vuClose()` in all frames of the open tabs. Direct uses it to restore the page. Then the bridge checks again and stops listening.

**Inspect.** The button runs `modules/inspect.js` once in all frames of the active tab (the panel appears in the main window), also when Gaffer is off on that site. Before the module the shell sets `window.__gafferInspect = { shell, dev }` (the extension version, and `true` in Gaffer (dev)); Inspect reads it for the report header and the buttons (§12.5) and removes it. If permission for all sites has not been granted yet, the button asks for it first (the same one-time question as when switching on).

### 4.6 Updates

**From the Chrome Web Store.** Chrome looks for new versions and downloads them itself. Gaffer has no Update button and fetches nothing.

**Applying.** When Chrome reports a new version (`runtime.onUpdateAvailable`), Gaffer applies it right away with `chrome.runtime.reload()` (§8, decision 4), unless a recording or download is running in a tab.

- **Waiting for a recording.** The background asks every tab for `window.__gafferRecording` (the number of running recordings and downloads) in all frames. If one runs, it notes that an update waits (`updateWaiting` in `chrome.storage.session`). Direct sends `gaffer:recorded` on `window` when the last one ends; the bridge passes it on and the background checks again. If Chrome closes first, Chrome applies the update on the next start.
- **After the reload** (`onInstalled`, also after an installation), Gaffer registers again. On the open tabs where it is on it closes the old Direct (`__vuClose()` in all frames: the old version keeps running in the page after the reload) and starts the new one as when switching on. Zoom and rotation are lost (§8, decision 4). Capture then starts late. Closing (`__vuClose()`) also restores capture; Direct restarting itself (`__vuClose({ keepCapture: true })`) leaves it.

### 4.7 Icon

- **Design:** a rounded play triangle with a dot at the back, like a lamp the beam comes out of.
- **Style:** flat. A turquoise rounded background (#14b8a6), a white triangle and a dark dot (#0f172a). Recognisable at 16 px too: no text and no thin lines. The popup and the "dev" badge (§7.4) use the same turquoise.
- **Files:** the source is `extension/icons/icon.svg`. `npm run icons` (`build/icons.js`) converts it with Chrome for Testing into `icon-<n>.png` and `icon-off-<n>.png` in 16, 32, 48 and 128 px. The PNGs are in git, with the sha256 of the SVG in `icon.svg.sha256`. The build copies them and stops if they are missing or the SVG changed. This way `npm run build` works without Chrome.
- **Variants:** a grey variant when Gaffer is off on the current site; that is also the button's default icon. The icon shows on or off: turquoise is on, grey is off.

## 5. Popup

```
┌──────────────────────────────────┐
│ Gaffer                           │
│ example.com               [ ●○ ] │  ← on/off for this site
│ (on via foo.com)                 │  ← rule of a parent domain, or "on (default)"
│ [✓] On by default on all sites   │
│                                  │
│ [ Inspect this page ]            │
│                                  │
│ Version  1.3.0                   │
└──────────────────────────────────┘
```

States:

- **Pages where Gaffer may not do anything** (`chrome://`, the Web Store). The switch is disabled and the popup says "Not available on this page".
- **No permission.** Switching on or Inspect without the permission for all sites: "Gaffer can't start without permission" or "Inspect can't start without permission".
- **Permission taken away.** If the user removes the access to sites in `chrome://extensions` while Gaffer is on somewhere, nothing runs: the switch and "On by default" show off, and the popup says "Gaffer no longer has access to sites. Switch it on to allow it again." Switching on asks for the permission again; once it is given (`permissions.onAdded`), Gaffer registers again and starts in the open tabs where it is on.
- **Gaffer (dev)** shows "Development version" with the build time instead of the version, the Update button with its outcome, and when user scripts are still off an explanation with a button that opens the extensions page (§7.4).

The extension icon is turquoise when Gaffer is on on the current site and grey when it is off (§4.7).

## 6. Changes in the modules

### 6.1 Gaffer Direct

1. **Quiet mode.** Gaffer sets `window.__gafferAuto = true` before Direct starts.
   - No red error banner when there is no video.
   - No bars until a video appears. Direct keeps watching for videos with its regular scan.
   - Errors go to the console, not to a banner.
2. **No double start.** In quiet mode Direct does nothing if it is already running (`__vuClose` exists). A bookmarklet restarts Direct, as before.
3. **Full restore.** `close()` restores everything:
   - styles, transforms and hidden site elements;
   - event listeners;
   - replaced functions, such as the video's own `play`;
   - observers;
   - attributes of the site: a `class` on `<html>` that was not there before the start, and a changed `preload` on the video.
   This is tested (§9).
4. **Name.** The header of the shortcuts card (? in the ⚙ panel) shows "Gaffer Direct" with the version. The bookmarklet has the same name.

### 6.2 Gaffer Inspect

- **Name.** The name in report and panel is "Gaffer Inspect".
- **Running again.** Running it a second time replaces the existing panel, as before.

## 7. Build and release

### 7.1 Building

- The source consists of ES modules, one responsibility per file (§14). The build bundles them with **esbuild** (the only devDependency) into one file per tool.
- `npm run build` produces:
  - `dist/direct.js` and `dist/inspect.js`: the modules for the extension, as IIFE;
  - `dist/gaffer-direct.html` / `-bookmarklet.js` and `dist/gaffer-inspect.html` / `-bookmarklet.js`: the bookmarklets, from the same bundle;
  - `dist/extension/`: the extension, ready to load unpacked, with the modules from `dist/` in `modules/` (§4.2).
- **Bundle settings:** `format: iife`, `target: chrome120`, `minify: true`, `legalComments: none` and `supported: { "template-literal": false }`. Minify removes comments and produces one line. Without template literals esbuild puts no real line breaks into strings, which would get lost in a bookmarklet URL.
- **One core per video.** Direct's core (`src/direct/core.js`) is bundled separately first and wrapped in the main bundle as the function `makeCore()`. Every call gives fresh module state, so every video gets its own Direct (§11.1) without `eval` or `new Function` (which Trusted Types on YouTube would block).
- **Bookmarklet check.** The build checks the bookmarklet version for `%`. If it occurs, the build stops with the file and position from the sourcemap. So write a `%` in the source differently, for example as `String.fromCharCode.apply(null, [37])` or as `x - Math.floor(x / n) * n`. Not as `String.fromCharCode(37)`: esbuild folds that into a literal `%`.
- **Sourcemaps.** A sourcemap is produced for every bundle (`dist/*.js.map`). It is not published. The map of Direct also covers the core: the core's own map goes inline under the wrapped core, and esbuild takes it into the map of the main bundle, so a place in the core points to its source file, also for the bookmarklet check. The code itself is the same with or without a map.
- **Version.** `__BUILD__` is filled in via `define` with the build time, or with the version for a release (§7.2).

### 7.2 Release

Releasing is done with a semver tag on `main`: `git tag v1.3.0 && git push origin v1.3.0`. The workflow `.github/workflows/release.yml`:

1. runs the tests first (`ci.yml`);
2. runs `npm run release -- v1.3.0`;
3. creates a GitHub release for the tag, with `gaffer-extension-1.3.0.zip`.

The zip is then uploaded by hand in the developer dashboard of the Chrome Web Store and sent for review.

`npm run release -- <version>` (`build/release.js`):
1. checks the version: semver, with or without `v`;
2. builds the modules and the bookmarklets with the version as `__BUILD__`;
3. builds `dist/extension/` with the version in its `manifest.json`;
4. packs `dist/gaffer-extension-<version>.zip`.

- The version in `extension/manifest.json` is for a local build (`npm run build`); a release takes the version of the tag. The Web Store only accepts a version higher than the published one.
- `npm run extension` packs `dist/extension/` into `dist/gaffer-extension-<version>.zip`, with the version from its manifest.
- **Web Store listing.** The dashboard asks for the single purpose (controls and analysis for videos on web pages), a justification per permission (§4.3), a privacy policy (Gaffer collects and sends nothing; the settings stay in Chrome's storage) and screenshots. The texts are in `docs/store-listing.md`; the privacy policy is `PRIVACY.md` in the repository, linked from there.
- **Before a tag** the extension is checked by hand on real sites with `docs/release-checklist.md`: the tests use stand-in versions of most players.

Repository: `henzeb/gaffer` (public). See §14 for the folder structure.

### 7.3 Continuous integration

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request, and as the first step of the release workflow:

1. Node 22, `npm ci`, ffmpeg via apt;
2. `npm run chrome` for Chrome for Testing;
3. `npm test` (build, unit and e2e tests).

Chrome for Testing and the test media are cached between runs. It only tests: it keeps no build. The build for the Chrome Web Store is made by the release workflow (§7.2).

### 7.4 Local development version

To test Direct, Inspect and the shell in the real extension without committing and publishing, there is a second variant of the extension: **Gaffer (dev)**. It takes the modules from the working directory and applies a change by itself.

**Usage.**
1. Start `npm run dev` in a terminal and leave it running.
2. Load `dist/extension-dev/` once as an unpacked extension in Chrome.
3. Change the code and save. The new version then runs by itself in the open tabs.

**`npm run dev`.**
- **Building.** Builds the modules (Direct, Inspect, and capture from phase 9) with esbuild and the same settings as §7.1, and the shell into `dist/extension-dev/`, with the modules in the extension folder itself (`modules/`). `__BUILD__` is the build time with seconds. `modules/build.json` contains that time and an id (sha256 of the modules). Only `npm run dev` produces this variant; `npm run build` does not.
- **Watching.** `npm run dev` watches `src/`, `extension/` and `lang/` (`build/watch.js`: it looks at all files every 250 ms, because `fs.watch` on Linux misses later writes to a file that was replaced, and needs a free inotify instance) and rebuilds on every change; a change in `lang/` rebuilds both the modules and the shell. A failed build reports in the terminal and sends no signal. `npm run dev` itself is a small supervisor (`build/supervise.js`) that runs the dev server as a child process and watches `build/`: a change to the build code restarts the child, which rebuilds the shell and the modules with the new build code. If the child stops with an error, the supervisor waits for the next change in `build/`. The shell stamp also covers the code that builds the shell (`build/extension.js`, `build/lang.js`, `build/icons.js`, `src/shared/i18n.js`), so a shell that is built differently reloads itself.
- **Signal.** A small server on `127.0.0.1` (port 8423, configurable with `GAFFER_DEV_PORT`) sends a message to the extension over a WebSocket: "modules changed" (with the id of the modules) or "shell changed" (with the shell stamp: a sha256 of the source files). On every new connection the server sends both. So a shell that had no connection in between updates or reloads right away. The WebSocket server is in `build/devserver.js`.

**What the development shell does differently.**

| | Gaffer | Gaffer (dev) |
|---|---|---|
| Modules | in the package (`modules/`) | from its own extension folder, read again on every signal |
| Running | content scripts and `chrome.scripting` (§4.5) | user scripts with a prelude that holds the rules (below) |
| Updating | through the Chrome Web Store (§4.6) | on every signal from `npm run dev`, and with Update |
| Permissions | `scripting` | `userScripts` instead of `scripting`, and `alarms` for reconnecting |
| "Allow User Scripts" | not needed | switched on once by the user |
| Popup | the version | "Development version" and the time of the last build |
| Inspect | **Report an issue** | also **Copy** (§12.5) |
| Name and icon | Gaffer | Gaffer (dev), with a "dev" badge (on/off stays visible in the icon, §4.7) |

The dev build replaces `inject.js` and `bridge.js` with those from `extension/dev/`, adds `source.js` (reading the modules) and `prelude.js`, and has the port and the stamp in `dev-config.js`. The switch per site, the popup, the level setting and the Inspect button are the same code as in the regular extension.

**Running in Gaffer (dev).** Gaffer (dev) registers three user scripts, all with `matches: ["<all_urls>"]` and `allFrames: true`, the modules with `world: "MAIN"` and the bridge with `world: "USER_SCRIPT"`:

| Script | `runAt` | Content |
|---|---|---|
| `gaffer-capture` | `document_start` | prelude + capture module |
| `gaffer-direct` | `document_idle` | prelude + Direct module |
| `gaffer-bridge` | `document_start` | prelude + `dev/bridge.js` |

- **The prelude** (`dev/prelude.js`) contains the default and the rules per site (§4.4). It determines the site of the top window: `location.hostname` in the main window, or `location.ancestorOrigins` in an iframe. If Gaffer is off on that site, it stops immediately; otherwise it sets `window.__gafferAuto` and runs the module. On every change of the rules the scripts are registered again with new rules.
- **The bridge** keeps the level setting as in the regular extension (§4.5), but only runs where the prelude lets it and reaches the background through `runtime.onUserScriptMessage`. Frames need no start from it: the prelude already looks at the top window.
- **Switching on** runs the bridge and then capture and Direct in all frames of the open tabs, with `userScripts.execute`; capture then starts late. Switching off and Inspect work as in §4.5, with `userScripts.execute`.
- **Storage.** `release` (`{ dev, id, built }`) and `code.direct`, `code.capture`, `code.inspect` in `chrome.storage.local`.
- **New modules on open tabs.** Direct is closed and started again on the open tabs where it runs; zoom and rotation are lost. If a recording or download is running, that tab waits until it is done, and the popup shows "Update follows after the recording". The background runs a small script in the tab: if `window.__gafferRecording` is set, it waits for the `gaffer:recorded` event on `window`; otherwise it restarts at once. The script returns `waiting` or `done`.

**Applying.**
- **Modules changed.** The shell reads the modules from its own folder, registers again and restarts Direct on the open tabs (above).
- **Shell changed.** The shell reloads itself with `chrome.runtime.reload()`, but only once all its files are present and `dev-config.js` has the stamp from the signal. Otherwise it waits for the next signal or the next connection.
- **Writing files.** The build first writes every file to a temporary file and then renames it, with `dev-config.js` last, and only removes files that no longer exist. So no file is ever missing, not even when Chrome reloads the shell while a rebuild is running.
- **Staying awake.** Messages over the WebSocket keep the service worker awake (Chrome 116+). That is why the server sends a ping every 20 s. A timer or `chrome.alarms` does not work here: the service worker falls asleep after 30 s, and alarms fire at most once every 30 s.
- **Without `npm run dev`.** The last loaded version keeps working. While the service worker is awake, the shell tries to reconnect every 2 s. When it sleeps, it connects every time it wakes up (popup, tabs, and an alarm every 30 s). It then updates through the message on connect.
- **After reloading.** After `onInstalled` (installation, reload, new shell) Gaffer always registers again, even if the modules did not change. This also applies to the regular extension.

**Limits.**
- **Localhost only.** The development shell only connects to `localhost`, and only for the signal. The code comes from the extension folder. The regular extension contains none of this (§4.3).
- **Not side by side.** Do not use the development version next to the regular Gaffer. Both would start Direct on the same sites, and which one runs is a matter of chance.

## 8. Decisions

| # | Question | Status |
|---|---|---|
| 1 | Where do the modules live? | **Decided:** in the extension package (§4.2). Gaffer fetches no code (§3). |
| 2 | Permission for all sites or per site? | **Decided:** permission for all sites, asked the first time it is switched on. Every site is off by default. In the popup the user can set the default to "on" (§4.4); Direct then runs on every site, except the sites the user switches off. |
| 3 | Remember sites per device or sync with the Chrome profile? | **Decided:** sync with the profile (`storage.sync`, §4.4). |
| 4 | Apply an update to open tabs immediately or only after a reload? | **Decided:** immediately, after a running recording (§4.6). Zoom and rotation are lost. |
| 5 | Distribution | **Decided:** the Chrome Web Store; Chrome updates the extension (§7.2). Gaffer (dev) stays a local, unpacked extension (§7.4). |
| 6 | Recording: picture and sound in separate buffers | **Decided:** one file right away, with our own MP4 muxer (§11.10.2). |
| 7 | Downloading: HLS with TS chunks | **Decided:** our own TS-to-MP4 converter (§11.10.3). The ffmpeg command in Inspect remains an extra. |
| 8 | Licence | **Decided:** MIT. `LICENSE` in the root, with copyright Henze Berkheij. |
| 9 | Icon | **Decided:** our own icon (§4.7). |
| 10 | Build order | **Decided:** the phases of §15. |
| 11 | Interface language | **Decided:** English, with all texts in a language file so more languages can be added later (§13). |
| 12 | Recording on sites that forbid it | **Decided:** a fixed block list (tiers 1 and 2 in §11.10.1) on top of the DRM and encryption signals, so Gaffer can meet the Chrome Web Store policy on downloading copyrighted media. `controlslist="nodownload"` stays a warning. Inspect gives no `yt-dlp` command. |
| 13 | Ads on YouTube | **Decided:** Direct also controls the ad, but seeking, previous/next, speed, quality and tracks are locked so it cannot skip or run through the ad; ad elements stay visible and clickable; settings survive the ad (§11.13). |
| 14 | The same volume for every video | **Decided:** every video as loud as the one it was switched on for, off by default, steered through `video.volume` and measured on a copy; no Web Audio, no amplification, no night mode. One setting for all sites in the extension (§11.15). |

## 9. Testing

Headless Chrome for Testing with the unpacked extension. Regular Chrome no longer loads extensions from the command line since version 137.

**Prerequisites**
- **Test profile.** The harness switches on developer mode through the extensions page (`chrome.developerPrivate`), and for Gaffer (dev) also "Allow User Scripts". Without developer mode Chrome disables an extension that reloads itself. If that does not work automatically, switch it on once by hand in the fixed test profile (`test/.chrome-profile`). The harness checks it before the tests and stops with an explanation if it is off.
- **Test variant of the extension.** The tests build the extension in a temporary folder with the modules from `dist/` (Direct marked with a number, to see which version runs) and `host_permissions` already granted, because nobody can approve the permission prompt in headless mode. `dist/extension/` stays unchanged. A new version from the Web Store is simulated: a new module is written into that folder and `runtime.onUpdateAvailable` is dispatched in the service worker. The popup is opened as a tab with `popup.html?tab=<id>`. Host names under `.test` point to the test server through `--host-resolver-rules`, for the subdomain scenario.
- **Programs.** ffmpeg/ffprobe and Chrome for Testing must be installed. `npm run chrome` installs the latest stable Chrome for Testing into `~/.cache/gaffer/chrome-for-testing/` (`CHROME` points at another binary). `npm test` checks both and says what is missing.
- **Sandbox.** The test browser starts with `--no-sandbox`. Ubuntu 23.10+ does not allow the sandbox for programs without an AppArmor profile, and the test browser only opens the local test pages.
- **Writer.** `record/writer.js` is replaceable. In tests a writer writes to memory instead of through `showSaveFilePicker`, so the output can be checked.
- **Speed.** `npm test` runs the test files in parallel (Node's default concurrency, the number of cores minus one); every e2e file starts its own Chrome, profile and server, and the Direct tests are split by subject (`direct-view`, `direct-playback`, `direct-quality`, `direct-players`, `direct-menus`, `direct-tracks`, `direct-audio`, `direct-ui`, `direct-pointer`, `direct-loader`, `direct-sound`, `direct-share`, `direct-chapters`, `direct-level`, `direct-record`, `direct-close`, `direct-shadow`, with the shared `direct-helpers.js`). The harness sets `window.__gafferTiming = 0.2` in every page before the page's own scripts (`Page.addScriptToEvaluateOnNewDocument`; `GAFFER_TIMING` sets another factor, `1` for real time). Direct multiplies its wait times through `ms()` from `src/shared/timing.js`: idle (2 s), the codec check (start, interval, 2.5 s of playback, 15 s limit), the retry intervals for a site menu and the delayed quality render. The 5 s activation window (§11.5) stays fixed, because it lines up with Chrome's own transient user activation of 5 s. Tests wait for a condition (`waitFor`) instead of a fixed time; a fixed wait is left only where a test checks that something does *not* happen. A reporter (`test/reporter.js`) prints the duration per file and the five slowest tests after the run.
- **Test pages.** They live in `test/e2e/pages/`, with their own local server that the script starts. There are pages for:
  - a plain video;
  - a simulated live stream (also a site that starts playback again by itself);
  - hls.js with several qualities and with an unplayable codec, and dash.js with several qualities. For these there is a copy of hls.js and dash.js in `test/e2e/pages/vendor/`. `npm run vendor:hls` and `npm run vendor:dash` update them to the newest version, and `npm test` warns when a newer one exists;
  - site menus in a portal (also with a delay, pointer activity and different lists);
  - stand-in players for every adapter without a real player in the tests: YouTube, JW Player, video.js (quality levels and sources), Brightcove, Radiant, Shaka, dash.js v3, Bitmovin, THEOplayer, Plyr, Flowplayer, Clappr, Kaltura, Vimeo and a DOM menu;
  - captions and audio tracks per player: stand-ins in `tracks.html`, a `<track>` element, and the real hls.js with a stream with two audio tracks and subtitles;
  - casting with a simulated `video.remote`;
  - an image before the start: a `poster` attribute, a site image over the video, and a video that only gets a source after a click;
  - a video that stops loading halfway (`/stall/` on the test server);
  - a feed that keeps its own sound state and gives it every video at the start (`feed-sound.html`);
  - a player that mounts its control bar again on every mouse-over (`remount.html`);
  - a live stream with a growing finite duration and one the player marks as live (`live.html?dvr`, `?flag`);
  - share buttons: in the player with a panel over the video, next to the video in a feed of two, and none at all (`share.html`);
  - a video that lies above its player until the start, with the controls next to the player, like YouTube's embed (`embed.html`);
  - a player that moves the video to another element in fullscreen and hides the old one, with a site dialog and a modal (`fullscreen-move.html`);
  - a player that covers the whole window (`window-fill.html`);
  - several videos in an article, and a grid of small videos;
  - a feed with Previous and Next that gives the same video a new source;
  - an iframe from another domain;
  - DASH;
  - encrypted HLS;
  - `nodownload`.

**Scenarios**

1. **Installation:** the modules are in the package, the popup shows the version, and nothing is registered while every site is off.
2. **Off by default:** on a test page with a video Direct does not start.
3. **Switching on:** Direct starts immediately in the open tab and again after a reload, also in an iframe from another domain. A frame of a site that is on inside a page that is off gets no Direct.
4. **Switching off:** the DOM, styles and video attributes are the same as before switching on (snapshot comparison). After a reload Direct no longer starts.
5. **Inspect:** the panel appears on a site that is off.
6. **Update:** a new version is applied right away; Direct then runs with the new version, once, in the page and in an iframe from another domain. A tab that never finishes loading does not hold it up.
7. **No code from elsewhere:** the regular shell contains no `userScripts`, `fetch(`, `eval(`, `new Function`, `importScripts` or `WebSocket`, and has the modules in its package (unit test).
8. **Parts:** the match patterns of every part match exactly the hosts of their closest rule, with and without the default (unit test).
9. **Recording (MSE):** an hls.js test page with a local stream with separate video and audio tracks. The recording is one file. `ffprobe` sees two tracks with the right codecs and duration, and the file plays in sync in Chrome. A recording that starts halfway begins with a valid init segment and a keyframe, and at time 0. With one combined buffer that starts at 0 the fragments are byte-for-byte equal to the source.
10. **Recording policy:** on test pages with (a) `EXT-X-KEY` AES-128 and (b) a simulated `mediaKeys` Record is disabled, with the right reason, and Inspect shows no recording command. A signal that appears during a recording stops the recording. With (c) `controlslist="nodownload"` the download stays possible and the notice mentions it.
11. **Fallbacks:** a single mp4 file gives a download, and a canvas stream falls back to MediaRecorder.
12. **Recording and update:** capture runs from the start of the page; an update during a recording waits until the recording is done. Switching off during a recording closes the file properly.
13. **Subdomain:** with `foo.com` on, Direct runs on `player.foo.com`. The popup shows "on via foo.com", and switching off switches `foo.com` off.
14. **Development version:** Gaffer (dev) takes the modules from its own folder. The popup shows "Development version" with the build time, and the badge is "dev". After a "modules changed" signal the new Direct runs immediately in the open tab. Without a server the last version keeps working, and when the server comes back the shell updates. After a "shell changed" signal the shell reloads itself and Direct keeps starting.
15. **On by default:** with the checkbox on, Direct starts immediately in the open tabs and after a reload on every site. Switching off on one site creates an exception. Unchecking the box again closes Direct everywhere, except on sites that are on themselves.

## 10. Out of scope

- Uploading to the Chrome Web Store from the release workflow.
- Firefox and Safari.
- A list or management screen of sites.
- The tracker.

---

# Part B — Gaffer Direct

## 11. Gaffer Direct (was Video Control)

Direct lays its own controls over the video of a page and takes over the site's player. It recognises the **player**, not the website. That way it works on any site that uses a known player or a plain `<video>`.

### 11.1 Finding and following videos

- **Candidates.** A `<video>` takes part if it is visible and big enough: at least 45% of the window width, 50% of the window height (portrait videos, as on NOS), or 20% of the window. Small videos, such as a grid of previews, do not take part.
- **Several videos.** Every candidate gets its own Direct: its own bars, panel, messages and settings (rotation, zoom, pan, flip, speed, pause, quality). That is how an article with several videos works.
  - Technically Direct is a core that is executed again for every video (`core.js`, with its own module state), and a manager (`index.js`) that finds the candidates, starts or closes a core per video, and handles what is shared: `__vuClose`, the hls.js interception, the classes on `<html>` and fullscreen.
  - Shortcuts, clicks and scrolling go to the video under the mouse, or to the video in fullscreen.
  - Only one video at a time can be in fullscreen; the bars of the other videos disappear then.
  - `__vuClose()` closes Direct on all videos.
- **Scan.** Every second the manager starts a Direct for new candidates. Once started, a Direct stays with its video as long as the video is in the page; if the video is temporarily invisible or too small, only the bars disappear. Only when the video leaves the page does the manager close that Direct.
- **No video.** Without a candidate Direct shows nothing until a video appears.
- **Shadow roots.** A video inside a shadow root (web components such as Mux Player) takes part like any other (`src/shared/deep.js`). Open shadow roots are found by walking the page (at most every 5 s); closed ones only when capture saw them being made, so with the extension and not after a late start. The parents of the video are followed as the page is drawn (the flat tree): a video in the page itself that a shadow root shows through a slot (Media Chrome) is inside the elements around that slot. Clicks, keys and the element under the mouse count where they really happened (`composedPath()`, and inside a closed shadow root the host). Direct's bars always stay in the page itself, next to the outermost host, where its own styles apply.
- **New URL.** If the URL changes while the same `<video>` stays, rotation, zoom, pan, flip, brightness and contrast are reset, as is the quality state. Speed and volume stay.
- **New source (feeds).** If the site loads a new source into the same `<video>` (`emptied`, then new metadata) and the duration differs by more than 1 s from the previous one, it counts as a new video: picture settings and quality state are reset. A source change within 4 s of a quality choice by Direct does not count; a different quality of the same video also has the same duration. A switch between a YouTube ad and the video does not count either (§11.13).
- **Previous and next.** If Direct finds buttons in the player with previous, next, vorige or volgende (`aria-label`, `title` or short text), ⏮ and ⏭ in the bottom bar press those buttons. Otherwise they go to the previous or next video in page order: the current one pauses, the other scrolls to the middle and plays. ⏮ and ⏭ are always there; if there is no previous or next (first or last video, only one video, or the site only has one of the two), the button is grey and not clickable.
- **Image before the start.** As long as the video has not started, Direct does not hide a site image over the video (`<img>`, `<picture>`, a background image, or a class or id with poster, thumb, preview or cover). Such an image rotates, flips and zooms along with the video. Buttons inside it are hidden. After the start Direct hides the image, if the site does not do so itself. The bars are there before the start; a click on the image starts the video, also if it has no source yet (§11.4). If the video itself lies outside its player until the start (YouTube's embed keeps it above its box), the bars, the mouse and the play button use the player's box instead. The play button clicks a real play button of the site first; a wrapper around the video only counts when there is nothing else.

### 11.2 Display and layers

- **Container.** Panel, bars, spinner and messages are in the same container as the site's own controls: the smallest element that holds the video as well as those controls (known players by their class, including YouTube's embed whose controls lie next to the player; otherwise a hidden layer over the video with a slider, a progress bar or more than one button). Without recognised controls: the smallest element around the video that holds the layers over it (hidden elements, image before the start, captions, end screen). Never inside a link, button or label, and not in a shadow host that does not show them. The container is looked up on every scan.
- **Layers.** In the container the bars are as high as the site's own controls and above the video and its image, seen from the container (the z-index of the outermost element that has one). If the container keeps the z-index of its children to itself (its own stacking context), they are one higher, and above the captions and the end screen too. Otherwise not, because that could lift them over the rest of the page. So what lies over the site's controls, such as a page header, a popup or a tooltip, also lies over the bars. Clicks on the bars do not reach the player's own handlers. The player's styles for sliders do not apply to ours.
- **Placing.** The bars are placed relative to the container, so they scroll along with it, at the edges of the part of the video that the player does not cut off.
- **Fullscreen layer.** In fullscreen they move into the top layer (Popover API) after the video, so they stay visible. They then hang under `body`, because a site may hide the player in fullscreen (YouTube moves the video out of its box) and a hidden ancestor also hides elements in the top layer; afterwards they go back into the container; without the Popover API they then use the highest z-index. Direct's own notice before a recording always lies in the top layer.
- **Site controls.** These are hidden with inline `visibility`, `opacity` and `pointer-events`. The original `style` is kept and restored exactly on release or close. Native `controls` are restored too.
  - **Added later.** What the site adds in the player is hidden at once (a `MutationObserver` on the container), not only on the next scan: some players (NOS) mount their control bar again on every mouse-over. What the site takes out of the page again is let go on the next scan, with its style restored.
  - **Share panel.** The panel the site opens after Share stays visible (§11.4).
  - **Known controls** of players are always hidden, regardless of position, as long as they are inside the video's own player: YouTube (top and bottom chrome, gradients, big play button, pause overlay, watermark, end screens, cards), video.js, JW Player, Plyr, Shaka, Flowplayer, Clappr, Bitmovin, Radiant, Kaltura, THEOplayer (Open Video UI; its older skin uses video.js's classes), Vimeo, MediaElement.js, Fluid Player, Media Chrome (`media-control-bar`, its centred controls and its click layer), Vidstack and Wistia (the classic embed). Also the spinners of YouTube, video.js, Shaka, Bitmovin, Clappr, Kaltura, Vimeo, MediaElement.js, Media Chrome and Vidstack; those of JW Player and Plyr lie in their hidden controls.
  - **YouTube's embed** has its controls next to the player (`.ytPlayerControlsContainerHost`). They are taken away from the moment the video plays (on its `play` event), while it plays or pauses (a marker with a `display: none` rule, because YouTube keeps writing the inline `display` itself), not before the start, during an ad or after the end.
  - **Other elements** in the player (the elements around the video that are about as large as it, and their children) of which at least 60% lies over the video are hidden, whatever their size: also the control bar of a player Direct does not know. An element without a size of its own is looked into, up to three levels deep. Something that does not lie over the video (controls under it, or in a box much larger than the video) stays. If the video lies outside its player's box (as with YouTube before playback), the player's box counts instead.
  - **A picture drawn over the video** (TikTok makes the video transparent and shows it, sharpened, in a canvas over it): that canvas is hidden like any other layer, and the video itself is made visible (`data-vu-picture`) as long as a hidden canvas covers at least 60% of it.
  - **Captions** stay visible.
  - **End screens** stay visible and clickable: YouTube's grid and end screen, and those of video.js, JW Player and Plyr. Once the video has ended Direct hides nothing new, and clicks on the site's elements over the video go to the site.
  - **Ads.** YouTube's ad elements are never hidden and stay clickable (§11.13).
  - **Windows of the site and ads of other players** are not hidden while they are shown, so their buttons (Accept, Skip) stay usable: `dialog[open]`, `[role=dialog]`, `[role=alertdialog]`, `[aria-modal=true]`, an open `[popover]`, and the ad layers of the IMA SDK (its iframe), videojs-ima (`.ima-ad-container` without `hide-ad-container`), Shaka (its ad containers when they hold something, its skip button) and Bitmovin (its ad control bar and skip button). Also not an element that holds one of them. Only the element itself and what lies in it count, so a video that plays in a dialog (a lightbox) still loses its own controls. Shown means a box of its own, not `aria-hidden`, not made transparent or invisible by the site itself; players keep such elements ready but hidden, and those do not count. One that appears in something Direct hid earlier brings that back, until it is gone again.
  - **Thresholds of the site** without a dialog role (an age check, a consent or paywall screen, "tap to unmute") count as a window of the site too: not hidden, the bars step aside (§11.7), clicks go to the site. Such a layer lies over the middle of the video and covers at least a quarter of it, has one to three buttons or links that are shown and no slider or progress bar, and its text (the first 300 characters) has one of the words 18+, age, leeftijd, geboortedatum, birth, consent, cookie(s), toestemming, accept, subscribe, abonneer, log in, sign in, inloggen, unmute, tap to unmute or geluid aan. A control bar along an edge, or a layer with more buttons or a slider, is hidden as before, even with those words. Not in fullscreen, where the video lies above it anyway. Direct marks it `data-vu-gate` while it counts.
- **Two bars.** At the bottom playback, at the top everything about the picture and the source.
  - **Bottom bar (playback).** The seek bar with the times is on its own row across the full width, with the buttons below it: at the far left the volume, then ⏮ −10 ▶ +10 ⏭, and at the right CC, Audio (§11.12) and the speed. During a live stream (no seek bar) it is one row, with LIVE.
  - **Volume and speed** are buttons with a vertical slider that opens above the button on a click: volume with the number, a mute button and the button for the same level (§11.15), speed with ▲ / ▼ (step 0.05), a slider along the presets and at the bottom ♪ (preserve pitch). Scrolling on the button works without opening it. A click elsewhere, Esc or the bars disappearing closes the slider.
  - **Top bar (picture and source):** ⚙ picture settings · Quality · ⏺ Record / ⬇ Download (§11.10) · Cast (§11.11) · at the right Share and ⛶ Fullscreen.
  - The ⚙ panel and the quality list open downwards from the top bar; opening one closes the other. A click outside the panel closes it, and does what it does there too (as with the popups); dragging the video and the shortcuts card leave it open. The panel has groups for flip, rotate, zoom, pan and exposure (§11.3), next to them Max and Reset, and at the right ? (shortcuts). There is no close button in the panel: a ✕ there would look like closing the panel while it switches Direct off. It is centred and wraps neatly across rows.
  - **Shortcuts.** ? opens a card in the middle of the video with the shortcuts as key caps, in four groups (Playback, Picture, View, Mouse) and two columns, with "Gaffer Direct" and the version in the header. The card is at most 760 px wide and stays within the video; if it does not fit, it scrolls. ?, Esc or ✕ on the card closes it.
  - **Background.** Both bars have a grey, semi-transparent background. It is even behind the controls (Direct measures their height; 50 percent there) and then fades over 40 px to transparent: upwards for the bottom bar, downwards for the top bar. It makes the buttons visible without hiding the picture. The ⚙ panel and the quality row are 55 percent, the popups 70, the shortcuts card 80. Icons, texts and chapter marks have a thin dark shadow, so they stay readable on a white picture.
  - **Position.** The bottom bar sits at the bottom of the visible part of the video, the top bar at the top. Both follow the video in fullscreen, while scrolling (they scroll along with the video instead of sticking to the edge of the window) and rotating, and disappear when the video is mostly out of view (less than half of it visible, or of the window height for a taller video), for example when YouTube slides the video away for its end screen.
  - Both bars appear and disappear together. During a recording or download a small indicator stays visible at the top left of the video while the bars are hidden (● with the duration, or ⬇ with the percentage).
- **Narrower videos.** Below 480 px the pan arrows and the exposure sliders leave the ⚙ panel, below 400 px the buttons become 36 px, below 320 px −10 and +10 disappear. The shortcuts keep working.
- **Writing only changes.** Direct writes to the bars only what has changed. While the bars are hidden, the times and the seek bar wait and are brought up to date when the bars appear. Every write makes the browser lay out and paint the page again, which costs a lot on a page with a large DOM.
- **Idle.** The bars only appear when the mouse moves over their own video or the bars. They disappear immediately when the mouse leaves the video (or the browser window), and after 2 s without mouse movement. In fullscreen only the 2 s apply.
- **Mouse pointer.** A moving mouse is always visible over the video, also when the site hides it there (`cursor: none` on the video or on a layer over it, also in a shadow root). It hides together with the bars after 2 s without movement, if it is over the video itself or its player, in fullscreen and outside it. It stays visible over the bars, over anything else of the site (§11.7), next to the video and while dragging. Direct sets `cursor` inline on the element under the mouse and restores it exactly on the next movement, on release and on close; while hidden, every scan follows an element that comes under the mouse. Each video only handles its own, so another video on the page cannot hide it.
- **Seek bar margin.** The seek bar catches clicks up to 12 px above and below its line and 4 px beyond both ends. Left and right the position stays exactly where the mouse is (except on a chapter mark, §11.14).
- **Fullscreen** (F, as on YouTube, or double-click; also in the ⛶ tooltip and the shortcuts card). The overlay buttons take no focus, so Space and Enter after a click on ⛶ go to the shortcuts and not to the button. The video really goes fullscreen, in the top layer. Esc goes back. In fullscreen scrolling zooms without Ctrl. The same applies to a video that fills at least 90% of the width and the height of the window (sites with a player that covers the whole window).

### 11.3 Picture

| Function | Control |
|---|---|
| Rotate ±5° (Shift ±1°) | `[` / `]`, buttons |
| Quarter turn | R, button with the current angle |
| Flip horizontally / vertically | H / V |
| Zoom (×1.1 per step), towards the point under the mouse | + / −, buttons, Ctrl + scroll on the video, scrolling in fullscreen or on a video that fills the window |
| Pan (30 px, Shift 90 px) | arrow keys, buttons, dragging on the video |
| Brightness 50–200, steps of 5 | B up, Shift+B down, slider |
| Contrast 50–200, steps of 5 | N up, Shift+N down, slider |
| Reset | 0 or the Reset button: rotation, zoom, pan, flip, brightness, contrast and speed |

- **How it is applied.** Through one CSS transform on the video (`translate · scale(flip) · rotate · scale(zoom)`), and for exposure a CSS `filter: brightness() contrast()` (100 is unchanged). Both go into Direct's own style rule for the video, not into its `style` attribute, so the site's own style stays untouched and is back as soon as the rule goes. For a video in a shadow root the page's stylesheets do not reach it: there the rule, with those for hidden site elements, goes into a stylesheet of Direct's own in the shadow root's `adoptedStyleSheets`. At 100 and 100 there is no filter, so a filter of the site itself keeps working.
- **Exposure.** A group in the ⚙ panel with a slider for brightness and one for contrast, each with its value, and ↺ to reset only those two. Every change shows its value as a message ("Brightness 120"). The picture before the start gets the same filter, as it turns and zooms along. It counts as a picture setting: a new URL or a new source (§11.1) and Reset set it back to 100. It also works during an ad (§11.13).
- **Where exposure has no effect.** On some systems Chrome draws protected video (DRM, hardware decoding) outside the page, and a CSS filter does not reach it; Direct cannot tell. A recording or download (§11.10) is always without exposure: it uses the stream's own data or `captureStream()`.
- **Rotated picture.** On a quarter turn the picture is scaled to fit the frame.
- **Dragging** pans without toggling play/pause. The playback state from before the drag is kept.

### 11.4 Playback

- **Play / pause:** space or K, the button, or a click on the video.
  - A click that was really a drag does not count.
  - While anything of Direct is open (a popup of the bar, the chapter, CC or audio list, the quality list, the ⚙ panel or the shortcuts card), a click on the video only closes it. Only when everything is closed does a click pause or play (`ui/open.js`).
  - If the site resets the video after our click, Direct repeats the desired state after 80 and 350 ms.
- **Seeking:** ±10 s with J / L, and a seek bar with the current time and the duration.
- **Speed:**
  - Presets 0.25–10×: `<` / `>`, or the slider in the speed popup.
  - Fine steps of 0.05 with `,` / `.`, ▲ / ▼ in the speed popup, or scrolling on the speed button.
- **Preserve pitch** (P, or ♪ in the speed popup), on or off.
- **Captions** on or off with C (§11.12).
- **Sound:**
  - M toggles the sound. From 0 it comes back at 50.
  - **Through the site.** Muting and unmuting go through the site's own mute button when it has one (YouTube, video.js, JW Player, Plyr, Shaka, Flowplayer, Bitmovin, Radiant, Kaltura, THEOplayer, MediaElement.js, Fluid Player, Clappr, Media Chrome, Vidstack, or a button with mute, volume or sound in its label among the hidden layers, such as TikTok's), with a synthetic click as in §11.6.1. So the site knows it too, and its next video follows. If the video has not followed after 300 ms, Direct sets it itself; without a button it does so at once.
  - **For the page.** The last choice (muted or not, and the volume when the same level is off) is kept for the page. A video that starts playing gets it, once per source, unless another video is playing with sound at that moment. A feed that starts every video muted, or at its own volume, then keeps the sound.
  - Volume with PageUp / PageDown, the slider in the volume popup, or scrolling on the button. With the same level on (§11.15) they set the number every video follows.
- **Share** (the button in the top bar, `playback/share.js`).
  - **The site's button first.** From the video upwards Direct looks for the first element with a share button of the site, and stops at an element that holds another video: in a feed (TikTok) every video has its own. Known buttons first (YouTube, JW Player, video.js, Vimeo, Flowplayer, Bitmovin, TikTok), then a button with share, delen, teilen, partager, compartir or condividi in its label (not "deel": that is also a part). A button the site itself left out (no size) does not count; one Direct hid with the controls does. A click on Share clicks that button, so the site's own share window opens with its own options.
  - **Its panel stays.** A share panel the site opens over the video is not hidden (known panels, and for 4 s after the click a new layer with share in its class or id, or a dialog, that covers the video). In fullscreen Direct leaves fullscreen first and clicks after 250 ms, because the site's window would lie under the video.
  - **No site button.** The system's share menu (`navigator.share`) with the title and the link, otherwise the link is copied ("Link copied").
  - **The link** is the page's own link (`canonical`, then `og:url`, then the address). On YouTube, also in an embed, it is `youtube.com/watch?v=…`.
  - **Shift+click** always copies the link and skips the site's button. On YouTube (not live) it is the link at this moment, `youtu.be/…?t=…`.
  - Locked during an ad (§11.13). No shortcut.
- **Spinner.** While the video buffers a spinner turns in the middle of it (`playback/buffering.js`, `ui/loader.js`).
  - It shows when the video should play but stands still for lack of data, when a seek has not arrived yet (also while paused), when the first picture after play is not there yet, and while the buffer guard waits. Also live, during an ad and in fullscreen.
  - Not when paused, after the end, before the start, with an error or without a source, while casting, and not for a video that is not shown.
  - It appears after 0.3 s and goes as soon as the video continues. It is judged by the video itself (`seeking`, `readyState`, and whether the time moves). If the time stands still for 1 s while the player says it has data, that counts too (not for a `srcObject`, and not in a hidden tab).
  - It is white with a thin shadow and no background, at most 64 px (18 percent of the smaller side of the visible part, at least 20), lies in the container at the height of the bars (§11.2) and below them, lets clicks through, and also shows while the bars are hidden. In fullscreen it is in the top layer.
  - The play button shows a spinner too as long as the video is not paused; a click on it still pauses. Spinners of known players are hidden with their controls (§11.2).
- **Buffer guard** (not live). At a speed above 1.5× and less than 2 s × speed buffered:
  - Direct pauses automatically and shows the spinner;
  - it continues as soon as 10 s × speed is buffered, or after 8 s without progress.
- **Shortcuts** only work when the mouse is over the video or the top bar, or in fullscreen. They do not work in input fields.
- **During an ad** on YouTube seeking, previous/next and speed are locked and the speed is 1× (§11.13).

### 11.5 Live streams

- **Detection** (`playback/live.js`): `duration === Infinity`; or the player says it is live (video.js `vjs-live`, JW Player `jw-flag-live`); or the duration grows twice by more than half a second (less than a minute at a time) while the source stays the same. The last two catch a live stream with a window to rewind in (DVR, NOS), whose duration is finite.
- **What disappears:** seeking, ±10 s, speed and pitch. The speed stays 1×.
- **LIVE button:** jumps to the live edge (`seekable.end`, otherwise `buffered.end`, minus 2 s) and plays.
  - Red dot: you are watching live.
  - Grey dot: paused, or more than 10 s behind, with how far behind next to it (−0:42).
  - Behind counts from the delay the player keeps by itself: the smallest distance to the edge while the video plays steadily (2 s without pause, seek, waiting or another speed), measured from the start and again after LIVE.
- **Pausing** stays paused, even when the site starts the video again by itself. Playing on goes on from where it was paused; only when that moment has left the window (`seekable.start`) does it jump to live.
- **The buffer guard** is off for live.
- **Blocking playback by the site.** As long as the user paused through Direct, that video gets its own `play()` that does nothing, so a click elsewhere on the page does not make the video play briefly. If the site still starts it through `HTMLMediaElement.prototype.play`, Direct pauses again immediately. This applies to live and non-live.
  - The pause ends on playing through Direct (button, space, click on the video) and on a real click (`isTrusted`) on a play button of the site within the player (`aria-label`, `title`, class or text with play, afspel or start).
  - **Starting from outside the page** (media keys, Chrome's media controls, a headset) also ends the pause. Direct recognises it like this: there is user activation (`navigator.userActivation.isActive`) without a real mouse, touch or key event in the page in the last 5 s (that is how long activation lasts in Chrome), or there was a `MediaPlayPause` or `MediaPlay` key event in the last second. This also works when the site has its own media controls (`navigator.mediaSession`): they call `play()` while the activation is active.
  - Closing (§11.9) and a different video restore the video's own `play()`.

### 11.6 Quality

**Adapters.** Direct looks for a quality source in this order and uses the first one with more than one option:

1. Radiant Media Player (bitrates or mp4 sources);
2. YouTube (the API of `.html5-video-player`);
3. JW Player (`getQualityLevels()` of the player that contains this video: `jwplayer()`, otherwise `jwplayer(<id or element of its box>)`, so every JW Player on a page has its own);
4. video.js and Brightcove (`qualityLevels`, otherwise several `currentSources`; the player through `videojs.getPlayers()`, `videojs.players` or `videojs.getPlayer(id)`);
5. players with their own API:
   - Plyr (`video.plyr`: `options.quality.options` and `quality`);
   - Vidstack (the `<media-player>` around the video: `qualities`, `selected` per quality, `autoSelect()`; not when the list is read-only);
   - media elements with the media-tracks API (Mux Player's `mux-video`, `hls-video`, `dash-video`, what Media Chrome uses): `videoRenditions` with `selectedIndex`, −1 is automatic, on the video or on a host around it;
   - Kaltura (`KalturaPlayer.getPlayers()`, `getTracks('video')`, `selectTrack`, `enableAdaptiveBitrate`);
   - Flowplayer (`flowplayer.instances`: `video.qualities` and `quality(i)`, otherwise the hls.js or dash.js in `engine`);
   - dash.js (`getRepresentationsByType`/`setRepresentationForTypeById` in v5, `getBitrateInfoListFor`/`setQualityFor` in v3 and v4; a fixed choice switches `autoSwitchBitrate.video` off);
   - Bitmovin (`getAvailableVideoQualities`, `setVideoQuality`, `getVideoQuality`);
   - THEOplayer (`videoTracks[0].qualities`, `targetQuality`);
   - Clappr (`core.activePlayback`: `levels` and `currentLevel`, otherwise `_hls`).
   Direct finds dash.js, Bitmovin, THEOplayer and Clappr through the video (`video.dash`, `video.player`), `window.player` and the objects on `window`;
6. a quality menu of the site in a portal or tooltip (§11.6.1);
7. the quality menu in the player's DOM (video.js, JW Player, Plyr, Radiant or the direct parent): `li`, `menuitemradio`, `data-quality`, `data-res`, `data-resolution`;
8. an hls.js instance (also intercepted on creation) or Shaka Player attached to this video;
9. Vimeo (in the player's iframe): Vimeo's quality menu anywhere on the page. This is the fallback; an hls.js or dash.js instance takes precedence;
10. several `<source>` elements with a label or resolution.

Every adapter provides the options with resolution and, if the player knows it, the bitrate.

**Supported players.** Every player listed above stays supported. Every adapter has an e2e test with a real or stand-in player, so a change cannot break it unnoticed. hls.js and dash.js are tested with the real player (copy in `test/e2e/pages/vendor/`), the others with a stand-in player in `players.html`.

**Display.**
- A button shows the current quality and opens a row of options, highest first, with Auto included.
- If no fixed quality is chosen, the button shows "Auto · 720p", with the real height of the picture.
- While switching, the button and the chosen option blink, with "…" after the name. Switching is done as soon as the video height changes.
- The list is fetched again per stream. Streams can have different qualities.

**Codecs.** If a chosen quality plays for 2.5 s without new frames, or without a picture size:
- that quality is marked as unplayable for this stream;
- Direct goes back to the previous quality;
- Direct shows "… can't be played by your browser (codec), back to previous".

This applies to every quality source in the list above. If it was Max's choice, Max then picks the next best playable quality. While the tab is hidden the check does not count (Chrome does not decode the picture then), and neither does it during an ad (§11.13).

**Max.**
- Max picks the highest quality once per stream (per page URL): the highest resolution.
- At equal resolution the bitrate and the name decide (see Original). If there is still no difference, the topmost in the site's menu wins.
- Max skips Auto and unplayable options.
- If the user picks a quality, it applies until the next stream.
- The Max button in the panel switches this on or off. The choice is remembered per site (`localStorage` `vu-max`) and is on by default.

**Original.**
- Options like "Original", "Origineel", "Source" or "Bron" without a number are recognised as an option of their own.
- The button then shows "Original · 1080p".
- Max prefers Original over all options with a number.
- With players that report the bitrate (hls.js, video.js, Shaka, dash.js, Bitmovin, THEOplayer, Clappr, Kaltura) the highest bitrate decides at equal resolution. With site menus first "60" and then "Source"/"Original" in the name decide.

#### 11.6.1 Site quality menu (portal)

For sites whose quality menu only appears in a separate tooltip after a click:

1. **Finding the button.** Direct looks for the button by `title`, `aria-label` or `data-testid` containing qualit, kwaliteit or resolu, in the video's ancestors.
2. **Opening the menu.** First a short simulated mouse movement, because some sites only respond when the pointer is "active". Then a click.
3. **Reading invisibly.** New elements are hidden while reading, so you do not see the menu flash. A menu that is already open is reused without clicking.
4. **Reading the options.** From `data-resolution`, `data-quality` or `data-res`, otherwise from text that looks like a resolution, plus an Auto switch if there is one.
5. **Choosing.** A choice sends the full sequence of pointer and mouse events to the option.
6. **Confirming.** The choice counts as confirmed when the video height changes. If nothing happens after 6 s, Direct checks the menu again and may report "Site doesn't respond to the quality choice".
7. **Retrying.** If the menu is not available yet: 10 times with 3 s in between, then every 15 s.
8. **Refreshing the list.** The stored list is refreshed in the background after 60 s.

### 11.7 Clicks and the rest of the page

- **Our own controls.** Clicks on the panel and the bars never go to the site or the video. This covers the whole grey part behind the controls, also between and around the buttons and beside the seek bar, plus 6 px of the fade; the rest of the fade belongs to the video. A press on the bars that ends over the video is not a click on the video. Hidden bars catch nothing. The bars of another video count too, also when both videos share a parent.
- **Site elements over the video.** A click only plays or pauses when it lands on the video itself, on an element that contains the video, or on the picture before the start. A click on any other site element over the video (a popup, a tooltip, a button) goes to the site.
- **What lies on top counts.** Outside fullscreen dragging, Ctrl + scroll, the shortcuts and showing the bars only work when the element under the mouse is the video, an element that contains it, a layer of its player or our bars. The player is the container (§11.2) if it is not much larger than the video, otherwise only the video's own layers. Over anything else, such as a page header with a search field, Direct does nothing: the bars hide and the site gets every click, key and scroll. A press on a link, button or field in the player does not start a drag.
- **Dialogs and overlays of others.** Clicks on `[popover]`, `dialog`, `[role=dialog]`, `[aria-modal=true]` or the Inspect panel always go through, also above the video. While such a site element, or a shown ad of another player than YouTube (§11.2), is visible over the video, the bars step aside and only come back when it is gone; so they never cover a Skip button. In fullscreen only a site element that really lies above the video counts (hit test at the middle of the overlap); one behind the video, such as a cookie notice in the page, does not hide the bars.
- **Generated events.** Direct ignores clicks, drags and mouse movements created by scripts (`isTrusted = false`).

### 11.8 Messages and errors

- **Short messages.** These appear in the middle of the picture, such as "Zoom 1.2", "1.50×", "Live" or "720p". If they would lie over the spinner (§11.4), they come below it.
- **Errors per part.** An error in a part (scan, buffer and so on) gives one red message and then stays quiet. The part keeps running. In quiet mode errors only go to the console (§6.1). Direct keeps the last errors per part (the part, the message and how often), so Inspect can report them (§12.1). Every part goes through the same guard (`direct/safe.js`): the timers (scan, buffer, level, spinner) and the event handlers (keyboard, mouse, wheel, popups, panel, the buttons and sliders in the bars, the events of the video, the page and the window). A bug nobody thought of then still shows up in the report.
- **Version.** The header of the shortcuts card shows the version, the build time.

### 11.9 Closing and restoring

`window.__vuClose()` closes Direct: the extension calls it when Gaffer is switched off on the site (§4.5) and before an update; a new start of the bookmarklet calls it before Direct starts again. Direct itself has no button to switch it off; from the bookmarklet, reloading the page does. Then:

- all event listeners, intervals and observers are removed;
- the transform, the `data-vu` markers and the hidden site elements are restored, including `controls`;
- top bar, panel, bars, messages and styles disappear;
- replaced functions (hls interception, the video's own `play()`) are restored, and Direct's stylesheet leaves the shadow root of the video;
- watching Cast devices stops (`cancelWatchAvailability`);
- the volume the site had set is back, if the level (§11.15) was steering it.

After closing the page is functionally and visually the same as before the start. This is the basis for "off" in the extension (§4.5).

### 11.10 Recording

A **⏺ Record** button in the top bar (§11.2). During recording the duration and file size count along, and the button is red. Clicking again stops the recording. Before the start Direct checks the recording policy (§11.10.1).

**Notice before the start.** If the recording policy allows recording, a notice appears first in the top layer (no browser dialog):

> Recording may not be allowed. Many sites forbid it in their terms, and the content may be protected by copyright. Only record for your own use and when you are sure it is allowed.
> [ Record ] [ Cancel ]   ☐ Don't show again on this site

- **Record** then opens the file picker. The click counts as a user action for the browser.
- **For a download** the notice says "Downloading may not be allowed." instead of "Recording may not be allowed.", "download" instead of "record" in the last sentence, and the button is called **Download**.
- **"Don't show again"** is remembered per site (`localStorage` `vu-rec-ok`), for recording and downloading together.
- **No policy signal does not mean permission.** The notice also appears on sites without a signal.
- **`nodownload`.** If the video has `controlslist="nodownload"`, the notice always appears, also after "Don't show again", with the extra line "This site has also turned off the browser's own download option for this video." (§11.10.1).

**Label.** The button shows the method Direct would use: ⬇ Download for a plain file or a downloadable manifest, otherwise ⏺ Record. Also when recording is not allowed; the button is then grey. On a blocked site (§11.10.1) there is no button at all.

**Stopping asks first.** Clicking the button during a recording opens a notice in the top layer: "Stop the recording? What has been recorded is saved." [ Stop ] [ Keep recording ]. During a download: "Cancel the download? The partial file is removed." [ Cancel download ] [ Keep downloading ]. The other ways of stopping (below) do not ask.

**Method.** Direct chooses automatically, in this order:

1. **Stream chunks (MSE).** If the video plays through Media Source Extensions (hls.js, dash.js, Shaka, custom players), Direct intercepts `SourceBuffer.prototype.appendBuffer` and writes the bytes unchanged.
   - This gives the original quality, without re-encoding.
   - The format is fragmented MP4. hls.js already converts TS into it.
   - Direct always remembers the last init segment per SourceBuffer, so a recording can also start halfway through a stream. If the init segment is missing because the interception started too late (bookmarklet, or switching on in an open tab), Direct requests a quality switch so the player sends a new init segment: with hls.js it switches to a neighbouring level and straight back, and starts writing from the init segment of the original level. If not every buffer has an init segment within 4 s of that (for example a separate audio track that is not re-sent), or there is no second level, Direct falls back to MediaRecorder (method 3).
   - Which SourceBuffers belong to the video: capture links them through the MediaSource (`addSourceBuffer` and `URL.createObjectURL`). If capture started late, Direct takes the MediaSource from the player (hls.js `bufferController.mediaSource`), otherwise the buffers that received data in the last 30 s.
   - A player that has already buffered far ahead appends nothing until playback catches up; the recording only grows from then on.
   - During recording the quality is fixed. Quality choice and Max are disabled then. A switch by the site itself (new init segment) starts a new part file.
   - Picture and sound in separate SourceBuffers are muxed into one MP4 file while writing (§11.10.2).
2. **Single file.** If the source is a plain file (`currentSrc` is http(s) and not `blob:`), Direct records nothing but offers the download of that file.
   **Downloading from the manifest (not live).** This goes before recording through MSE: a stream that is not live and whose manifest Direct knows is downloaded. Live means live by the detection of §11.5, or a live manifest (HLS without `#EXT-X-ENDLIST`, DASH `type="dynamic"`).
   Direct finds manifests in the resource entries of the page (`performance`, also through a `PerformanceObserver`) and from the player (hls.js `url`), and fetches them itself to read them. If the stream is not live and Direct knows the manifest (m3u8 or mpd, from the intercepted network requests or from the player), Direct fetches all chunks of the current quality itself and writes them through the muxer (§11.10.2) into one file. That is much faster than playing.
   - The button is then called **⬇ Download**, with a progress bar (percentage and estimated time left).
   - Direct fetches at most 4 chunks at a time, with the same cookies and `Referer` as the player (fetch from the page). A failed chunk is retried 3 times, after that the download stops with a message.
   - Which manifest: the player's own (hls.js `url`), otherwise the last one seen, a master before a media playlist. Only a manifest whose length matches the video's (within 2 s or 2 % of `duration`) counts, because the page may also have loaded an ad or a preview. A live manifest is read again every 10 s, since it may have ended meanwhile. A DASH manifest whose video is only WebM is recorded through MSE.
   - A DASH stream with several periods gets the init segment of each period where it changes.
   - The current quality is the player's level (hls.js). Otherwise Direct takes the variant closest to the video's height, and at equal height the highest bitrate.
   - With separate video and audio variants (DASH, or HLS with `EXT-X-MEDIA`) both are fetched.
   - fMP4 chunks go straight through the muxer. TS chunks and packed audio are converted first (§11.10.3). A video playlist and an audio rendition must both be fMP4, or both TS/packed audio; a mix is recorded through MSE.
   - Cancelling is always possible. The partial file is then removed.
   - A plain file is fetched from the page and streamed to disk, with the same progress. If the fetch fails (another domain without CORS), Direct falls back to MediaRecorder; if that fails too, "Recording not possible for this video".
3. **Re-encoding (MediaRecorder).** As a safety net Direct records `video.captureStream()` with MediaRecorder: MP4 if Chrome supports it, otherwise WebM.
   - Direct then reports "Recording is being re-encoded".
   - This only records while the video plays.
   - If it does not work, for example with video from another domain without CORS, Direct reports "Recording not possible for this video".

**Saving.**
- At the start the user picks a file with `showSaveFilePicker`. The suggested name is `<site>-<date>-<time>.mp4`.
- The chunks are written straight to disk and not collected in memory. Recordings of hours must be possible.
- If `showSaveFilePicker` is not available, a regular download follows at the end, with a warning about memory use.
- **Extra files** (a new part after a quality switch by the site, the second WebM file) cannot get a file picker of their own, because the picker needs a user action. They are kept in memory and offered as a regular download at the end.

**Stopping.** The recording stops on:
- the button;
- closing Direct or switching to another video;
- a signal from the recording policy;
- leaving the page.

The file is always closed properly. What has been recorded is kept, also on a signal from the recording policy.

**With the extension.** To be able to remember the init segment, the interception of `appendBuffer` must be active before the player. That is why Gaffer registers capture at `document_start` on active sites, separate from Direct at `document_idle` (§4.5). In a frame inside the page capture starts a little later.

#### 11.10.1 Recording policy

Recording does not work as soon as one of these signals is present:

| Signal | Detection |
|---|---|
| **DRM** | `video.mediaKeys` is not `null`, or an `encrypted` event occurred on the video. |
| **Encrypted stream** | The HLS manifest contains `#EXT-X-KEY` or `#EXT-X-SESSION-KEY` with a `METHOD` other than `NONE`, or the DASH manifest contains `ContentProtection`. Source: the intercepted manifests (fetch/XHR) and, with hls.js, the `decryptdata` of the fragments. Only a manifest whose length matches the video's counts (as for the download, §11.10), so an encrypted ad or preview on the page does not block another video; a manifest or video without a known length always counts. |
| **Blocked site** | The host name of the frame or of the top-level page is on the block list (below). |

- **Disabled.** The Record button is then disabled, with the reason as tooltip, for example "Recording not allowed: encrypted stream". There is no way to do it anyway.
- **During a recording.** Direct also checks the policy continuously. If a signal appears, the recording stops immediately with the reason as message.
- **Download of a single file** (method 2) falls under the same policy.
- **`nodownload` is a warning, not a signal.** `controlslist="nodownload"` only hides the browser's own download option; sites often set it while offering a download themselves. Direct mentions it in the notice (§11.10) and Inspect reports it (§12.3), but it does not block.
- **Block list.** Sites whose terms forbid downloading and whose owners can hold Gaffer to that in the Chrome Web Store (§8, decision 12). The list is fixed in the code (`src/shared/blocked-sites.js`), never fetched. A domain covers all its subdomains. Both the frame and the top-level page count, so an embedded player of a blocked site (for example a YouTube iframe) is blocked on every site; Direct reads the top-level host from `location.ancestorOrigins`.
  - **Tier 1, enforced by Google itself:** `youtube.com`, `youtube-nocookie.com`, `youtubekids.com`.
  - **Tier 2, large rights holders:**
    - streaming: `netflix.com`, `disneyplus.com`, `primevideo.com`, `max.com`, `hbomax.com`, `hulu.com`, `tv.apple.com`, `paramountplus.com`, `peacocktv.com`, `crunchyroll.com`, `dazn.com`, `viaplay.com`, `skyshowtime.com`, `videoland.com`, `npo.nl`, `nlziet.nl`, `ziggogo.tv`, `tv.kpn.com`;
    - music: `spotify.com`, `deezer.com`, `soundcloud.com`, `music.apple.com`;
    - social media: `instagram.com`, `facebook.com`, `tiktok.com`, `x.com`, `twitter.com`, `twitch.tv`, `snapchat.com`, `linkedin.com`;
    - paid courses: `udemy.com`, `coursera.org`, `skillshare.com`, `masterclass.com`, `domestika.org` (LinkedIn Learning falls under `linkedin.com`);
    - paid creators: `onlyfans.com`, `fansly.com`, `patreon.com`.
  - **Hidden, not disabled.** On a blocked site Direct shows no Record or Download button and no recording indicator. Everything else in Direct works as usual.
  - **Test setting.** `window.__gafferBlockedHosts` (an array of host names, set by the harness) adds hosts to the list for the tests. It can only add blocks, never lift one.
  - **All methods.** The block covers MSE, the manifest download, the single file and MediaRecorder.
  - **Inspect** reports the block (§12.3).
- **No guarantee.** The policy is a guard rail inside Gaffer, not security. The absence of a signal does not mean that recording is allowed under a site's terms.

#### 11.10.2 Muxing into one file

Players often feed picture and sound through separate SourceBuffers, each with its own fragmented MP4 stream. Direct writes one playable file from them, without an external library. A minimal MP4 box reader and writer of our own does the following:

1. **Init.** One `ftyp` plus `moov` is made from the init segments of both buffers.
   - Both `trak` boxes go in, with unique `track_ID`s (1 = video, 2 = audio).
   - `mvex` gets a `trex` per track.
   - The `mvhd` timescale and `next_track_ID` are adjusted.
2. **Fragments.** Every `moof`/`mdat` pair is copied.
   - The `track_ID` in `tfhd` is adjusted.
   - `sequence_number` in `mfhd` is numbered continuously.
   - The `data_offset` in `trun` stays valid, because every fragment is copied as a whole.
   - The header is written just before the first fragment. A new init segment before that replaces it without a new part.
3. **Order.** Fragments are interleaved by `baseMediaDecodeTime` (`tfdt`, converted to seconds), video and audio alternating. That keeps them in sync during playback. A small queue holds fragments until the other track has caught up.
4. **Aligned start.** For a recording that starts halfway, the file begins at the first video fragment with a keyframe. Audio fragments that end before that are dropped.
   - **Own timeline.** The recording starts at 0, not at the position in the stream. The earliest start of the first kept video and audio fragment is the zero point; the muxer subtracts it from `baseMediaDecodeTime` in every `tfdt` (in the timescale of each track, version 0 and 1). Every part file starts at 0 again. With separate buffers the zero point is fixed once both have a fragment.
5. **One buffer with both tracks.** The chunks are then written through unchanged, apart from the timestamps (point 4).
6. **Not supported.**
   - WebM buffers (`video/webm`, for example VP9 or Opus on YouTube), or a structure the muxer does not recognise: two separate files, with a ready-made `ffmpeg` command to combine them. Direct reports that.
   - A new init segment with different codec settings (a quality switch by the site): a new part file (`-part2.mp4`).

#### 11.10.3 Converting TS to MP4

For HLS streams with MPEG-TS chunks or packed audio Direct converts the chunks to fragmented MP4, without re-encoding. There is no external library. The code lives in `src/media/ts/`.

1. **Reading TS.**
   - Packets of 188 bytes.
   - The PIDs of video and audio follow from the PAT and PMT. Stream type `0x06` is recognised by its AC-3, E-AC-3 or registration descriptor.
   - The PES packets are assembled, with PTS and DTS (90 kHz).
2. **Video: H.264 (AVC).**
   - The Annex B start codes are split into NAL units.
   - SPS and PPS go into `avcC`. Width and height come from the SPS. Access unit delimiters, SPS and PPS are removed from the samples (`avc1`).
   - Samples get a length prefix (AVCC).
   - Keyframes (IDR) are marked as sync samples. Each track starts at its first keyframe; earlier frames are dropped.
   - Composition offsets come from PTS minus DTS. The delay of the first frame (B-frames) goes into an edit list (`elst`), so the picture starts at the same moment as in the source.
3. **Video: H.265 (HEVC),** if the stream contains it. The same principle, with VPS, SPS and PPS in `hvcC` (`hvc1`). IRAP frames are keyframes.
4. **Audio: AAC (ADTS).**
   - The ADTS headers are removed.
   - The `AudioSpecificConfig` (`esds`) comes from the first header.
   - Every frame is one sample of 1024 samples. Frames that run across PES packets are put back together.
   - MP3 in TS is copied as `mp4a` with object type MP3. AC-3 and E-AC-3 as `ac-3` (`dac3`) and `ec-3` (`dec3`).
5. **Packed audio.** An HLS audio rendition (or an audio-only stream) with `.aac`, `.mp3`, `.ac3` or `.ec3` chunks: the ID3 tag in front of each chunk gives the timestamp (`com.apple.streaming.transportStreamTimestamp`), the frames behind it are read as in point 4.
6. **Other codecs.** Another video codec (MPEG-2, VC-1, …) or audio codec (LATM, DTS, …) gives a message instead of a file: "Download stopped: the stream uses mpeg2video, which Direct can't convert". Chunks that are neither TS nor packed audio give "the stream chunks are in a format Direct can't read".
7. **Output.**
   - Per chunk one `moof`/`mdat` per track, with `tfdt` from the first DTS.
   - Every track gets its own init segment. They go to the muxer (§11.10.2), which makes one `moov` from them and interleaves video and audio. With an audio rendition the audio of the video chunks is left out.
   - Changed codec settings (a new SPS, another audio configuration) give a new init segment; the muxer then starts a new part file.
8. **Continuous time.**
   - A jump in the timestamps between chunks (discontinuity, `#EXT-X-DISCONTINUITY`, or a jump of more than 10 s) is corrected: the chunk continues where the previous one ended. A wrap of the 33-bit PTS is unwrapped, so the timeline in the file continues.
   - Missing samples are not invented.
9. **Encryption.** Encrypted TS (`EXT-X-KEY`) never gets here, because the recording policy already blocks it (§11.10.1).
10. **Testing.**
    - Test files made with ffmpeg (`test/fixtures/make.sh`, in `test/fixtures/media/ts/`): H.264 (with B-frames) + AAC, HEVC + AAC, audio only, MP3, AC-3, E-AC-3, packed AAC with an ID3 timestamp, with a discontinuity, with a PTS wrap, and MPEG-2 video for the message.
    - Unit test (`test/unit/ts.test.js`): `ffprobe` must show the same duration, resolution, codecs and number of frames as the source, and decoding with ffmpeg gives no errors.
    - e2e test: the download of HLS with TS chunks, with a discontinuity and with a PTS wrap must play in Chrome. HEVC is only checked with `ffprobe`, because Chrome on Linux only plays HEVC with hardware decoding.

### 11.11 Casting

A **Cast** button in the top bar (§11.2), using Chrome's Remote Playback API (`video.remote.prompt()`), the same as Chrome's own Cast button.

- **Visible** only when a Cast device is available (`video.remote.watchAvailability`), and not when the site has set `disableRemotePlayback`.
- **Limitation.** Chrome can only cast a video with a plain source. With MSE streams (hls.js, dash.js, Shaka and most live streams) the button is disabled, with the tooltip "Can't cast this stream". Casting through the manifest would need the Cast SDK, an external script; that is outside §13.
- **While casting** the button shows "Casting…" and then "Casting". The Remote Playback API does not report the device name. The bottom bar then controls playback on the Cast device. Clicking the button again opens Chrome's chooser to stop.
- **Closing** (§11.9) removes the listeners (`watchAvailability` is cancelled with `cancelWatchAvailability`). A running cast keeps going; it belongs to the browser.
- **Test:** a simulated `video.remote` on a test page (available, not available, `disableRemotePlayback`, MSE source).

### 11.12 Tracks and player integration

Captions and audio tracks work for every supported player that offers them. Direct talks to the player's own API, so the player stays in step (its own menus show the same choice), and falls back to the `<video>` itself. If a source offers nothing, the button stays away.

**Sources.** Per kind (captions, audio) Direct uses the first source in this order that has tracks of that kind:

| Player | Captions | Audio tracks |
|---|---|---|
| YouTube | caption tracks from `getPlayerResponse()` (otherwise `getOption("captions", "tracklist")`); choosing through `loadModule("captions")` and `setOption("captions", "track", …)`, Off through an empty track and `unloadModule("captions")` | `getAvailableAudioTracks`, `getAudioTrack`, `setAudioTrack` |
| JW Player | `getCaptionsList` (entry 0 is Off), `getCurrentCaptions`, `setCurrentCaptions` | `getAudioTracks`, `getCurrentAudioTrack`, `setCurrentAudioTrack` |
| video.js and Brightcove | `textTracks()` (subtitles and captions, `mode`) | `audioTracks()` (`enabled`) |
| Plyr | the video's text tracks, through `currentTrack` and `toggleCaptions` | — |
| Vidstack | `textTracks` of the `<media-player>` (`mode`) | `audioTracks` (`selected`) |
| Kaltura | `getTracks('text')`, `selectTrack`, Off through the "off" track or `hideTextTrack` | `getTracks('audio')`, `selectTrack` |
| Flowplayer | through the hls.js or dash.js in `engine` | same |
| dash.js | `getTracksFor("text")`, `setTextTrack` (−1 is Off), `enableText` | `getTracksFor("audio")`, `getCurrentTrackFor`, `setCurrentTrack` |
| Bitmovin | `subtitles.list`, `subtitles.enable`, `subtitles.disable` | `getAvailableAudio`, `getAudio`, `setAudio` |
| THEOplayer | `textTracks` (`mode`) | `audioTracks` (`enabled`) |
| Clappr | `closedCaptionsTracks`, `closedCaptionsTrackId` (−1 is Off), otherwise `_hls` | `audioTracks`, `currentAudioTrack`, `switchAudioTrack`, otherwise `_hls` |
| hls.js | `subtitleTracks`, `subtitleTrack` (−1 is Off), `subtitleDisplay` | `audioTracks`, `audioTrack` |
| Shaka Player | `getTextTracks`, `selectTextTrack`, `setTextTrackVisibility` | `getAudioTracks`/`selectAudioTrack`, otherwise `getAudioLanguagesAndRoles`/`selectAudioLanguage` |
| any other video | `video.textTracks` (subtitles and captions, `mode`) | `video.audioTracks` (`enabled`) |

Players are found the same way as for quality (§11.6). Radiant and Vimeo use the video's own tracks.

- **Labels.** A track shows its own label, otherwise the language name in the browser's language (`Intl.DisplayNames`), otherwise "Track 2".
- **Captions.** A CC button in the bottom bar, left of Audio and the speed, highlighted while captions are on. It opens a popup above the button (like volume and speed) with Off and the tracks; a choice closes it. The popup is compact and scrolls when the list is longer than the room above the button. Shortcut C turns captions on or off: on picks the last chosen track, otherwise the one in the browser's language, otherwise the first. Without captions C goes to the site.
- **Audio tracks.** If the video has more than one audio track, an Audio button next to CC opens the same kind of popup with the tracks. During a recording the choice is locked, as with quality.
- **One popup at a time.** Opening the captions, audio, volume or speed popup closes the other.
- **Per stream.** The lists are read again on a new stream (§11.1).
- **Speed on YouTube.** The speed controls (§11.4) go through `setPlaybackRate` when the speed is one of `getAvailablePlaybackRates()`, so YouTube does not reset it. Other speeds are set on the video itself.
- **Inspect.** The report shows the tracks per video (§12.1), and for a video with Direct its quality source, the options with bitrate, and the chosen captions and audio track.
- **Test:** every source above has an e2e test: hls.js with the real player (a stream with two audio tracks and subtitles), the others with a stand-in player in `tracks.html`, and native tracks with a `<track>` element.

### 11.13 Ads on YouTube

Direct also controls the ad, with the user's settings, but locks everything that could skip the ad or run through it. It never hides the ad elements of YouTube.

- **Detection.** An ad is playing while `#movie_player` (the `.html5-video-player` around the video) has the class `ad-showing` or `ad-interrupting`. Direct follows the class with a `MutationObserver` on that element (with a cleanup, §14).
- **Ad elements stay.** YouTube's ad elements (`.video-ads`, `.ytp-ad-module`, classes with `ytp-ad-` or `ytp-skip-ad`), such as the Skip button, the "Sponsored" label and the advertiser's link, are never hidden and stay clickable; pressing on them is not a drag. YouTube's own top and bottom chrome stays hidden, as with a video, so there is no double set of controls. The yellow progress bar of the ad is hidden; Direct's seek bar shows the progress.
- **Layers.** During an ad the bars lie inside YouTube's player (`.html5-video-player`), one z-index above the video and its containers, so the ad layer with the Skip button goes over them. After the ad they go back to the player box (§11.2). In fullscreen they stay under `body`.
- **Clicks on the picture** go to YouTube where its ad layer catches the mouse; otherwise they play or pause, as with a video.
- **Works as usual:** play and pause (with the hold), volume and mute, rotating, flipping, zooming and panning, fullscreen, the panel and the shortcuts card. Picture settings apply to the ad and carry over to the video and back.
- **Locked:** the seek bar, −10 / +10, J / L, ⏮ / ⏭, the speed (always 1× during an ad), quality, captions and audio track. The buttons are disabled with the tooltip "Not available during an ad"; a shortcut gives that as a message and does not go to the site. The functions behind them check it too, so the scroll wheel or a drag that was going on does not get past the ad. Max waits until after the ad.
- **Fullscreen** (Direct's own, F) stays on during an ad. Only the video lies in the top layer then, so YouTube's Skip button is not visible; F or Esc leaves fullscreen to reach it.
- **Reset** (0) during an ad also clears the remembered speed.
- **Not a new stream.** The switch from ad to video and back does not count as a new stream (§11.1), even though the duration differs: settings and quality state are kept. A source change up to 3 s after the ad starts or ends belongs to the ad.
- **Speed after the ad.** A new source resets `playbackRate` before the class change arrives, so Direct remembers the speed from the last rate change outside an ad. After the ad it sets that speed again, and once more when the video's metadata arrives within those 3 s.
- **Closing** during an ad restores everything as usual (§11.9).
- **Test:** the YouTube stand-in player in `players.html` has an ad mode (the class `ad-showing`, an ad module with a Skip button and a different source with a different duration): the bars stay, YouTube's chrome is hidden and the ad elements are visible and clickable, every locked control and shortcut does nothing, play, mute and picture settings work, and after the ad the speed, picture and quality are back. Also a drag on the seek bar when the ad starts, reset, fullscreen and closing during an ad. With `&stack` the stand-in has YouTube's nesting, and the Skip button must lie over the speed button.

### 11.14 Chapters

- **Marks.** A mark on the seek bar at the start of every chapter except the first, exactly where the thumb stands at that time. Hovering the seek bar shows the time and the chapter as a tooltip.
- **Marks as buttons.** A click on a mark, or within 8 px of it, goes exactly to the start of that chapter and shows its name. The reach is at most a third of the distance to the next mark (or to the end of the seek bar), so a click in between stays possible; the nearest mark wins. The start of the seek bar works the same way for the first chapter. The mark under the mouse is larger and brighter and gives its own time and name as the tooltip. A press on a mark only seeks on release; moved more than 3 px it becomes a normal drag, which never snaps. The height is that of the seek bar's margin (§11.2).
- **Slide.** After a choice, from the list or on a mark, the video is there at once and the thumb and the time slide to it in 0.3 s; the bars stay visible. Pressing the seek bar, another choice (which continues from where the thumb is), another seek, an ad or closing stops the slide. No slide with reduced motion set in the system or in a hidden tab. ±10 and the shortcuts jump without it.
- **Name and list.** The name of the current chapter is a button in the bottom bar, right of ⏭. It opens a popup with the chapters and their times; a choice jumps there and closes it. On narrow videos (below 520 px) the name disappears; the marks stay.
- **When.** With two or more chapters. Not on live streams and not during an ad (§11.13). A found source is read on every scan, when the video starts playing or its duration changes and when an ad ends, and looked up again on a new URL or when the source has no chapters any more. Without a source Direct looks for one on the first five scans and after that every third scan (as for quality and tracks), and at once when the video starts playing, its duration changes or an ad ends. An embedded YouTube player only has its chapters after the start, so before that there are none; Direct does not fetch them itself.
- **Sources,** in this order (`src/shared/chapters.js`, pure lookups):

| Player | Source |
|---|---|
| YouTube (also embedded) | `getWatchNextResponse()` of the player, only if it belongs to the current video; the maker's chapters before the automatic ones |
| JW Player | `getCues()` with `cueType` "chapters" |
| video.js, Brightcove | `textTracks()` of kind "chapters" |
| Plyr | `config.markers.points` |
| Vidstack | `textTracks` of the `<media-player>` of kind "chapters" |
| Shaka Player | `getChaptersTracks()`, with `getChapters()` (4) or `getChaptersAsync()` (5) |
| Bitmovin | the `markers` in the metadata of the source or the UI configuration |
| THEOplayer | `textTracks` of kind "chapters" |
| any other video | `video.textTracks` of kind "chapters", otherwise `navigator.mediaSession.metadata.chapterInfo` if the page has one video |

- **Loading.** A chapter track that is off has no cues. Direct sets it to `hidden`, which loads it without showing it, and restores it when it leaves the video.
- **Test:** every source has an e2e test with a stand-in player (`tracks.html?chapters=…`); also the place of the marks, clicking them, marks close together, dragging, the slide and what stops it, chapters that arrive late, another video, an ad, frames of another domain on the page, and closing.

### 11.15 The same level for every video

Every video sounds as loud as the one it was switched on for, whatever volume the site uses. There is one number: the volume the user sees.

- **Button.** In the volume popup, under mute; off by default. Highlighted while on. Switching it on or off does not change the number. The slider, the number, Page Up / Page Down and scrolling keep working as a volume while it is on: the button stays on and every next video follows the new number; 0 mutes the video and keeps the number. Switched off, the video plays at the number without correction. The tooltip shows the number and the volume Direct uses for this video.
- **The measure.** The video it is switched on for keeps its own volume. Direct listens to it (3 s, not while muted, paused, in a hidden tab or during an ad) and keeps following it until another source comes: its loudness (`ref`) belongs to the number. Other videos get volume = number × 10^((ref − loudness) / 20), at most 1. Until `ref` is known every video plays at the number. If the sound cannot be measured, −18 LUFS is the measure. Real decibels are unknown to a page: they also depend on the system volume and the speakers.
- **Steering.** Direct sets `video.volume`, every 250 ms: down at most 3 dB and up at most 0.4 dB per step, faster in the first 3 s of sound (8 and 2). The sound is not rerouted through Web Audio: that would silence files of another domain without permission and could not be undone. A volume the site sets in between is overruled and remembered; closing gives it back.
- **Measuring.** A copy of the sound (`captureStream`, or the `srcObject` stream) goes to one `AudioContext` per page with the K weighting of ITU-R BS.1770; blocks, the last half minute, silence and parts 10 LU below the rest do not count, and a part that is suddenly louder counts at once. Until 3 s of sound has been measured a video is never taken for softer than the average. A new source or the start or end of an ad starts again; after a quality switch by Direct the loudness so far holds. Chrome only lets an `AudioContext` run after an action of the user on the page.
- **YouTube** is measured as well. What it states is only used for the first 3 s, and after that as a floor until half a minute has been measured, so a quiet intro is not turned up. It is the loudness of the version that plays: YouTube often plays one with its own compression (DRC, "stable volume") that can differ by 7 dB. So first the stats for nerds (`cont.`), then the format that plays, then `audioConfig`, and only if it belongs to the current video. An ad is only measured.
- **Limits.**
  - A video cannot go above its own volume 1. If that is not enough the button says so.
  - The sound of a file of another domain without permission, and of DRM, cannot be captured. Direct then takes −18 LUFS (on YouTube what it states), and the button says so.
  - Chrome gives the sound to one capture at a time. A recording with MediaRecorder (§11.10) takes it; meanwhile the loudness so far holds. A site that captures its own video loses that sound while the level is on.
  - While casting Direct does not steer.
- **Mute** stays mute, also the volume 0 some sites use for it.
- **Storage.** In the extension one setting for all sites (§4.4, §4.5); the bookmarklet keeps it per site (`vu-level` in `localStorage`). Videos on one page follow each other at once, other open pages when they come into view.
- **Test:** `direct-level.test.js` with noise of −8 and −24 LUFS, as reference and as the next video (also measured against ffmpeg by hand), the bridge in `extension.test.js`, and the calculations in `loudness.test.js`.

---

# Part C — Gaffer Inspect

## 12. Gaffer Inspect (was Video Analyse)

Inspect analyses the page once and shows a text report in a panel with the buttons **Monitor**, **Report an issue** and **Close** (in Gaffer (dev) also **Copy**). The report is meant for an issue on GitHub, so a problem with a player or a site can be found and fixed (§12.5).

### 12.1 Report

In this order:

1. **Header:** version, page URL, how Inspect was started (extension with the shell version, Gaffer (dev), or bookmarklet), the Chrome version, the window size with the pixel ratio, and the browser language.
2. **Video elements:** per `<video>`, also those in shadow roots (§11.1):
   - size, visibility, `src`/`currentSrc` (shortened), `<source>` elements;
   - for a video in a shadow root: open or closed, and the tag of its host;
   - the chain of ancestors, as the page is drawn;
   - the box on screen (position and size), `display`, `visibility`, `opacity`, `transform` and whether it has ended;
   - the classes of the player around it (for example YouTube's `#movie_player`);
   - own properties on the element.
3. **React around the player:**
   - component names from inside out;
   - interesting props and state;
   - player objects and video URLs in props.
4. **Known player libraries** by their global: hls.js, Shaka, dash.js, video.js, JW Player, Plyr, Flowplayer, Clappr, Bitmovin, THEOplayer, Fluid Player, MediaElement.js, the YouTube API, mux.js, Radiant, mpegts.js and flv.js; per video.js player its sources, quality levels and plugins; the quality-like menu items per player; and scripts with a player-like name.
5. **Tracks:** per video the captions and audio tracks, with the source they come from (§11.12) and the active track.
6. **Players recognised from the page structure:** per video the player that belongs to the surrounding elements (YouTube, video.js, JW Player, Plyr, Shaka, Flowplayer, Bitmovin, THEOplayer, Radiant, Vimeo, Kaltura, Clappr, Brightcove, MediaElement.js, Fluid Player), also without a global variable.
7. **Gaffer Direct:** whether Direct is active, and per video: whether it has a Direct (or why not: its size, the window size and what is needed), the positions and z-index of the top and bottom bar, the element they live in and the element their z-index comes from, the layers around the bars with their z-index chains (also tooltips and popovers), the quality source with its options and bitrates, the chosen captions and audio track, the state of the bars, what Direct has hidden, what stays as image before the start, and which site elements are still visible above the video. Also per video, as Direct itself sees it (through `__vuInfo`):
   - Direct's version, whether it runs from the extension or the bookmarklet, and whether capture is active;
   - the errors per part since the start (§11.8);
   - live: whether it counts as live and why (`Infinity`, the player's flag or a growing duration), the window that can be played, the delay the player keeps and how far behind live;
   - an ad on YouTube (§11.13);
   - the same level (§11.15): on or off, the number, the reference loudness, whether this video is the reference, its loudness and where it comes from (measured, stated by YouTube or assumed), whether measuring failed, the volume Direct sets and the state of the `AudioContext`;
   - exposure: brightness and contrast;
   - quality, beyond the source: Max on or off, whether the user chose, the options marked unplayable (§11.6), and for a site menu the attempts and whether it was found;
   - chapters: the source and the number, or none;
   - playback: whether the pause is held (§11.5), the spinner, the `readyState`, the seconds buffered ahead, and whether the buffer guard paused;
   - the previous and next buttons of the site or the page order (§11.1), and the share button Direct would use, or the system menu or copying (§11.4).
8. **Global objects** that look like a player.
9. **Iframes:** the source of every iframe. Started from the extension, Inspect also runs in all iframes. An iframe with a video sends its own report to the main window (`postMessage`), and it is added as an "Iframe <url>" block after the report. The bookmarklet only runs in the main window.

**Addresses without their query.** Every address in the report and in the monitor log is shortened to its origin and path, with `?…` for a query that was there. Queries often hold tokens, signatures or session ids, and the report goes into a public issue (§12.5). The same goes for the `URI` in `#EXT-X-KEY` lines, for addresses inside error and console messages, and for addresses in attribute values (the attributes of a clicked element in the monitor, and those of `<source>` elements).
10. **Network:**
   - manifests (m3u8, mpd) and segments or video files, from Resource Timing;
   - resolution hints in segment URLs.
11. **Manifest contents:** a summary of the first three manifests: variants with resolution, bitrate and codecs.
12. **Recording and download** (§12.3).
13. **Errors since the page loaded:** what capture kept (§4.5), with the time since the page loaded. If capture started later (bookmarklet, or Gaffer switched on in an open tab), the section says from which moment. Without capture (Gaffer off on the site) it says that these errors are not known, and that Monitor catches them from now on.
14. **Errors** during the analysis are reported in the report. The report does not stop because of them.

### 12.2 Monitor mode

**Monitor** records what happens after starting and adds it to the report with timestamps. Clicking again stops it.

- **DOM changes:** new or removed elements that look like a menu, button or quality option, with text, attributes and path.
- **Clicks:**
  - the event types that are logged: pointerdown, mousedown, pointerup, mouseup, click, touchstart and touchend;
  - the target of every event;
  - the React handlers (`on*`) of the element and three ancestors;
  - the same event on the same target within 1.5 s is merged into "+ type";
  - events from code get "(from code)".
- **Network:** new manifests and segments. Through intercepted `fetch` and `XMLHttpRequest` manifest contents are also read and summarised.
- **Video:** per video (#0, #1, …) play, pause, ended, emptied, resize (with the new resolution), loadedmetadata, waiting, stalled, seeking, seeked (with the time), ratechange (with the speed) and volumechange (with the volume and mute), and every 250 ms changes in the box on screen and its style, in the classes of the player around it, and in the positions of Direct's bars.

- **Errors and warnings:** every error on the page (`error` on `window`, also a picture, script or media file that fails to load), every promise rejection nobody handles, and every `console.error` and `console.warn`, from the site as well as from Direct, with the message and, when known, the file and line. Inspect wraps `console.error` and `console.warn` while monitoring and passes every call on unchanged.
- **Direct:** what Direct does on each video, in the same timeline: its messages (§11.8), a quality it asks for, errors, the start and end of an ad, a click on a button of the site (mute, share, previous or next), fullscreen on and off, the number of site elements it hides when that changes, and a `play()` of the site that it holds back (§11.5). Direct sends them as a `gaffer:direct` event on the video (`detail.text`), always; nothing listens unless Inspect monitors.

- **Frames.** Started from the extension, Monitor also runs in every frame with a video (an embedded player): the video events, errors and warnings, and what Direct does there, not the DOM, clicks and network. The main window tells the frames to start and stop (`postMessage`; a frame only accepts it from the window directly above it and passes it on to its own frames); every frame with a video sends its lines back, and they go into the same timeline with the frame in front: `[frame player.example.com] #0 …`. A frame that runs Inspect again replaces its earlier listener, and Close removes it, so nothing of Inspect stays in the frames. The bookmarklet only runs in the main window.

On stop or close all observers are removed and `fetch`, `XMLHttpRequest`, `console.error` and `console.warn` are restored, also in the frames.

### 12.3 Recording and download

The report has a section "Recording and download" with the facts someone needs to find out why recording does or does not work:

- the same warning as in Direct (§11.10);
- per video: the kind of source (plain file, `blob:` MediaSource, MediaStream), DRM (`mediaKeys` and the key system), `controlslist` (with a note that `nodownload` only warns), the SourceBuffers that capture sees with their MIME type and whether an init segment is present (or that capture is not active), and the record button of Direct with its label, state and tooltip;
- download links and buttons of the site itself (`<a download>`, links to video files or manifests, buttons with "download" in the text or label);
- the manifests checked: HLS master (variants, audio renditions), HLS media playlist (segments, TS or fMP4, live or VOD), DASH (representations, live or VOD), with the `#EXT-X-KEY` lines or `ContentProtection` when encrypted;
- only in Gaffer (dev) (`__gafferInspect.dev`, §4.5): a ready-made command for `ffmpeg` (`-c copy`) per top-level manifest, with the right `Referer` and `User-Agent`. It is the only place with full addresses, so it never goes into a public issue. With DRM or an encrypted manifest on the page it says "No recording command: <reason>" instead. No `yt-dlp` command. On a blocked site (§11.10.1) the section only says "Recording is not available on this site", without commands, manifests or download links.

### 12.4 Behaviour

- **One-off.** Inspect only runs on request, also on sites where Gaffer is off. The extension starts it in all frames of the tab; only the main window shows the panel. Monitoring starts in the main window and also runs in frames with a video (§12.2).
- **Running again** replaces the existing panel.
- **Working with Direct.** The panel stays clickable while Direct runs (§11.7).
- **Changing nothing.** Inspect changes nothing on the page, except its own panel and the temporary interception while monitoring.

### 12.5 Reporting an issue

- **Report an issue** copies the whole report (with the monitor log, if any) to the clipboard and opens the issue form for Inspect reports on `github.com/henzeb/gaffer` in a new tab (`.github/ISSUE_TEMPLATE/inspect.yml`: what goes wrong, what was expected, the site, the report), with the title "Inspect: <site>" and the site already filled in. The report itself does not go into the address: it is too long for a URL; the report field asks to paste it. The button then says "Copied: paste it into the issue". If copying fails, the report is selected in the panel and the button says to copy it by hand; the issue still opens.
- **Too long for an issue.** GitHub takes at most 65,536 characters in the body of an issue. A report longer than 60,000 characters (room for the description) is not copied but saved as a text file, `gaffer-inspect-<site>-<date>.txt`, and the report field of the form is filled in with the request to attach that file. The button then says "Saved: attach the file to the issue".
- **Warning.** Under the buttons: "The report contains the address of this page and of its streams. Issues on GitHub are public: check the report before you post it."
- **Copy** (only in Gaffer (dev), through `__gafferInspect.dev`) copies the report without opening an issue, for the developer's own use.
- **Bookmarklet page.** The text says to click Report an issue after running it.
- The issue address is built by `src/inspect/issue.js` (pure, unit-tested).

---

## 13. Shared

- **One source per tool.** `src/direct/` and `src/inspect/`, with shared code in `src/shared/` and `src/media/` (§14). Both the bookmarklet and the extension module are built from it.
- **Bookmarklet rules.** The bundled code may not contain `%`, also not in CSS (keyframes only with `from`/`to`) or in strings. Comments are fine in the source, because minify removes them. The build checks this (§7.1).
- **Version.** `__BUILD__` is replaced by the build time (dd-mm-yyyy hh:mm), or by the version for a release (1.3.0), and is visible in panel and report.
- **Modern JavaScript** (ES2022, Chrome 120+), as ES modules. No runtime dependencies and no external scripts. Everything runs in the page context (`MAIN` world).
- **Names in the page.** Element ids (`video-ultimate-*`, `vu-*`, `vu-analyse`), globals (`__vuClose`, `__vuInfo`, `__gafferAuto`, `__gafferInspect`, `__gafferCapture`, `__gafferErrors`) and events (`gaffer:level*`, `gaffer:direct`, `gaffer:recorded`) stay the same, so bookmarklet and extension recognise each other and do not run twice.

### 13.1 Language

All user-facing text is in English: tooltips, messages, buttons and the shortcuts card in Direct, the panel and the report in Inspect, the popup and status messages of the extension, and the bookmarklet pages. No text is written directly in the code; every text comes from a language file.

- **Language file.** `lang/en.json` in the root: flat keys grouped by part (`direct.*`, `inspect.*`, `popup.*`, `manifest.*`, `bookmarklet.*`), with `{name}` placeholders. Example: `"direct.quality.codecFallback": "{label} can't be played by your browser (codec), back to previous"`. Keys are always written out in full in the code, never assembled, so the key check can find them.
- **Plurals.** A text that depends on a count has two keys, `<key>.singular` and `<key>.plural`. The code calls the base key with an `n` parameter (`t("inspect.monitor.count", { n })`); `n === 1` picks `.singular`, anything else `.plural`.
- **Words and symbols.** Every text with words comes from the language file. Numbers, units and symbols on their own (−10, 1.00×, 90°, ⚙, kbps) stay in the code, as do product names (Gaffer, Gaffer Direct, Gaffer Inspect) and the `== ` section markers of the report.
- **Default language.** English is the default and, for now, the only language.
- **Direct and Inspect.** The build bundles the language file into the module, Direct only the `direct.*` keys and Inspect only the `inspect.*` keys. The code calls `t("direct.quality.codecFallback", { label })` from `src/shared/i18n.js`. Report texts in Inspect use the same function. An unknown key returns the key itself.
- **Extension.** The build (`build/lang.js`) generates Chrome's `_locales/<code>/messages.json` from the `manifest.*` and `popup.*` keys (dots become underscores, `{name}` becomes `$name$` with `placeholders` numbered in alphabetical order of the names, a literal `$` becomes `$$`). `manifest.json` gets `default_locale: "en"` and uses `__MSG_…__` for name, description and the action title; Gaffer (dev) uses `manifest.nameDev`. Popup, background and the release sources use `msg(key, params)` from `extension/i18n.js`, which passes the parameters to `chrome.i18n.getMessage` in the same alphabetical order. Texts in `popup.html` are filled in from `data-i18n` (text) and `data-i18n-title` (tooltip) attributes.
- **More languages later.** A new language is a file `lang/<code>.json` with the same keys. A missing key falls back to English. How a language is chosen (browser language or a setting) is decided when the second language is added.
- **Checks.** A unit test (`test/unit/lang.test.js`) checks that every key used in the code (`t("…")`, `msg("…")`, `getMessage("…")`, `data-i18n`, `__MSG_…__` and key strings in the build) exists in `lang/en.json`, that there are no unused keys, that Direct only uses `direct.*` and Inspect only `inspect.*` keys, that plurals come in pairs, that the placeholders of a text match in every language, that the extension keys stay unique for Chrome (which ignores case), and that no text contains `%` or a newline (the bookmarklet check of §7.1 also applies to texts).
- **Patterns are not texts.** Words Direct recognises on sites (such as kwaliteit, vorige, volgende, origineel, bron, afspel) are recognition patterns, not interface texts. They stay in the code, in all languages Direct recognises.

## 14. Code structure

Every responsibility has its own module. A module exports functions or a small object and has no side effects on import. Only a tool's `index.js` starts something.

```
gaffer/
  package.json            scripts: build, dev, release, extension, icons, test, chrome, vendor:hls, vendor:dash
  .github/workflows/      ci.yml (§7.3), release.yml (§7.2)
  .github/ISSUE_TEMPLATE/ inspect.yml: the issue form for Inspect reports (§12.5)
  PRIVACY.md              the privacy policy, linked from the Web Store listing (§7.2)
  docs/
    store-listing.md      the texts for the Chrome Web Store dashboard (§7.2)
    release-checklist.md  the check by hand on real sites before a tag (§7.2)
  lang/
    en.json               all interface texts (§13.1)
  build/
    build.js              esbuild bundles (Direct core per video), bookmarklets, % check
    lang.js               reading language files, _locales for the extension
    sourcemap.js          source position for a % in the bundle
    release.js            the extension zip for the Web Store from a version (§7.2)
    extension.js          shell and modules into dist/extension/ (also the test and dev variants), zip with manifest.json at its root (§7.2)
    dev.js                npm run dev: build Gaffer (dev), watch and send signals (§7.4)
    supervise.js          npm run dev's supervisor: runs dev.js as a child and restarts it when build/ changes
    watch.js              watching a folder for npm run dev
    devserver.js          small WebSocket server for the signals
    icons.js              PNGs from icon.svg (npm run icons, with Chrome for Testing)
  src/
    shared/               used by Direct and Inspect
      dom.js              el(), buttons, top layer (popover)
      osd.js              short messages
      errors.js           safe(), error banner, quiet mode
      storage.js          localStorage with try/catch
      net-hook.js         interception of fetch/XHR, with restore
      address.js          short(): an address without its query, also inside a text (§12.1)
      player-detect.js    recognising player libraries by their global (§12.1), player roots, player-like objects
      globals.js          windowObjects(): the objects on window, kept for 500 ms
      i18n.js             t(key, params) with the bundled language file
      tracks/             captions and audio tracks per player (§11.12): index.js (order), youtube.js, players.js, libraries.js, native.js, common.js
      timing.js           ms(n): a wait time, scaled by the test setting __gafferTiming
      chapters.js         chapters per player (§11.14)
      deep.js             elements in shadow roots: finding videos, parents as drawn, element under a point (§11.1)
      loudness.js         loudness and the volume for a level (§11.15)
      blocked-sites.js    the recording block list (§11.10.1): blockedHost(host), blockedPage(location)
    media/                pure functions, no DOM, unit-testable
      manifest/hls.js     reading m3u8: variants, segments, EXT-X-KEY, EXT-X-MEDIA
      manifest/dash.js    reading mpd: representations, segments, ContentProtection
      mp4/boxes.js        reading and writing MP4 boxes
      mp4/mux.js          muxing tracks into one file (§11.10.2)
      ts/demux.js         TS packets, PAT/PMT, PES; packed audio with the ID3 timestamp
      ts/h264.js  ts/hevc.js  ts/aac.js (AAC, MP3, AC-3, E-AC-3)
      ts/remux.js         TS to fMP4 per track, and the link to the muxer (§11.10.3)
    direct/
      index.js            manager: candidates, a core per video, shared parts, quiet mode, closing (§11.1, §11.9)
      core.js             Direct for one video: start and restore; executed again per video
      info.js             what Direct reports about a video to Inspect (__vuInfo, §12.1)
      tell.js             the gaffer:direct events for Inspect's monitor (§12.2)
      safe.js             the guard around every part, with the errors per part (§11.8)
      host.js             what the core gets from the manager (id, fullscreen, neighbours, close all)
      hls-hook.js         the shared interception of hls.js
      state.js            state (current video, transform, flags)
      video/              pick.js, scan.js, attach.js, stream.js (new source), site-controls.js (hide/restore, known controls, image before the start)
      view/               transform.js (rotate/zoom/pan/flip), light.js (brightness and contrast, §11.3), fullscreen.js, layer.js (the container of the bars, their z-index, top layer in fullscreen)
      playback/           play.js, hold.js (blocking playback by the site, §11.5), sitenav.js (previous/next), seek.js, chapters.js (marks and list, §11.14), glide.js (the seek bar slides), speed.js, volume.js, buffer-guard.js, buffering.js (the spinner's state), share.js (§11.4), live.js, cast.js (§11.11)
      level/              index.js (steering), meter.js (measuring), store.js (the setting) (§11.15)
      input/              routing.js (inUI, overlays), mouse.js, keyboard.js, wheel.js
      ui/                 styles.js, popup.js (sliders for volume and speed), panel.js (⚙ panel), bar.js (bottom bar, placing, idle), cursor.js (the mouse pointer over the video), topbar.js (top bar, §11.2), help.js (shortcuts card), osd.js (Direct's messages), loader.js (the spinner), open.js (what of Direct is open, closing it all), notice.js
      tracks/             index.js (finding, choosing, C), render.js (CC and Audio with their popups in the bottom bar)
      quality/
        index.js          choose the adapter in the order of §11.6
        render.js  max.js  codec-check.js
        labels.js         read a quality from a label, Original, ranking, drop duplicates
        adapters/         common.js, radiant.js, youtube.js, jwplayer.js, videojs.js (also Brightcove), plyr.js, kaltura.js, flowplayer.js, dashjs.js, bitmovin.js, theoplayer.js, clappr.js, portal.js, dom-menu.js, hls.js, shaka.js, vimeo.js, sources.js
      record/
        index.js          button, choosing the method, stopping
        policy.js         recording policy (§11.10.1)
        mse-capture.js    link with the capture module, init segments
        manifests.js      finding and reading the manifests of the page
        manifest-download.js
        file-download.js
        media-recorder.js
        writer.js         showSaveFilePicker and writing to disk
    capture/
      index.js            appendBuffer interception at document_start (§4.5)
      errors.js           the errors of the page from the start (__gafferErrors, §4.5)
    inspect/
      index.js            start, report header, iframe reports
      panel.js            the panel, Monitor, Report an issue, Copy (§12.5)
      issue.js            the address of a new issue (§12.5)
      report/             format.js, videos.js, layout.js (box, player classes and the place of Direct's bars), react.js, players.js, dom-players.js, tracks.js, direct.js, globals.js, iframes.js, frames.js (reports from iframes), network.js, manifests.js, record.js (§12.3)
      monitor/            index.js, describe.js, dom.js, clicks.js, network.js, video.js, errors.js (errors and warnings)
  extension/              the shell, not bundled (§4.1)
    manifest.json  background.js  inject.js  popup.html  popup.js  auto.js  bridge.js  level.js  sites.js  i18n.js (msg, data-i18n)  icons/
    dev/                  Gaffer (dev): inject.js (user scripts), bridge.js, prelude.js, source.js (reading its modules)
  test/
    unit/                 node:test for media/, policy.js, manifest parsers, labels, site rules, language files
    e2e/                  CDP harness (harness.js, server.js, test.js), e2e tests and test pages
    fixtures/             TS and MP4 test files (made with ffmpeg, script in fixtures/make.sh)
  dist/                   generated, not in git
  SPEC.md  README.md  LICENSE  AGENTS.md  CLAUDE.md
```

**Rules**
- **Dependency direction:** `media/` depends on nothing, `shared/` only on `media/`, and a tool (`direct/`, `capture/`, `inspect/`) on `shared/` and `media/`. The tools import nothing from each other. Direct and capture talk through a small shared object on `window` (`__gafferCapture`).
- **Direct's state.** It lives in `direct/state.js`. Modules read and change it there, instead of through global variables.
- **Cleaning up.** Every module that adds listeners, intervals, observers or interceptions registers a cleanup function with the core. Closing (§11.9) calls all of them. That makes full restore checkable per module.
- **Pure functions** (reading manifests, MP4, TS, policy) get unit tests with `node:test`. DOM behaviour is tested with the e2e harness.

**Cleanup order.** Closing calls the cleanup functions in reverse order of registration: first listeners and intervals, then detaching the video, last our own elements.

## 15. Build order

Every phase ends with green tests and a usable version.

1. **Test pages and harness.** Restore the test pages (§9) and the harness. Capture the current behaviour of Direct and Inspect in e2e tests.
2. **Splitting.** Split the code into the structure of §14 and bundle with esbuild. Behaviour stays the same: the phase 1 tests stay green, and the bookmarklets work as before.
3. **Extension and releases.**
   - the shell (§4, §5);
   - quiet mode and full restore (§6), including the `class` on `<html>` and `preload` (§6.1);
   - the icon (§4.7);
   - the release zip (§7.2).
   Creating the repository `henzeb/gaffer` and publishing for the first time only happens after your approval at that moment.
4. **Local development version** (§7.4): `npm run dev` with Gaffer (dev), modules from the working directory, a signal over WebSocket, automatically applying new modules and automatically reloading the shell.
5. **Small planned features.**
   - blocking playback by the site during a pause (§11.5);
   - the codec check for every quality source (§11.6);
   - resetting picture settings on a new URL (§11.1);
   - Original and bitrate for Max (§11.6);
   - the names Gaffer Direct and Gaffer Inspect (§6);
   - the top bar with ⚙, Quality and ⛶ (§11.2);
   - casting (§11.11).
6. **More players.** Adapters for dash.js, Bitmovin, THEOplayer, Plyr, Flowplayer, Clappr, Vimeo, Kaltura and Brightcove (§11.6), each with a test.
7. **English and language files** (§13.1): `lang/en.json`, `t()` in Direct and Inspect, `_locales` and `chrome.i18n` in the extension, all texts in English, the tests on the new texts, and the key check.
8. **Faster tests.** (done) The suite gets faster without testing less:
   - the e2e files run in parallel (`--test-concurrency` above 1); every file already has its own Chrome, profile and port;
   - fixed waits (`sleep`) become `waitFor` on the condition, so a test continues as soon as the state is right;
   - timings that tests wait for (idle 2 s, codec check 2.5 s, retry intervals) can be shortened through a test setting that only the harness sets; the 5 s activation window stays, because it depends on Chrome's own 5 s user activation;
   - the duration per file is reported, so slow tests stand out.
9. **Recording and downloading.** (done)
   - the capture module;
   - the recording policy;
   - the notice before the start;
   - recording through MSE;
   - downloading from the manifest for fMP4;
   - download of a single file;
   - MediaRecorder as fallback;
   - the muxer (§11.10–11.10.2);
   - the buttons and the indicator in the top bar (§11.2, §11.10);
   - the recording command in Inspect (§12.3).
10. **TS converter** (§11.10.3), so downloading also works for HLS with TS chunks. (done)
11. **Tracks and player integration** (§11.12). (done) Captions and audio tracks for every supported player, the speed on YouTube, and the player data in Inspect.
12. **Recording block list** (§11.10.1, §8 decision 12). (done)
    - `src/shared/blocked-sites.js` with tiers 1 and 2, unit-tested (subdomains, `www.`, look-alike hosts such as `notyoutube.com` that must not match);
    - the Blocked site signal in the policy, the hidden button and shortcut in Direct, also for an embedded player of a blocked site;
    - Inspect: no `yt-dlp`, and the short section on a blocked site;
    - e2e: the test setting `__gafferBlockedHosts` blocks the test server's own host, for Direct (plain file and MSE) and for Inspect. The embedded case (frame or ancestor on the list, through `location.ancestorOrigins`) is covered by the unit test.
13. **Ads on YouTube** (§11.13, §8 decision 13). (done, also checked on a real YouTube page with an ad)
    - detection, locked controls, ad elements left alone, settings kept;
    - the ad mode of the YouTube stand-in player and its e2e test.
14. **Chapters** (§11.14). (done)
15. **The same level for every video** (§11.15, §8 decision 14). (done)
16. **Chrome Web Store** (§3, §4, §7.2, §8 decisions 1 and 5). (done)
    - the modules in the package, content scripts per part and `chrome.scripting` instead of user scripts and releases from GitHub Pages;
    - the bridge in every frame starts the frames inside the page;
    - updates through the Web Store, waiting for a recording;
    - Gaffer (dev) keeps its user scripts.
