# Gaffer privacy policy

Gaffer is a browser extension with two tools for videos on web pages: Gaffer Direct (controls over a video) and Gaffer Inspect (a report about the players on a page). This policy covers the extension as published in the Chrome Web Store and the bookmarklets built from the same source.

## In short

Gaffer collects nothing and sends nothing to its maker or to anyone else. It has no servers, no analytics, no tracking and no advertising. All code runs in your browser and comes from the extension package; Gaffer loads no code from elsewhere.

## What Gaffer stores, and where

- **Your site choices** (on which sites Gaffer is on or off, and whether it is on by default) are kept in Chrome's extension storage (`chrome.storage.sync`). If you use Chrome sync, Chrome synchronises them between your own browsers through your Google account, like any extension setting.
- **The volume level setting** (on or off, the number you chose and the loudness it refers to) is kept in the extension's local storage (`chrome.storage.local`).
- **Small preferences in the page itself.** On a site where you use Gaffer Direct, it keeps three preferences in that site's `localStorage`: `vu-max` (whether Max picks the highest quality), `vu-rec-ok` (that you chose not to see the recording notice again) and `vu-level` (the level setting, for the bookmarklet). The site can read its own `localStorage`, so it could see these preferences. They contain no personal data.
- **Nothing else.** Gaffer keeps no history of the pages you visit or the videos you watch.

## Network requests

Gaffer only makes network requests when you ask for something, and only to the site you are on:

- **Downloading a video** (Gaffer Direct) fetches the video file, or its manifest and chunks, from the same addresses the site's own player uses, with the site's cookies, as the player would. The file is saved on your computer.
- **Gaffer Inspect** fetches the manifests the page already loaded, to describe them in the report.

Gaffer never sends anything about these requests anywhere.

## Gaffer Inspect reports

Gaffer Inspect builds a report about the page you run it on: the video elements, the players, the manifests, errors on the page and what Gaffer Direct does there. It stays in your browser. Only when you click **Report** is it copied to your clipboard (or saved as a file when it is too long) and a new GitHub issue form is opened, where you paste it yourself. Nothing is sent until you submit that form on GitHub, under GitHub's own terms. Addresses in the report are shortened to their origin and path, without their query, because queries often hold tokens or session ids. The page address and the site name are part of the report; review it before you submit it.

## Permissions

- **Access to all sites** (`<all_urls>`, optional, asked the first time you switch Gaffer on): needed to show the controls on the sites where you switch Gaffer on. On every other site Gaffer does nothing.
- **`scripting`**: to start and stop the controls in open tabs when you switch a site on or off.
- **`storage`**: to keep the settings described above.
- **`activeTab`**: to run Gaffer Inspect on the tab you are looking at.

## Changes

Changes to this policy are made in this file, in the public repository [henzeb/gaffer](https://github.com/henzeb/gaffer), where its history can be seen.

## Contact

Questions about this policy: open an issue at [github.com/henzeb/gaffer/issues](https://github.com/henzeb/gaffer/issues).
