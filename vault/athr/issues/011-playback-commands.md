---
title: "Playback Commands"
type: issue
id: ISSUE-011
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[003-playback]]"
related:
  - "[[012-audio-signals]]"
  - "[[013-player-chrome]]"
  - "[[014-queue-management]]"
tags:
  - playback
  - commands
  - events
estimate: medium
---

# Playback Commands

POST handlers for controlling playback. Each command validates against current state, appends events, and the SSE stream pushes signal + UI updates.

## Routes

```
POST /s/:id/play       → { trackId, positionMs? }
POST /s/:id/playback   → { action: "pause" | "resume" | "seek", positionMs? }
POST /s/:id/volume     → { level: 0.0 - 1.0 }
```

## Events

| Command | Event | Payload |
|---|---|---|
| play | `PlaybackStarted` | `{ trackId, positionMs }` |
| pause | `PlaybackPaused` | `{ positionMs }` |
| resume | `PlaybackResumed` | `{ positionMs }` |
| seek | `PlaybackSeeked` | `{ positionMs }` |
| volume | `VolumeChanged` | `{ level }` |

## Validation

- `play`: Track must exist in catalogue. If already playing same track, no-op.
- `pause`: Must be currently playing. If already paused, no-op.
- `resume`: Must be currently paused. If already playing, no-op.
- `seek`: Must have a current track.

## Position tracking

The server doesn't track real-time position — it records the position at the time of each event. The client reports position via periodic POSTs (e.g., every 10s) or on pause/seek. The projection stores the last known position.

For rendering the progress bar: the projection stores `positionMs` + `updatedAt`. The server can estimate current position as `positionMs + (now - updatedAt)` if `isPlaying`.

## Tasks

- [ ] POST handlers for play, pause, resume, seek, volume
- [ ] Event type definitions
- [ ] Playback projection apply functions
- [ ] Validation logic (idempotent — no-op if already in desired state)
- [ ] Position estimation for progress bar rendering
