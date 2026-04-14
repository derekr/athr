---
title: "Datastar Media Player — Design Document"
status: draft
created: 2026-04-11
updated: 2026-04-11
tags:
  - design
  - architecture
  - datastar
  - event-sourcing
---

# Datastar Media Player

A media player application built with Datastar, Hono, and Bun demonstrating that server-driven hypermedia patterns can deliver a fluid, app-like experience — including persistent audio playback across view changes.

## Goals

- Prove that a media player with continuous playback can be built using hypermedia/CQRS patterns
- Use event sourcing with SQLite as the backbone for all state
- Demonstrate that MPA-style server rendering with Datastar morphing can feel as fluid as a SPA
- Explore session-as-resource and search-as-resource patterns
- Use CSS View Transitions for smooth progress bar continuity across view changes

## Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP | Hono |
| Reactivity | Datastar (v1.0.0-RC.8, CDN) |
| Event store | SQLite (bun:sqlite) |
| Projections | SQLite (bun:sqlite) |
| Views | HTML template literals (no JSX) |
| Audio | Native `<audio>` element |

## Core Insight

Audio playback requires a persistent DOM — the `<audio>` element is destroyed on page navigation. Rather than fighting this with iframes or service workers, we embrace a single-document architecture where the server morphs content areas via SSE. The document never navigates. The URL bar updates via `data-replace-url`. The audio element lives outside all morph targets.

Auxiliary views (settings, queue editor, lyrics) open as popup windows — real separate documents that POST commands to the same session. This mirrors native app patterns (Cmd+, opens a preferences window).

---

## Architecture

### Single-document shell

```
┌─────────────────────────────────────────┐
│ <nav>                                   │
│   Library  Search  Queue  Settings(⌘,)  │
├─────────────────────────────────────────┤
│                                         │
│ <main id="content">                     │
│   ┌───────────────────────────────────┐ │
│   │ Morphed by SSE                    │ │
│   │                                   │ │
│   │ Library / Album / Artist / Search │ │
│   │                                   │ │
│   └───────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ <div id="player">                       │
│   <audio data-ignore-morph />           │
│   Track info, progress, controls        │
│   (morphed by SSE, audio element isn't) │
└─────────────────────────────────────────┘
```

- `<main id="content">` — morphed via SSE when "navigating" between views
- `<div id="player">` — player chrome morphs, `<audio>` has `data-ignore-morph`
- `<audio>` — controlled via Datastar signals pushed from server
- Nav links are `@post` commands, not `<a>` hrefs

### Auxiliary windows

```
Main window: /s/:id              ← persistent document, audio lives here
Popup:       /s/:id/settings     ← Cmd+, opens this
Popup:       /s/:id/queue        ← detailed queue editor
Popup:       /s/:id/lyrics       ← follows playback via own SSE
Popup:       /s/:id/mini         ← mini player (transport only)
```

Each popup is a real HTML page with its own SSE connection to the same session. Commands from any window mutate the same session. All windows stay in sync via SSE.

---

## Resource Model

### Session as root resource

The session is the primary resource. Everything hangs off it.

```
Session /s/:id
├── Playback     current track, position, volume, playing/paused
├── Queue        ordered track list, current index
├── View         what's rendered in #content
├── Searches     search sessions (sub-resources)
│   └── Search /s/:id/searches/:searchId
│       ├── query, filters, facets
│       └── cached result set
└── History      view stack for back navigation
```

### Search as a resource

Inspired by ecommerce session patterns. Instead of encoding search state in query params, a search is a server-side resource with its own lifecycle:

```
POST /s/:id/searches         → creates search:srch_xyz
POST /s/:id/searches/:sid    → refines (new query, filters, page)
```

The search resource holds query, filters, pagination, and cached results. Navigating away and coming back loads instantly from the cached resource. Shareable via URL.

---

## Route Structure

### SSE streams (long-lived GET)

```
GET  /s/:id/sse              → main stream (content + player patches)
GET  /s/:id/queue/sse        → queue popup stream
GET  /s/:id/lyrics/sse       → lyrics popup stream
```

