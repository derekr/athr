---
title: "SQLite Event Store"
type: issue
id: ISSUE-001
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[001-event-sourcing-foundation]]"
related:
  - "[[002-projection-engine]]"
  - "[[003-in-process-pubsub]]"
tags:
  - event-sourcing
  - sqlite
  - infrastructure
estimate: small
---

# SQLite Event Store

Implement the append-only event store on top of bun:sqlite.

## Schema

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id TEXT NOT NULL,
  stream_version INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  data TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  correlation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(stream_id, stream_version)
);

CREATE INDEX idx_events_stream ON events(stream_id, stream_version);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_correlation ON events(correlation_id);
```

## API

```typescript
interface EventStore {
  // Append events to a stream. Throws if expectedVersion doesn't match.
  append(
    streamId: string,
    events: { type: string; data: Record<string, unknown> }[],
    expectedVersion: number,
    correlationId?: string
  ): AppendedEvent[];

  // Read all events for a stream, optionally from a version.
  getStream(streamId: string, fromVersion?: number): StoredEvent[];

  // Read all events globally, ordered by id. For projection rebuilds.
  getAllEvents(afterId?: number): StoredEvent[];
}

interface StoredEvent {
  id: number;
  streamId: string;
  streamVersion: number;
  eventType: string;
  data: Record<string, unknown>;
  schemaVersion: number;
  correlationId: string | null;
  createdAt: string;
}
```

## Concurrency

The `UNIQUE(stream_id, stream_version)` constraint provides optimistic concurrency. If two commands simultaneously read version 3 and both try to append version 4, one succeeds and the other gets a constraint violation. The failing command should retry with fresh state.

## Tasks

- [ ] Create `src/events/store.ts` with EventStore class
- [ ] Initialize DB schema on startup
- [ ] Implement `append()` with version check
- [ ] Implement `getStream()` and `getAllEvents()`
- [ ] Write tests for concurrency conflict
