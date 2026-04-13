---
name: datastar
description: Use when implementing Datastar SSE handlers, HTML view templates, signal patterns, or any frontend/backend Datastar integration in athr.
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Datastar Agent

You are implementing Datastar backend-driven UI for the athr media player. Before writing any handler or view, read `.claude/datastar/frontend.md` (attribute syntax, signals, event modifiers) and `.claude/datastar/typescript.md` (Bun SSE handler patterns).

## Core Philosophy (Datastar Tao)

1. **Backend is source of truth.** Keep state in SQLite projections, not frontend signals.
2. **Morph first.** Prefer `patchElements` with full HTML over fine-grained signal management.
3. **Signals are for interactions.** Use signals for user input, transient UI state (loading, hover), and local-only values (prefixed `_`). Never duplicate backend state in signals.
4. **SSE streams 0–n events.** A single POST can emit multiple `patchElements` and `patchSignals` events sequentially.
5. **CQRS.** Short-lived POSTs for commands; long-lived GET SSE streams for queries/push.
6. **No optimistic updates** unless explicitly required.

## Bun + Hono SSE Pattern

This project uses Hono on Bun. The Datastar SDK web runtime applies:

```ts
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web"

// In a Hono route handler:
app.post("/s/:id/play", async (c) => {
  // 1. Read signals
  const reader = await ServerSentEventGenerator.readSignals(c.req.raw)
  if (!reader.success) return c.text(reader.error ?? "Bad signals", 400)

  const signals = reader.signals as { trackId?: string }

  // 2. Validate, append event, update projection (see Command → Event → Projection pipeline)

  // 3. Stream SSE response
  return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
    stream.patchSignals(JSON.stringify({ _isPlaying: true, _trackUrl: `/audio/${signals.trackId}` }))
    stream.patchElements(`<div id="player-chrome">...updated player html...</div>`)
  })
})
```

## Audio Control Convention

The `<audio>` element is never morphed. Control it via local signals (`_` prefix):
- `$_trackUrl` — current track src
- `$_isPlaying` — play/pause state
- `$_seekTo` — seek position in ms (-1 = no seek)

Push these via `patchSignals` from SSE handlers. A `data-effect` on `#player` drives the actual `<audio>` element.

## SSE Stream (Long-lived GET)

For `/s/:id/sse`, use Hono's streaming response and an EventBus subscription — do not use `ServerSentEventGenerator.stream` (that's for short-lived POSTs). Write raw SSE format:

```ts
import { stream } from "hono/streaming"

app.get("/s/:id/sse", (c) => {
  return stream(c, async (s) => {
    // subscribe to EventBus for this session
    // write "event: datastar-patch-elements\ndata: ...\n\n" on each event
  })
})
```

## Element IDs

Every patchable element needs a stable `id`. Follow these conventions:
- `#content` — main view area
- `#player-chrome` — player bar (not the `<audio>` element)
- `#queue-list` — queue popup list
- `#search-results` — search result area

## Signal Naming

Use `camelCase`. Underscore-prefix for local-only: `$_seekTo`, `$_isPlaying`. Dot-notation for grouping: `$form.query`.
