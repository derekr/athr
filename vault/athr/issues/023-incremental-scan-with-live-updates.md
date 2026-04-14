---
title: "Incremental scanning with live library updates"
status: todo
updated: 2026-04-14
---

# Incremental scanning with live library updates

## Problem

The current scanner (`music-scanner.ts`) does a full walk + upsert on every scan. It doesn't know what changed — it re-processes everything. The library view doesn't update until the user navigates away and back. There's no progress feedback during a scan.

## Goal

Make scanning incremental (only process changes) and push live updates to the library view as new tracks/albums/artists are discovered or removed.

## Approach

### 1. Diff-based scanning

Before scanning, snapshot the current catalogue state:

```
existing = SELECT file_path, id FROM tracks
```

Walk the directory and compare:
- **New files**: file_path not in existing → parse metadata, upsert
- **Removed files**: file_path in existing but not on disk → delete
- **Changed files**: file_path exists but mtime differs → re-parse metadata, update

Skip unchanged files entirely. This makes rescans fast for large libraries with few changes.

### Why single-pass, not entity-level batching

The bottleneck is metadata parsing (~5-10ms per file, I/O bound). A two-pass approach (discover albums first, then tracks) would parse every file twice for no benefit. SQLite upserts are sub-millisecond — the DB writes are essentially free compared to the file reads.

The natural grain is one file at a time: parse metadata → upsert artist → upsert album → upsert track → emit events. For the incremental version, `stat()` (~0.01ms) determines whether to parse at all, saving ~500x per unchanged file. Entity-level passes would fight the filesystem's access pattern rather than work with it.

### 2. Granular domain events

Instead of the scanner being a silent batch process, emit events for catalogue changes:

| Event | Stream | Data |
|---|---|---|
| `TrackAdded` | `catalogue` | `{ trackId, title, albumId, artistId }` |
| `TrackRemoved` | `catalogue` | `{ trackId }` |
| `AlbumAdded` | `catalogue` | `{ albumId, title, artistId }` |
| `AlbumRemoved` | `catalogue` | `{ albumId }` |
| `ArtistAdded` | `catalogue` | `{ artistId, name }` |
| `ArtistRemoved` | `catalogue` | `{ artistId }` |
| `ScanStarted` | `catalogue` | `{ dir, totalFiles }` |
| `ScanProgress` | `catalogue` | `{ processed, total, currentFile }` |
| `ScanComplete` | `catalogue` | `{ added, removed, unchanged, errors }` |

Note: `ScanProgress` is telemetry (like `PlaybackPositionSynced`) — publish to bus without storing in event store. The others are domain events.

### 3. SSE library updates

The main SSE stream subscribes to `catalogue` stream events. On `TrackAdded`/`AlbumAdded`/`ArtistAdded`, re-render and push `#content` if the current view is `library`. This makes new albums appear in real-time as they're scanned.

### 4. Settings scan progress

The settings popup could show scan progress:
- "Scanning... 42/150 files"
- "Found 3 new albums"
- "Complete: 12 added, 0 removed"

This requires the settings page to have an SSE connection (currently it doesn't). Options:
- Add `data-init="@get('/s/:id/sse')"` to settings page
- Or use a dedicated `/s/:id/settings/sse` that only subscribes to catalogue events

### 5. File watcher integration

The existing `music-watcher.ts` already debounces file changes and triggers rescans. With incremental scanning, the rescan after a file change would be near-instant (only processing the changed file).

### 6. Worker thread

The scanner already runs in a worker thread (`scan-worker.ts`). The incremental scanner would need to communicate progress back to the main thread:

```
worker.postMessage({ type: 'progress', processed: 42, total: 150 })
worker.postMessage({ type: 'track_added', trackId: 't_abc', ... })
worker.postMessage({ type: 'complete', result: { added: 12, removed: 0 } })
```

The main thread receives these messages and publishes to the event bus.

## Tasks

- [ ] Add `mtime` column to tracks table for change detection
- [ ] Implement diff-based scan: new/removed/changed file detection
- [ ] Emit granular catalogue events (TrackAdded, AlbumAdded, etc.)
- [ ] Subscribe main SSE to catalogue events, re-render library on changes
- [ ] Add scan progress reporting from worker thread
- [ ] Show progress in settings popup (requires SSE connection or polling)
- [ ] Update file watcher to use incremental scan
- [ ] Handle edge cases: renamed files, moved albums, changed metadata on existing files
