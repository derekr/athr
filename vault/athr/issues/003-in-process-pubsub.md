---
title: "In-Process Pub/Sub (EventBus)"
type: issue
id: ISSUE-003
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[001-event-sourcing-foundation]]"
related:
  - "[[001-event-store]]"
  - "[[007-sse-stream]]"
tags:
  - event-sourcing
  - pubsub
  - sse
estimate: small
---

# In-Process Pub/Sub (EventBus)

A simple in-process event bus that notifies SSE connections when new events are appended to the store. This is the bridge between "event was persisted" and "client sees the update."

## Design

```typescript
type Listener = (event: StoredEvent) => void;

class EventBus {
  // Subscribe to all events
  subscribe(listener: Listener): () => void;  // returns unsubscribe fn

  // Subscribe to events for a specific stream
  subscribeStream(streamId: string, listener: Listener): () => void;

  // Publish (called by event store after append)
  publish(event: StoredEvent): void;
}
```

## Usage with SSE

```typescript
app.get("/s/:id/sse", (c) => {
  const sessionId = c.req.param("id");

  return sseStream(async (writer, signal) => {
    const unsub = eventBus.subscribeStream(
      `session:${sessionId}`,
      (event) => {
        // Re-read projections, push updated HTML
        const html = renderCurrentView(sessionId);
        writer.patchElements(html, { selector: "#content", mode: "inner" });
      }
    );

    signal.addEventListener("abort", unsub);

    // Keep alive until client disconnects
    await new Promise((resolve) => signal.addEventListener("abort", resolve));
  }, c.req.raw);
});
```

## Why not just poll projections?

Polling works (the upload demo does it) but wastes cycles when nothing changed. The event bus gives us push semantics: SSE connections sleep until an event arrives, then wake up and push. Much more efficient and lower latency.

## Tasks

- [ ] Create `src/events/bus.ts` with EventBus class
- [ ] Wire into event store `append()` — publish after successful append
- [ ] Support both global and stream-scoped subscriptions
- [ ] Ensure unsubscribe cleans up properly (no memory leaks on SSE disconnect)
