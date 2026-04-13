# athr

A local music player that proves you don't need a SPA framework to build rich, interactive media experiences with continuous playback.

**athr** (from _aether_ -- the theoretical medium through which sound propagates) demonstrates that server-driven hypermedia patterns with [Datastar](https://data-star.dev/) morphing, CQRS, and event sourcing can deliver a fluid, app-like experience -- including persistent audio playback across view changes, multi-window sync, and browser media controls.

No client-side routing. No virtual DOM. No framework. The server is the source of truth.

## The Core Insight

Audio playback requires a persistent DOM -- the `<audio>` element is destroyed on full page navigation. Rather than fighting this with iframes or service workers, athr uses a single-document architecture where the server morphs content areas via SSE. The document never navigates. The URL bar updates via `history.pushState` pushed from the server. The audio element lives outside all morph targets.

```
+-------------------------------------------+
| <nav> Library Search Queue Settings Mini  |
+-------------------------------------------+
|                                           |
| <main id="content">                      |
|   Morphed by SSE -- Library / Album /     |
|   Artist / Search views swap in here      |
|                                           |
+-------------------------------------------+
| <div id="player">                         |
|   <audio data-ignore-morph />             |
|   Track info, progress, controls          |
|   (player chrome morphed, audio isn't)    |
+-------------------------------------------+
```

Auxiliary views (settings, queue editor, mini player, event stream) open as **popup windows** -- real separate HTML pages with their own SSE connections to the same session. Commands from any window mutate shared state; all windows stay in sync. This mirrors native app patterns where Cmd+, opens a preferences window.

## What This Demonstrates

- **Hypermedia / HATEOAS**: HTML as the engine of application state. The server pushes HTML patches, not JSON for the client to render.
- **No client-side routing**: The server tells the browser what the URL should be via `executeScript(history.pushState(...))`. Browser back/forward triggers a `popstate` handler that POSTs to the server to resolve the view.
- **CQRS**: Commands (POST) and queries (GET/SSE) are strictly separated. Commands are short-lived, append events, return 204. Queries are long-lived SSE streams that push HTML patches.
- **Event sourcing**: All state changes are immutable domain events in an append-only SQLite table. Projections (read models) are rebuildable from the event log.
- **Multi-window sync**: Queue, mini player, and event stream popups all share the same session via independent SSE connections. Play a track in one window, see it update everywhere.
- **Browser integration**: Media Session API provides OS-level media controls (play/pause/next/prev/seek) with track metadata and album art.

## Concepts

### The session is the resource

In a traditional web app, each URL represents a different resource -- `/albums/123` is one resource, `/artists/456` is another, and navigating between them is navigating between resources. The browser loads a new document for each.

In athr, there is one resource: the **session** (`/s/:id`). Everything the user sees -- the library grid, an album detail, an artist page, search results -- is a **view of that session**, not a separate resource. The URL changes (`/s/:id/album/alb_123`), but the document doesn't. The server morphs the content area and pushes the URL via `history.pushState`. The `<audio>` element survives because there's no navigation -- just a view change within the same resource.

This is counterintuitive. Developers are trained to think of URLs as resource identifiers -- each path maps to a thing. Here, the URL is a **view coordinate** within a session. It still supports deep linking (a fresh load of `/s/:id/album/alb_123` renders the right view), but at runtime, view changes are state mutations on the session resource, not navigations to new resources.

### Views are state, not routes

When you click "Library" in the nav, the client POSTs a command: `POST /s/:id/view/library`. The server appends a `ViewChanged` event, the SSE stream pushes new HTML into `#content`, and the server pushes the URL. The browser history entry is a byproduct of a state change, not a cause of navigation.

This means:
- **Browser back/forward** triggers a `popstate` event, which POSTs to the server (`/s/:id/view/resolve`) to re-resolve the URL into a view. The server is still the authority on what to render.
- **Refreshing the page** hits the wildcard route (`GET /s/:id/*`), which parses the URL, emits a `ViewChanged` event if needed, and renders the shell with the correct view.
- **Deep linking** works -- someone can open `/s/:id/album/alb_123` directly and land on the album detail.

The benefit: **no state drift**. The server owns what the user sees. There's no client-side router maintaining its own notion of "current page" that can diverge from the server. Every view is rendered from server state, which means every window, every popup, every reconnection after a network drop shows the same thing. The browser does what it does best -- rendering HTML -- and the server does what it does best -- managing state and rendering views.

Every view change is a server round-trip (POST command + SSE response). With the right backend (fast runtime, local SQLite, server on the same machine as the browser), this is imperceptible. For cases where it might be perceptible, CSS transitions and animations can mask the latency while the server responds -- the user sees motion, not a blank frame. The simplicity you gain -- no client-side routing, no state management library, no hydration, no cache invalidation -- far outweighs the cost of a round-trip that in practice takes single-digit milliseconds locally and can be masked over a network.

### Search as a sub-resource

Most web apps encode search state in query parameters: `/search?q=foo&genre=rock&page=2`. Each combination of params is a URL, but there's no persistent server-side object representing the search.

athr treats search differently, inspired by e-commerce session patterns. When you type a query, the client POSTs `POST /s/:id/searches?q=foo`, which creates a **search resource** (`search:srch_xyz`) with its own event stream. The search holds the query, filters, pagination, and a cached result set. Refining the search (`POST /s/:id/searches/:searchId?q=bar`) appends a `SearchRefined` event to that resource.

This means:
- **Navigating away and back** loads instantly from the cached search -- no re-query.
- **Each search has its own URL** (`/s/:id/search/srch_xyz`) and its own event history.
- **The server controls the search lifecycle**, not the URL bar. The client never parses query params.

This is more server state than the query-param approach, but it's state in the right place -- on the server, in SQLite, queryable and observable. For a local app this is free. For a high-traffic web app you'd add TTLs on abandoned sessions, but the model itself scales -- it's how e-commerce platforms handle complex search with facets, saved filters, and personalization.

### Signals bridge server intent to browser APIs

The server can't call `audio.play()` -- that's a browser API. It can't set `audio.currentTime` or `audio.volume` either. These are imperative operations that only run in the client. But the server is the source of truth for playback state.

Datastar signals (`_trackUrl`, `_isPlaying`, `_seekTo`, `_volume`) solve this. They're not client-side state -- they're a **delivery mechanism**. The server pushes signal values via SSE (`datastar-patch-signals`), and a `data-effect` on the player element translates them into browser API calls. The server says "play track X at position Y"; the signal carries that intent; the effect calls `audio.play()`.

The server doesn't need to know about buffering, codec support, or network conditions -- the browser's media stack handles all of that via standard `GET /audio/:trackId` with Range headers. What the server tracks is **intent**: `is_playing` means "the user wants this to play."

The one place this model gets complicated is autoplay policy. The server can push `_isPlaying: true`, but the browser might refuse `audio.play()` if there's been no user gesture. When that happens, the client flips `$_isPlaying` locally to false so the UI shows a play button. The server still thinks it's playing -- but this self-corrects on the next user action (clicking play sends a real command), and the 1s position sync provides a secondary signal: if the client is syncing position, the server knows audio is actually playing.

### Commands and queries are separate concerns

The CQRS pattern in athr isn't just an architectural choice -- it's how hypermedia naturally works:

- **Commands** (POST) express user intent: "play this track", "navigate to this album", "search for this". They're short-lived, fire-and-forget, and return 204 (no body). The client doesn't render from the response.
- **Queries** (GET/SSE) deliver representations: the server pushes HTML patches whenever state changes. The client doesn't request specific data -- it subscribes and receives.

This separation means any window can send commands and all windows receive the resulting state change. The queue popup can POST "remove track" and the main window sees the queue update via SSE -- no coordination needed between windows. There's no shared client-side state to synchronize because there is no client-side state.

### Popup windows as a UX pattern

Settings, queue editor, mini player, and event stream open as `window.open()` popups -- real HTML pages with their own SSE connections to the same session. This demonstrates a UX pattern people don't typically reach for on the web: auxiliary features in separate windows that don't disrupt the main experience.

The main window owns audio playback. Opening the queue editor or settings doesn't interrupt the music -- it's a separate document that commands the same session. This mirrors native desktop apps where Cmd+, opens a preferences window and the media player keeps playing.

These features could also be implemented as modals or in-page panels morphed via SSE -- settings is just a sub-resource of the session, queue is just a view of the queue projection. The popup approach was chosen to demonstrate that the hypermedia model supports multiple independent documents sharing one server-side resource, each with its own SSE stream delivering only the patches relevant to that window.

## Stack

| Layer | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| HTTP | [Hono](https://hono.dev) |
| Reactivity | [Datastar](https://data-star.dev/) v1.0.0-RC.8 (CDN) |
| Event store | SQLite (`bun:sqlite`) |
| Projections | SQLite (`bun:sqlite`) |
| Views | HTML template literals (no JSX, no framework) |
| Audio metadata | `music-metadata` |
| Logging | [evlog](https://evlog.dev) (server + client) |

## Quick Start

```bash
# Install dependencies
bun install

# Start the dev server (hot reload)
bun run dev

# Open http://localhost:3000
# Configure your music directory in Settings
```

## CLI

```bash
# Build the self-contained binary
bun run build

# Serve and scan a music directory
athr serve --dir ~/Music

# Custom port
athr serve --dir ~/Music --port 8080

# Print config
athr config

# Update config
athr config set dir ~/Music

# Rescan library without starting server
athr scan
```

## Architecture

### Data Flow

```
Client @post --> Command handler --> Event store (append)
                     |                    |
                     |            Projection (update)
                     |                    |
                     +-- reads       EventBus (publish)
                        projection        |
                        to validate   SSE --> client (morph)
```

### Route Map

#### SSE Streams (long-lived GET)

| Route | Purpose |
|---|---|
| `GET /s/:id/sse` | Main stream -- content + player + signal patches |
| `GET /s/:id/queue/sse` | Queue popup stream |
| `GET /s/:id/events/sse` | Live event stream viewer |

#### Pages (full HTML, initial load)

| Route | Purpose |
|---|---|
| `GET /` | Create/resume session, redirect to `/s/:id` |
| `GET /s/:id` | Full shell with pre-rendered view |
| `GET /s/:id/*` | Deep link support (album, artist, search) |
| `GET /s/:id/queue` | Queue popup page |
| `GET /s/:id/settings` | Settings popup page |
| `GET /s/:id/mini` | Mini player popup page |
| `GET /s/:id/events` | Event stream viewer page |

#### Commands (short-lived POST)

| Route | Purpose |
|---|---|
| `POST /s/:id/view/library` | Navigate to library |
| `POST /s/:id/view/album/:albumId` | Navigate to album |
| `POST /s/:id/view/artist/:artistId` | Navigate to artist |
| `POST /s/:id/view/search` | Navigate to search |
| `POST /s/:id/play/:trackId` | Play a track (adds to queue) |
| `POST /s/:id/playback/pause` | Pause |
| `POST /s/:id/playback/resume` | Resume |
| `POST /s/:id/playback/next` | Next track (queue or album neighbor) |
| `POST /s/:id/playback/prev` | Previous track |
| `POST /s/:id/playback/seek/:positionMs` | Seek to position |
| `POST /s/:id/playback/sync/:trackId/:positionMs` | Position telemetry (not stored) |
| `POST /s/:id/volume/:level` | Set volume (0.0-1.0) |
| `POST /s/:id/queue/add/:trackId` | Add track to queue |
| `POST /s/:id/queue/add-album/:albumId` | Add album to queue |
| `POST /s/:id/queue/remove/:trackId` | Remove from queue |
| `POST /s/:id/queue/clear` | Clear queue |
| `POST /s/:id/searches` | Create search (query via `?q=`) |
| `POST /s/:id/searches/:searchId` | Refine search |
| `POST /s/:id/settings/update` | Update settings |

#### Static / Media

| Route | Purpose |
|---|---|
| `GET /audio/:trackId` | Stream audio (Range header support) |
| `GET /cover/:albumId` | Album cover art |
| `GET /public/*` | Static assets |

### Domain Events

Only user-intent events are stored. Position telemetry (`PlaybackPositionSynced`) updates the projection directly and publishes to the event bus without hitting the event store.

| Event | Stream | Data |
|---|---|---|
| `SessionCreated` | `session:{id}` | `{}` |
| `ViewChanged` | `session:{id}` | `{ view, viewData }` |
| `PlaybackStarted` | `session:{id}` | `{ trackId, positionMs, queuePosition }` |
| `PlaybackPaused` | `session:{id}` | `{ positionMs }` |
| `PlaybackResumed` | `session:{id}` | `{ positionMs }` |
| `PlaybackSeeked` | `session:{id}` | `{ positionMs }` |
| `VolumeChanged` | `session:{id}` | `{ level }` |
| `TrackQueued` | `session:{id}` | `{ trackId, position }` |
| `TrackDequeued` | `session:{id}` | `{ trackId }` |
| `QueueReordered` | `session:{id}` | `{ trackIds }` |
| `QueueCleared` | `session:{id}` | `{}` |
| `SearchCreated` | `search:{id}` | `{ sessionId, query, filters }` |
| `SearchRefined` | `search:{id}` | `{ query }` |
| `SettingsUpdated` | `session:{id}` | `{ key, value }` |

### Session Model

```
Session /s/:id
+-- Playback    track, position, volume, playing/paused, queue_position
+-- Queue       ordered track list with cursor
+-- View        current view name + view-specific data
+-- Searches    sub-resources with own event streams
```

Sessions persist across server restarts (SQLite file) and browser restarts (cookie).

## SLOPerations

_Server-Linked Observability for Operations_ -- the benefits of this architecture when working with AI agents.

Because athr treats the server as the single source of truth and exposes all state transitions as events, an AI coding agent has a remarkably complete view of the application's operations:

### Structured Logging (evlog)

Server-side request logging and client-side log transport both write to `.evlog/logs/` as NDJSON. An agent can read these to understand what happened:

```bash
# Server logs
{"method":"POST","path":"/s/sess_abc/play/t_123","status":204,"duration":"17ms",...}

# Client logs (transported via /api/_evlog/ingest)
{"action":"app_init","path":"/s/sess_abc/library","service":"athr-web",...}
```

### Event Stream Viewer

The Events popup (`/s/:id/events`) shows a live feed of all domain events and bus notifications. Consecutive events of the same type collapse into a counted badge. An agent connected to Chrome DevTools MCP can open this popup and watch events flow in real time.

### Chrome DevTools MCP

With the [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) connected, an agent can:

- **Take screenshots** to verify UI state after interactions
- **Read the accessibility tree** to find and click elements
- **Evaluate scripts** to inspect audio state, signal values, DOM content
- **Run performance traces** and analyze Core Web Vitals
- **Check console messages** for errors or warnings

### Event Sourcing as Audit Log

Every user action is an immutable event with a correlation ID. An agent can query the event store to trace "what happened?" -- from the user's click through to the resulting state change:

```sql
SELECT * FROM events WHERE correlation_id = 'cor_abc123' ORDER BY id;
```

### Why This Matters

Traditional SPAs with client-side state make it hard for an agent to know what actually happened -- state lives in closures, Redux stores, or component instances that aren't easily inspectable. With athr's architecture:

- **Server state is queryable**: `SELECT * FROM playback_projections` tells you exactly what the server thinks is happening
- **Events are traceable**: every state transition has a cause (correlation ID) and a timestamp
- **SSE is observable**: the agent can see what patches were pushed to which windows
- **No hidden client state**: Datastar signals are delivery mechanisms, not independent state. The server pushes them; the client doesn't invent its own.

This makes the development loop with an AI agent significantly tighter -- the agent can diagnose issues from server logs, event streams, and browser state without guessing.

## Development

```bash
bun run dev          # Dev server with hot reload
bun test             # Run tests
bun run typecheck    # Type check
bun run lint         # Lint (oxlint)
bun run build        # Build self-contained binary
```

## Takeaways

### The hypermedia model works

A music player with continuous playback, multi-window sync, and browser media controls -- built without React, Vue, Svelte, or any client-side framework. Datastar + SSE morphing delivers the interactivity. The server renders HTML. The client renders HTML. That's it.

The total client-side JavaScript is Datastar (~14KB gzipped from CDN) plus a small inline script for audio event listeners and Media Session API. No build step for client code. No bundler. No hydration.

### Your backend stack matters more than you think

This project was built with Bun + Hono -- a productive, fast JS runtime. But for a **locally-run desktop application**, the choice of backend technology has implications that go beyond developer ergonomics:

**HTTP/2**: Bun's HTTP server is HTTP/1.1 only. SSE connections are subject to the browser's 6-connection-per-domain limit. With 4+ popup windows, you're close to the ceiling. In Go, you'd embed [Caddy](https://caddyserver.com/) as a library and get HTTP/2 (plus automatic TLS) for free in the same binary -- no reverse proxy, no sidecar process.

**Single binary distribution**: Bun can compile to a standalone binary via `bun build --compile`, but you can't embed native dependencies. Go's static linking lets you embed an HTTP/2 server, a NATS message bus, a reverse proxy, and your application logic into one binary with zero runtime dependencies.

**Multiplexing**: The SSE connection limit is an HTTP/1.1 constraint that HTTP/2 eliminates entirely (all streams multiplex over one TCP connection). For a local app where you control the server, this is a solved problem in Go -- but an open problem in the JS runtime ecosystem.

**The workaround in JS-land**: A `SharedWorker` can hold a single SSE connection and broadcast to all windows via `postMessage`, solving the connection limit on the client side without HTTP/2. It works, but it's a workaround for a transport limitation that the right backend stack wouldn't have.

### The architecture is runtime-agnostic

The patterns demonstrated here -- CQRS, event sourcing, SSE morphing, server-controlled URLs, popup windows as separate documents -- are not tied to Bun, Hono, or even JavaScript. The same architecture in Go + [Templ](https://templ.guide/) + Datastar + embedded Caddy would eliminate the HTTP/1.1 constraints while keeping the hypermedia model intact. The architectural ideas are the point; the runtime is interchangeable.

### What Datastar gets right

- **SSE as the transport**: Server pushes HTML, not JSON. No client-side rendering layer.
- **Signals for the imperative gap**: The `<audio>` API requires method calls (`play()`, `pause()`). Signals bridge server state to browser APIs without client-side state management.
- **Morphing preserves DOM state**: `data-ignore-morph` on `<audio>` means the element survives content updates. No framework needed to manage this -- the DOM is the state.

### What event sourcing enables

- **Time-travel debugging**: Every user action is an immutable event. Replay the log to reproduce any state.
- **Projection flexibility**: Change how you read data without migrating. Add a new projection, rebuild from events.
- **Agent-friendly operations**: An AI agent can query `SELECT * FROM events WHERE correlation_id = ?` to trace exactly what happened. No guessing about client-side state.
- **Clean domain/telemetry separation**: Domain events (PlaybackStarted, TrackQueued) go in the event store. Position telemetry updates the projection directly and publishes to the bus. The event log stays meaningful.

## License

MIT
