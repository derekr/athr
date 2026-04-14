---
title: "Queue Management"
type: issue
id: ISSUE-014
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
epic: "[[003-playback]]"
related:
  - "[[011-playback-commands]]"
  - "[[020-queue-popup]]"
tags:
  - queue
  - commands
  - events
estimate: medium
---

# Queue Management

The play queue — an ordered list of tracks. Server-owned state, modified by commands, projected into a queryable table.

## Routes

```
POST /s/:id/queue          → { action: "add" | "remove" | "clear", trackId?, position? }
POST /s/:id/queue/reorder  → { trackIds: string[] }
```

## Events

| Event | Payload |
|---|---|
| `TrackQueued` | `{ trackId, position }` |
| `TrackDequeued` | `{ trackId }` |
| `QueueReordered` | `{ trackIds }` |
| `QueueCleared` | `{}` |

## Projection

```sql
CREATE TABLE queue_projections (
  session_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (session_id, position)
);
```

## Auto-advance

When the `<audio>` element fires `ended`, the client POSTs to the server. The server:

1. Reads current queue position
2. If there's a next track, appends `PlaybackStarted` with the next track
3. If queue is exhausted, appends `PlaybackPaused`

## Tasks

- [ ] Queue command handlers
- [ ] Queue event definitions
- [ ] Queue projection (apply add/remove/reorder/clear)
- [ ] Auto-advance logic on track end
- [ ] Queue reading helpers for player (current track, next track)
