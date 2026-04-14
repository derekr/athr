---
title: "Main SSE Stream"
type: issue
id: ISSUE-007
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[002-session-and-shell]]"
related:
  - "[[003-in-process-pubsub]]"
  - "[[006-app-shell]]"
  - "[[008-view-navigation]]"
tags:
  - sse
  - datastar
  - streaming
estimate: medium
---

# Main SSE Stream

The long-lived SSE connection that drives all UI updates in the main window.

## Endpoint

```
GET /s/:id/sse → text/event-stream
```

## Behavior

1. On connect, push the current state (content + player chrome) immediately
2. Subscribe to the session's event stream via EventBus
3. When events arrive, re-read relevant projections and push patches
4. Stay alive until client disconnects (Bun `idleTimeout: 0`)

## Patch targets

| Target | Selector | Mode | When |
|---|---|---|---|
| Content area | `#content` | `inner` | ViewChanged events |
| Player chrome | `#player-chrome` | `inner` | Playback events |
| Playback signals | — | `patch-signals` | PlaybackStarted, Paused, Resumed, Seeked |
| Nav active state | `#nav` | `inner` | ViewChanged events |

## Event → Patch mapping

```typescript
function handleEvent(event: StoredEvent, writer: SSEWriter, sessionId: string) {
  switch (event.eventType) {
    case "ViewChanged":
      const view = renderView(sessionId);  // read projection, render HTML
      writer.patchElements(view, { selector: "#content", mode: "inner" });
      break;

    case "PlaybackStarted":
    case "PlaybackPaused":
    case "PlaybackResumed":
    case "PlaybackSeeked":
      const player = renderPlayerChrome(sessionId);
      writer.patchElements(player, { selector: "#player-chrome", mode: "inner" });
      writer.patchSignals(getPlaybackSignals(sessionId));
      break;

    case "TrackQueued":
    case "TrackDequeued":
    case "QueueReordered":
      // Only push to queue popup SSE, not main stream
      break;
  }
}
```

## Tasks

- [ ] `GET /s/:id/sse` handler with sseStream helper
- [ ] Subscribe to `session:{id}` via EventBus
- [ ] Push initial state on connect
- [ ] Map event types to patch targets
- [ ] Handle client disconnect (unsubscribe from EventBus)
