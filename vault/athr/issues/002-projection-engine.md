---
title: "Projection Engine"
type: issue
id: ISSUE-002
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[001-event-sourcing-foundation]]"
related:
  - "[[001-event-store]]"
tags:
  - event-sourcing
  - projections
  - sqlite
estimate: small
---

# Projection Engine

Framework for defining projections that fold events into queryable read models.

## Design

Each projection is an object with:
- `init()` — creates its tables
- `apply(event)` — handles an event (updates tables)
- `reset()` — drops/truncates its tables

A central `ProjectionEngine` manages all registered projections and provides `rebuildAll()`.

```typescript
interface Projection {
  name: string;
  init(db: Database): void;
  apply(db: Database, event: StoredEvent): void;
  reset(db: Database): void;
}

class ProjectionEngine {
  register(projection: Projection): void;
  apply(event: StoredEvent): void;     // apply to all registered projections
  rebuildAll(events: StoredEvent[]): void;  // reset all, replay all
}
```

## Projection tables

Initial projections needed:

```sql
-- Session view state
CREATE TABLE session_projections (
  session_id TEXT PRIMARY KEY,
  current_view TEXT NOT NULL DEFAULT 'library',
  current_view_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Playback state
CREATE TABLE playback_projections (
  session_id TEXT PRIMARY KEY,
  track_id TEXT,
  position_ms INTEGER NOT NULL DEFAULT 0,
  is_playing INTEGER NOT NULL DEFAULT 0,
  volume REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL
);

-- Queue
CREATE TABLE queue_projections (
  session_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (session_id, position)
);

-- Search sessions
CREATE TABLE search_projections (
  search_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  filters TEXT NOT NULL DEFAULT '{}',
  page INTEGER NOT NULL DEFAULT 1,
  results TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## Tasks

- [ ] Create `src/events/projections.ts` with Projection interface and ProjectionEngine
- [ ] Implement `rebuildAll()` — truncate + replay
- [ ] Create individual projection files in `src/projections/`
- [ ] Wire into event store so `apply()` is called after every `append()`