### Pages (full HTML, initial load only)

```
GET  /                        → creates session, redirects to /s/:id
GET  /s/:id                   → full shell, pre-rendered current view
GET  /s/:id/settings          → settings popup page
GET  /s/:id/queue             → queue popup page
GET  /s/:id/lyrics            → lyrics popup page
GET  /s/:id/mini              → mini player popup page
```

### Commands (short-lived POST)

```
# View navigation
POST /s/:id/view/library
POST /s/:id/view/album/:albumId
POST /s/:id/view/artist/:artistId

# Playback
POST /s/:id/play              → { trackId, positionMs? }
POST /s/:id/playback          → { action: pause|resume|seek, positionMs? }
POST /s/:id/volume            → { level }

# Queue
POST /s/:id/queue             → { action: add|remove|clear, trackId?, position? }
POST /s/:id/queue/reorder     → { trackIds }

# Search
POST /s/:id/searches          → { query, filters? }
POST /s/:id/searches/:sid     → { query?, filters?, page? }

# Settings
POST /s/:id/settings/update   → { key, value }
```

---

## Event Sourcing

### Event store schema

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

### Event types and payloads

#### Session lifecycle

| Event | Stream | Payload |
|---|---|---|
| `SessionCreated` | `session:{id}` | `{}` |

#### View navigation

| Event | Stream | Payload |
|---|---|---|
| `ViewChanged` | `session:{id}` | `{ view: string, viewData: Record<string, string> }` |

`view` is one of: `library`, `album`, `artist`, `search`, `settings`.
`viewData` holds context: `{ albumId: "123" }` or `{ searchId: "srch_xyz" }`.

#### Playback

| Event | Stream | Payload |
|---|---|---|
| `PlaybackStarted` | `session:{id}` | `{ trackId: string, positionMs: number }` |
| `PlaybackPaused` | `session:{id}` | `{ positionMs: number }` |
| `PlaybackResumed` | `session:{id}` | `{ positionMs: number }` |
| `PlaybackSeeked` | `session:{id}` | `{ positionMs: number }` |
| `VolumeChanged` | `session:{id}` | `{ level: number }` |

#### Queue

| Event | Stream | Payload |
|---|---|---|
| `TrackQueued` | `session:{id}` | `{ trackId: string, position: number }` |
| `TrackDequeued` | `session:{id}` | `{ trackId: string }` |
| `QueueReordered` | `session:{id}` | `{ trackIds: string[] }` |
| `QueueCleared` | `session:{id}` | `{}` |

#### Search (sub-resource streams)

| Event | Stream | Payload |
|---|---|---|
| `SearchCreated` | `search:{id}` | `{ sessionId: string, query: string, filters: Record<string, string> }` |
| `SearchRefined` | `search:{id}` | `{ query?: string, filters?: Record<string, string> }` |
| `SearchPageChanged` | `search:{id}` | `{ page: number }` |

#### Settings

| Event | Stream | Payload |
|---|---|---|
| `SettingsUpdated` | `session:{id}` | `{ key: string, value: any }` |

### Correlation IDs

Every HTTP request generates a correlation ID (e.g. `cor_a1b2c3`). All events produced by that request share the same correlation ID. This lets you trace "user clicked play → which events resulted?"

```typescript
// Middleware generates correlation ID per request
app.use('*', async (c, next) => {
  c.set('correlationId', `cor_${crypto.randomUUID().slice(0, 8)}`);
  await next();
});
```

### Projection tables

