---
title: "Queue Editor Popup"
type: issue
id: ISSUE-020
status: done
priority: low
created: 2026-04-11
updated: 2026-04-13
epic: "[[005-auxiliary-windows]]"
related:
  - "[[014-queue-management]]"
tags:
  - popup
  - queue
  - auxiliary
estimate: small
---

# Queue Editor Popup

A popup window for detailed queue management. Has its own SSE connection so it stays in sync with playback changes.

## Opening

```html
<button data-on:click="window.open(
  '/s/${sessionId}/queue',
  'queue',
  'width=400,height=600'
)">Queue</button>
```

## Page

`GET /s/:id/queue` — full HTML page with:

- Current track highlighted
- Drag-to-reorder (or up/down buttons for simplicity)
- Remove track buttons
- Clear queue button
- Own SSE via `data-init="@get('/s/:id/queue/sse')"`

## SSE stream

`GET /s/:id/queue/sse` — subscribes to session events, pushes queue updates:

- `TrackQueued` / `TrackDequeued` / `QueueReordered` / `QueueCleared` → re-render queue list
- `PlaybackStarted` → update current track highlight

## Tasks

- [ ] `GET /s/:id/queue` route and template
- [ ] `GET /s/:id/queue/sse` stream
- [ ] Queue list with current track highlight
- [ ] Reorder and remove controls
- [ ] Clear queue button
