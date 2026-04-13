# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Athr** (from _aether_ — the theoretical medium through which sound propagates) is a local media player demonstrating that server-driven hypermedia patterns with Datastar morphing can deliver a fluid, SPA-like experience — including persistent audio playback across view changes.

Design doc: `vault/athr/design.md`. Issues with task checklists: `vault/athr/issues/`.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP | Hono |
| Reactivity | Datastar v1.0.0-RC.8 (CDN, no npm) |
| Event store | SQLite (`bun:sqlite`) |
| Projections | SQLite (`bun:sqlite`) |
| Views | HTML template literals (no JSX, no framework) |
| Audio metadata | `music-metadata` |

## Commands

```bash
# Dev server (hot reload)
bun run dev

# Run all tests
bun test

# Run a single test file
bun test src/events/__tests__/store.test.ts

# Lint (oxlint)
bun run lint

# Lint with auto-fix
bun run lint:fix

# Type check
bun run typecheck

# Build self-contained CLI binary
bun run build
```

## Development Workflow

### Working through issues

Issues live in `vault/athr/issues/` (numbered, with task checklists). Work through them in order. After completing each issue:

1. Run `bun test` — all tests must pass
2. Run `bun run typecheck` — no type errors
3. Run `bun run lint` — no lint errors
4. Commit with a message referencing the issue, e.g. `implement event store (issue #001)`

### Test-driven development

Write tests before or alongside implementation. Tests live in a `__tests__/` directory relative to the module under test:

```
src/events/store.ts
src/events/__tests__/store.test.ts

src/projections/playback.ts
src/projections/__tests__/playback.test.ts
```

Use `bun:test` (built-in, no extra imports beyond `import { describe, it, expect } from 'bun:test'`).

For SQLite-dependent tests, create a fresh in-memory database per test: `new Database(':memory:')`.

### Linting

oxlint runs automatically via a PostToolUse hook after every file edit — unfixable errors will surface as a wake notification. Run `bun run lint:fix` manually to batch-fix auto-fixable issues across the whole `src/` tree.

## Planned Source Structure

```
src/
  cli.ts                  # Entry point for `athr` binary (Commander or Bun.argv)
  index.ts                # Hono app setup, middleware, route registration
  events/
    store.ts              # SQLite append-only event store
    bus.ts                # In-process pub/sub (EventBus)
    projections.ts        # Projection engine (apply event → update read model)
  projections/
    session.ts
    playback.ts
    queue.ts
    search.ts
    catalogue.ts
  routes/
    session.ts            # GET /s/:id, GET /
    sse.ts                # GET /s/:id/sse (and popup SSE endpoints)
    playback.ts           # POST /s/:id/play, /playback, /volume
    queue.ts              # POST /s/:id/queue, /queue/reorder
    search.ts             # POST /s/:id/searches, /searches/:sid
    views.ts              # POST /s/:id/view/*
    catalogue.ts          # GET /audio/:trackId, GET /cover/:albumId
  views/
    shell.ts              # Outer HTML document with <nav>, <main>, <div id="player">
    library.ts
    album.ts
    artist.ts
    player-chrome.ts      # Player bar HTML (not the <audio> element)
    search-results.ts
    # popup pages
    settings.ts
    queue-popup.ts
    lyrics.ts
    mini-player.ts
  middleware/
    correlation.ts        # Attaches cor_* ID to every request
  lib/
    ids.ts                # ID generators: sess_, cor_, srch_, etc.
    music-scanner.ts      # Directory scanner + music-metadata extraction
    config.ts             # ~/.config/athr/config.json read/write
```

## Core Architecture

### Single-Document Shell

The page never navigates. `<main id="content">` is morphed via SSE when the user "navigates". The `<audio>` element carries `data-ignore-morph` so Datastar never touches it.

```
┌─ <nav> Library Search Queue Settings(⌘,) ─┐
├─ <main id="content"> (morphed by SSE) ────┤
├─ <div id="player"> ───────────────────────┤
│    <audio id="audio" data-ignore-morph /> │
│    Player chrome (morphed by SSE)         │
└───────────────────────────────────────────┘
```

Nav links send `@post` commands, not `<a href>` navigations. The URL bar is updated with `data-replace-url`.

### Audio Control via Signals

The server cannot touch `<audio>` directly. It pushes Datastar signals; a `data-effect` drives the element:

```html
<div id="player"
     data-signals:_track-url="''"
     data-signals:_is-playing="false"
     data-signals:_seek-to="-1"
     data-effect="
       const audio = document.getElementById('audio');
       if ($_trackUrl && audio.src !== $_trackUrl) {
         audio.src = $_trackUrl;
         audio.currentTime = $_seekTo >= 0 ? $_seekTo / 1000 : 0;
       }
       $_isPlaying ? audio.play() : audio.pause();
     ">
```

Signals prefixed with `_` are local-only (never sent back to the server). The server pushes them via `datastar-patch-signals` SSE events.

### Command → Event → Projection → SSE Pipeline

```
Client @post → Command handler → Event store (append)
                    │                   ↓
                    │           Projection (update)
                    │                   ↓
                    └─ reads    EventBus (publish)
                       projection       ↓
                       to validate  SSE → client (morph)
```

Command handlers validate against current projection state, append an event, update the projection, then publish to the EventBus so SSE connections can push updated HTML.

### Event Store

Append-only SQLite table with optimistic concurrency (`UNIQUE(stream_id, stream_version)`).

All events in one request share the same `correlation_id` (generated by the correlation middleware). Projections are always rebuildable from the event log via `rebuildAll()`.

### Session as Root Resource

```
Session /s/:id
├── Playback  (track_id, position_ms, is_playing, volume)
├── Queue     (ordered track list)
├── View      (current view name + view-specific data)
└── Searches  (sub-resources: /s/:id/searches/:searchId)
```

Search is a server-side resource (not just query params). Each search has its own stream, cached results, and URL — navigating away and back restores from cache.

### Auxiliary Windows (Popups)

Settings (`⌘,`), Queue editor, Lyrics, and Mini-player open as real `window.open()` popups. Each is a full HTML page with its own SSE connection to the **same** session. Commands from any window mutate shared session state; all windows stay in sync via SSE.

### Catalogue (Local-First)

On startup, `music-scanner.ts` walks the configured music directory, reads ID3/Vorbis tags via `music-metadata`, and upserts into `tracks`, `albums`, `artists` tables. IDs are deterministic hashes of file paths (rescans are idempotent). Audio is served from disk at `GET /audio/:trackId` with `Range` header support.

## ID Conventions

| Prefix | Entity |
|---|---|
| `sess_` | Session |
| `cor_` | Correlation ID (per request) |
| `srch_` | Search session |
| `t_` | Track |
| `alb_` | Album |
| `art_` | Artist |

## CLI

```bash
athr serve --dir ~/Music          # Start server + scan library
athr serve --dir ~/Music --port 8080
athr config                        # Print config
athr config set dir ~/Music        # Update config
athr scan                          # Rescan without starting server
```

Config file: `~/.config/athr/config.json`. Priority: CLI flags > config file > defaults.