```sql
-- Current session state
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

-- Queue state
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

### Projection rebuild

```typescript
function rebuildAll(events: Event[]) {
  db.run("DELETE FROM session_projections");
  db.run("DELETE FROM playback_projections");
  db.run("DELETE FROM queue_projections");
  db.run("DELETE FROM search_projections");

  for (const event of events) {
    applyToProjection(event);
  }
}
```

Projections are always rebuildable from the event log. During development, change a projection schema → call `rebuildAll()` → done.

---

## Data Flow

### Command → Event → Projection → SSE

```
┌────────┐     ┌─────────┐     ┌─────────────┐     ┌────────────┐     ┌─────┐
│ Client │────▶│ Command │────▶│ Event Store │────▶│ Projection │────▶│ SSE │
│ @post  │     │ Handler │     │ (append)    │     │ (update)   │     │     │
└────────┘     └─────────┘     └─────────────┘     └────────────┘     └──┬──┘
                    │                                                     │
                    │           validate against                          │
                    └──────────── projection ◀────────────────────────────┘
                                 (read model)              push to client
```

1. Client sends `@post('/s/:id/play')` with `{trackId: "t_123"}`
2. Command handler reads current playback projection to validate
3. Appends `PlaybackStarted` event to event store
4. Updates playback projection
5. In-process pub/sub notifies SSE subscribers
6. SSE connection pushes updated player HTML to client

### Audio control via signals

The server can't touch the `<audio>` element directly. Instead:

```
Server pushes signals ──▶ Datastar updates signals ──▶ data-effect drives <audio>
```

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
  <audio id="audio" data-ignore-morph></audio>
  <!-- player chrome here, morphed by SSE -->
</div>
```

Signals prefixed with `_` are local (not sent to server with requests). The server pushes signal updates via `datastar-patch-signals` events. `data-effect` runs whenever referenced signals change.

---

## View Transitions

CSS View Transitions API is enabled for the morph-driven "navigations":

```css
@view-transition { navigation: auto; }

/* Disable default crossfade */
::view-transition-old(root),
::view-transition-new(root) { animation: none; }
```

The only named view transition is on the playback progress bar, so it smoothly interpolates when the server pushes an updated position.

---

## Catalogue / Library Data

Local-first: the app scans a user-configured directory of audio files on startup.

```sql
CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  album_id TEXT NOT NULL,
  track_number INTEGER,
  duration_ms INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  format TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  cover_path TEXT,
  year INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The app scans a local music folder, extracts metadata (ID3/Vorbis tags via `music-metadata`), and indexes into these tables. Audio is served directly from disk via `GET /audio/:trackId` with Range header support for seeking.

---

## CLI

Single binary built with `bun build --compile`. Named **athr** (from aether — the theoretical medium through which sound and light propagate).

### Usage

```bash
# Start the server, scan ~/Music for audio files
athr serve --dir ~/Music

# Start on a custom port
athr serve --dir ~/Music --port 8080

# Future subcommands
athr config                    # print current config
athr config set dir ~/Music    # update config
athr scan                      # rescan library without starting server
```

### Configuration priority

1. CLI flags (highest priority)
2. Config file: `~/.config/athr/config.json`
3. Settings popup: writes to config file, triggers rescan

```json
{
  "dir": "/Users/drk/Music",
  "port": 3000
}
```

### Build

```bash
bun build --compile src/cli.ts --outfile athr
```

Produces a single self-contained binary — no Bun installation needed to run.

### Settings popup ↔ config file

When the music directory is changed via the settings popup:

```
POST /s/:id/settings/update { key: "dir", value: "/new/path" }
  → append SettingsUpdated event
  → write to ~/.config/athr/config.json
  → trigger library rescan
  → SSE pushes updated library view
```

---

## Open Questions

- **Popstate handling**: Datastar has `data-replace-url` but no built-in popstate listener. Need a `data-on:popstate__window` handler that sends the URL path to the server to re-morph the content area. How does this interact with the view history stored in events?
- **Audio position sync**: The client tracks real playback position. How often should it POST position updates to the server? Every 5s? Only on pause/seek? This affects how accurate the position is when the server renders the player on initial load or for other connected windows.
- **Session lifetime**: How long does a session live? Should it survive server restarts (persistent SQLite file) or be ephemeral? For the POC, persistent file is easy and lets you restart the server without losing state.
- **Multiple tabs**: If two tabs open the same session, should playback transfer? Or should each tab get its own session? Spotify transfers; that's more interesting to demonstrate.
