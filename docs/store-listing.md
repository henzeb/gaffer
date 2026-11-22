# Chrome Web Store listing

The texts for the developer dashboard of the Chrome Web Store (SPEC §7.2). Copy them into the dashboard for each submission; change them here first.

## Name

Gaffer

## Summary (at most 132 characters)

Your own controls for any video on the web: rotate, zoom, speed, quality, captions, the same volume everywhere, and more.

## Category

Tools

## Description

Gaffer lays its own controls over the videos on the sites where you switch it on, and takes over from the site's player. It works with the player, not with the website, so it works on any site with a known player or a plain video.

**Gaffer Direct, for every video**
- Rotate, flip, zoom towards the mouse and pan; brightness and contrast.
- Speed from 0.25× to 10×, in fine steps, with or without keeping the pitch.
- Quality: the list of the player, and Max to always start at the highest quality.
- Captions and audio tracks of the player; chapters as marks on the seek bar.
- Live streams: a LIVE button, how far you are behind, and a pause that stays a pause.
- The same volume level for every video, measured as it plays.
- Fullscreen, previous and next, share, and casting to a TV where the video allows it.
- Recording or downloading the video you watch, where that is allowed: not on streaming services, social media, music services or paid course sites, and never for protected (DRM) or encrypted streams. Gaffer asks you to respect the site's terms and copyright first.
- Keyboard shortcuts, shown with ? in the panel.

**Gaffer Inspect**
A report about the videos, players and streams on a page, for a bug report on GitHub when Gaffer does not work well on a site. You see the report first; nothing is sent unless you submit it yourself.

**Your choice per site**
Gaffer is off everywhere until you switch it on for a site with the switch in the popup, or for all sites at once. Switching it off restores the page exactly.

**Privacy**
Gaffer collects nothing and sends nothing. No servers, no analytics, no code from elsewhere. See the privacy policy.

## Single purpose

Controls and analysis for videos on web pages: Gaffer shows its own controls over the videos of the sites where the user switches it on, and can report how the players on a page work.

## Permission justifications

- **Host permission `<all_urls>` (optional):** Gaffer shows its controls on the sites the user switches it on for, which can be any site with a video. It is asked once, the first time the user switches Gaffer on; every site stays off until the user switches it on.
- **`scripting`:** to start Gaffer's controls in the open tabs of a site when the user switches it on, and to remove them again when the user switches it off, without reloading the page.
- **`storage`:** to keep the user's choices: on which sites Gaffer is on, and the volume level setting.
- **`activeTab`:** to run Gaffer Inspect on the tab the user is looking at when they click Inspect in the popup.

## Remote code

No. All code is in the package; Gaffer loads and runs no code from elsewhere.

## Data usage

Gaffer collects none of the listed kinds of data. Tick none of them, and confirm the three statements (no sale, no use unrelated to the single purpose, no use for creditworthiness).

## Privacy policy

https://github.com/henzeb/gaffer/blob/main/PRIVACY.md

## Screenshots (1280×800)

1. A video with Gaffer's bars: bottom bar with the seek bar and chapter marks, top bar with quality and the ⚙ panel open.
2. A rotated and zoomed video, with the exposure sliders in the panel.
3. The quality list open, with Max picking the highest quality.
4. A live stream with the LIVE button and how far behind.
5. The popup with the switch for the site and "On by default on all sites".
6. Gaffer Inspect with its report.
