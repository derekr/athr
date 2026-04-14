---
title: "Catalogue Data & Seed"
type: issue
id: ISSUE-010
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[003-playback]]"
related:
  - "[[011-playback-commands]]"
  - "[[018-search-results-view]]"
tags:
  - data
  - catalogue
  - sqlite
estimate: medium
---

# Catalogue Data & Seed

Music metadata and audio source. For the POC, this is a local-first approach: users point the app at a folder of music files and the server scans/indexes them.

## Approach: Local music folder

The app reads a configurable directory of audio files, extracts metadata, and indexes into SQLite. This means:

- Real music playback (user's own files)
- No external service dependencies
- No hosting audio files
- Works offline

## Schema

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

CREATE INDEX idx_tracks_album ON tracks(album_id);
CREATE INDEX idx_tracks_artist ON tracks(artist_id);
CREATE INDEX idx_albums_artist ON albums(artist_id);
```

## Audio serving

Hono serves audio files from the indexed path:

```
GET /audio/:trackId → streams file from disk with proper Content-Type and Range header support
```

Range headers are important for seeking — the `<audio>` element requests byte ranges.

## Metadata extraction

Use a library like `music-metadata` (npm) to parse ID3/Vorbis tags from audio files. Extract:

- Title, artist, album, track number, duration
- Cover art (embedded in file or folder `cover.jpg`)

## Configuration

```
MUSIC_DIR=/path/to/music bun run src/index.ts
```

Or a config file / startup prompt.

## Scan flow

1. On startup, recursively scan `MUSIC_DIR` for audio files (`.mp3`, `.flac`, `.ogg`, `.m4a`, `.wav`)
2. For each file, extract metadata
3. Upsert artists, albums, tracks into catalogue tables
4. Generate deterministic IDs from file path (so rescans are idempotent)

## Tasks

- [ ] Catalogue schema creation on startup
- [ ] Music directory scanner
- [ ] Metadata extraction (find a Bun-compatible library)
- [ ] Upsert logic for artists/albums/tracks
- [ ] `GET /audio/:trackId` with Range header support
- [ ] Cover art serving endpoint
