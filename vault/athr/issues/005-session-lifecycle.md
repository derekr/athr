---
title: "Session Lifecycle"
type: issue
id: ISSUE-005
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[002-session-and-shell]]"
related:
  - "[[001-event-store]]"
  - "[[006-app-shell]]"
tags:
  - session
  - lifecycle
estimate: small
---

# Session Lifecycle

Create and load sessions. A session is the root resource for the entire app experience.

## Flow

```
GET / → generate session ID → append SessionCreated → redirect to /s/:id
GET /s/:id → load session projection → render shell with current view
```

## Session ID format

`sess_` prefix + 12 chars from UUID: `sess_a1b2c3d4e5f6`

## Event

```typescript
{
  type: "SessionCreated",
  stream: "session:sess_a1b2c3d4e5f6",
  data: {}
}
```

## Projection

```sql
INSERT INTO session_projections (session_id, current_view, current_view_data, created_at, updated_at)
VALUES (?, 'library', '{}', datetime('now'), datetime('now'));

INSERT INTO playback_projections (session_id, position_ms, is_playing, volume, updated_at)
VALUES (?, 0, 0, 1.0, datetime('now'));
```

## Edge cases

- Session not found → redirect to `/` to create a new one
- Expired/stale sessions → not needed for POC, but the event log enables replay if needed

## Tasks

- [ ] `GET /` handler — create session, redirect
- [ ] `GET /s/:id` handler — load session, render shell
- [ ] SessionCreated event type definition
- [ ] Session projection (apply SessionCreated)
- [ ] Playback projection initialized on session create
