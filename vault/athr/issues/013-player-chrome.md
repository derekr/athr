---
title: "Player Chrome"
type: issue
id: ISSUE-013
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[003-playback]]"
related:
  - "[[012-audio-signals]]"
  - "[[015-progress-view-transition]]"
tags:
  - player
  - ui
  - html
estimate: medium
---

# Player Chrome

The visual player bar — track info, transport controls, progress bar, volume. Morphed by SSE on playback events. The `<audio>` element itself is never morphed.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ ▶/❚❚  Track Title — Artist Name    ───●──────── 1:23/4:56 │
│        Album Name                   🔊 ████░░░░          │
└──────────────────────────────────────────────────────────┘
```

## HTML structure

```html
<div id="player-chrome">
  <div class="player-transport">
    <button data-on:click="@post('/s/:id/playback', ...)">
      <!-- play/pause icon based on projection state -->
    </button>
    <button data-on:click="..."><!-- prev --></button>
    <button data-on:click="..."><!-- next --></button>
  </div>

  <div class="player-track-info">
    <span class="track-title">Track Title</span>
    <span class="track-artist">Artist Name</span>
  </div>

  <div class="player-progress">
    <span class="time-current">1:23</span>
    <div class="progress-track">
      <div class="progress-fill"
           style="width: 32%; view-transition-name: playback-progress;">
      </div>
    </div>
    <span class="time-total">4:56</span>
  </div>

  <div class="player-volume">
    <input type="range" min="0" max="100"
           data-on:input__throttle.500ms="@post('/s/:id/volume', ...)" />
  </div>
</div>
```

## Server rendering

The player chrome is rendered from the playback projection + catalogue data:

```typescript
function renderPlayerChrome(sessionId: string): string {
  const playback = getPlaybackProjection(sessionId);
  if (!playback.trackId) return renderEmptyPlayer();

  const track = getTrack(playback.trackId);
  const artist = getArtist(track.artistId);
  const album = getAlbum(track.albumId);
  const progress = estimateProgress(playback);

  return `...`;
}
```

## Tasks

- [ ] `renderPlayerChrome()` template function
- [ ] Empty state (no track loaded)
- [ ] Transport controls (play/pause, prev, next)
- [ ] Track info display
- [ ] Progress bar with time display
- [ ] Volume slider
- [ ] CSS styling
