# Release checklist

Before a tag (SPEC §7.2). The automated tests use real hls.js and dash.js but stand-in versions of the other players; this checks Gaffer on real sites.

## Prepare

1. CI on `main` is green for the commit that gets the tag.
2. `npm run release -- <version>` and load `dist/extension/` unpacked in a fresh Chrome profile (developer mode), not next to Gaffer (dev).
3. Open the popup: the version is right, every switch is off, the icon is grey.

## Per site

Switch Gaffer on for the site in the popup, with the video already open (the late start), then reload the page (the start with the page). For each:

- [ ] The site's own controls are gone, also after moving the mouse over the player and after the video starts; captions, end screens, ads and the site's own windows stay.
- [ ] Click and space play and pause; ±10, the seek bar and speed work; the spinner shows while it buffers.
- [ ] R, zoom with Ctrl + scroll, dragging and B/N change the picture; 0 resets it.
- [ ] Quality: the list has the player's qualities, a choice changes the picture height, Max picks the highest once.
- [ ] Captions (C) and audio tracks, where the site has them; chapters, where it has them.
- [ ] M mutes through the site (the site's own mute button changes too).
- [ ] Fullscreen (F, double-click) and back with Esc; the page scrolls back to where it was.
- [ ] Record or Download: the button is grey with a reason on a blocked or protected site; elsewhere the file plays.
- [ ] Switching Gaffer off in the popup restores the page: the site's controls are back, nothing of Gaffer is left, the video plays on.
- [ ] Nothing of the site breaks: menus, comments, the next video, logging in.

## Sites

Pick at least one site per kind; prefer sites with a mix of what the list asks for.

- [ ] YouTube, watched on youtube.com and embedded on another site (also an ad; recording is blocked there).
- [ ] A site with JW Player.
- [ ] A site with video.js or Brightcove, preferably with IMA ads.
- [ ] Vimeo, on vimeo.com and embedded.
- [ ] NOS (nos.nl): portrait videos, controls that come back on every mouse-over, a live stream with a rewind window.
- [ ] TikTok: a feed with a new video in the same element, the sound through the site's mute button (recording is blocked there).
- [ ] A site with Mux Player or Media Chrome (a video in a shadow root).
- [ ] A news site with several videos in one article: previous and next, one fullscreen at a time.
- [ ] A site with an age check, a consent screen or a paywall over the video.
- [ ] A site with a plain `<video>` and an MP4 file (Download).

## Also

- [ ] Inspect from the popup on two of these sites: the report appears, addresses have no query, Report opens the GitHub form.
- [ ] The same volume level: switch it on for one video, then a louder and a softer one on other sites.
- [ ] Note every problem as an issue with the Inspect report of that page before the tag.
