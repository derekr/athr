---
title: "Signal-Driven Audio Control"
type: issue
id: ISSUE-012
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[003-playback]]"
related:
  - "[[011-playback-commands]]"
  - "[[006-app-shell]]"
tags:
  - audio
  - signals
  - datastar
estimate: medium
---

# Signal-Driven Audio Control

The `<audio>` element can't be morphed (it would restart playback). Instead, the server pushes Datastar signals that a `data-effect` expression watches and uses to control the audio element.

## Signals

All prefixed with `_` (local — not sent to server):

| Signal | Type | Purpose |
|---|---|---|
| `_trackUrl` | `string` | Audio source URL (`/audio/:trackId`) |
| `_isPlaying` | `boolean` | Play or pause |
| `_seekTo` | `number` | Seek to this position in ms (-1 = no seek) |
| `_volume` | `number` | Volume level 0.0-1.0 |

## data-effect

```html
<div id="player"
     data-signals:_track-url="''"
     data-signals:_is-playing="false"
     data-signals:_seek-to="-1"
     data-signals:_volume="1.0"
     data-effect="
       const audio = document.getElementById('audio');
       if (!audio) return;

       // Track change
       if ($_trackUrl && audio.src !== $_trackUrl) {
         audio.src = $_trackUrl;
         if ($_seekTo >= 0) audio.currentTime = $_seekTo / 1000;
       }

       // Play/pause
       if ($_isPlaying && audio.paused) audio.play();
       if (!$_isPlaying && !audio.paused) audio.pause();

       // Volume
       audio.volume = $_volume;

       // One-shot seek (reset after applying)
       if ($_seekTo >= 0) {
         audio.currentTime = $_seekTo / 1000;
         $_seekTo = -1;
       }
     ">
```

## Server pushes signals via SSE

After a `PlaybackStarted` event:

```
event: datastar-patch-signals
data: signals {"_trackUrl":"/audio/t_abc","_isPlaying":true,"_seekTo":0}
```

After a `PlaybackPaused` event:

```
event: datastar-patch-signals
data: signals {"_isPlaying":false}
```

## Client → Server position reporting

The audio element fires `timeupdate` events. A throttled handler reports position back:

```html
<audio id="audio"
       data-ignore-morph
       data-on:timeupdate__throttle.10s="@post('/s/:id/playback', {
         filterSignals: { exclude: /.*/ }
       })"
       data-on:ended="@post('/s/:id/playback', { ... })">
</audio>
```

The `ended` event triggers advance to next track in queue.

## Open questions

- Can `data-effect` reliably drive audio play/pause? `audio.play()` returns a Promise and browsers may reject it without user gesture. The initial play must come from a user click.
- `timeupdate` fires ~4x/sec — throttle to avoid flooding. 10s interval for position sync seems right.

## Tasks

- [ ] Signal declarations in shell template
- [ ] data-effect expression for audio control
- [ ] Signal push in SSE event handlers
- [ ] Position reporting via timeupdate
- [ ] Track ended → next track handler
