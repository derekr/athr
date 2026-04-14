---
title: "Playback & Queue"
type: epic
id: EPIC-003
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
tags:
  - playback
  - audio
  - queue
depends_on:
  - "[[001-event-sourcing-foundation]]"
  - "[[002-session-and-shell]]"
issues:
  - "[[010-catalogue-seed]]"
  - "[[011-playback-commands]]"
  - "[[012-audio-signals]]"
  - "[[013-player-chrome]]"
  - "[[014-queue-management]]"
  - "[[015-progress-view-transition]]"
---

# Playback & Queue

Implement audio playback driven by server-side events. The server owns playback state (current track, position, playing/paused, volume). The client's `<audio>` element is controlled via Datastar signals pushed from the server. The queue is a server-side ordered list of tracks.

## Acceptance Criteria

- Clicking play on a track starts audio playback
- Play, pause, resume, seek commands work via POST
- The `<audio>` element is driven by signals, never directly morphed
- Player chrome (track title, artist, progress bar, controls) updates via SSE morph
- Queue can be viewed, reordered, and modified
- Playback advances to next track in queue automatically
- Progress bar has a `view-transition-name` for smooth animation

## Audio control flow

```
Server: append PlaybackStarted event
     → update playback projection
     → push signals via SSE: { _trackUrl, _isPlaying, _seekTo }
     → push player chrome HTML via SSE morph

Client: data-effect watches signals
     → sets audio.src, calls audio.play()
     → progress bar updates from SSE morph (server tracks position)
```

## Issues

- [[010-catalogue-seed]] — Seed tracks, albums, artists in SQLite
- [[011-playback-commands]] — Play, pause, resume, seek POST handlers
- [[012-audio-signals]] — Signal-driven audio element control
- [[013-player-chrome]] — Player bar HTML (track info, controls, progress)
- [[014-queue-management]] — Queue commands and projection
- [[015-progress-view-transition]] — View transition on progress bar fill
