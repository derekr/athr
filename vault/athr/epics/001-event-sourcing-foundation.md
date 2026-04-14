---
title: "Event Sourcing Foundation"
type: epic
id: EPIC-001
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
tags:
  - event-sourcing
  - infrastructure
  - sqlite
issues:
  - "[[001-event-store]]"
  - "[[002-projection-engine]]"
  - "[[003-in-process-pubsub]]"
  - "[[004-correlation-ids]]"
---

# Event Sourcing Foundation

Build the event sourcing infrastructure that all features depend on: an append-only event store in SQLite, a projection engine that derives read models from events, in-process pub/sub for notifying SSE connections, and correlation ID middleware.

## Acceptance Criteria

- Events can be appended with optimistic concurrency (version conflict fails cleanly)
- Streams can be replayed from any version
- Projections can be rebuilt from scratch by replaying all events
- In-process subscribers are notified when new events are appended
- Every HTTP request gets a correlation ID attached to its events
- Event store schema includes `schema_version` for future-proofing

## Dependencies

None — this is the foundation.

## Issues

- [[001-event-store]] — SQLite event store with append, replay, concurrency
- [[002-projection-engine]] — Projection apply/rebuild framework
- [[003-in-process-pubsub]] — EventBus for notifying SSE connections
- [[004-correlation-ids]] — Hono middleware for correlation IDs
