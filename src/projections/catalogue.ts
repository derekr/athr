import type { Database } from "bun:sqlite";

/** Initialize catalogue tables */
export function initCatalogue(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      album_id TEXT NOT NULL,
      track_number INTEGER,
      duration_ms INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      format TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      cover_path TEXT,
      year INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id)`);
}

export interface ArtistRecord {
  id: string;
  name: string;
}

export interface AlbumRecord {
  id: string;
  title: string;
  artistId: string;
  coverPath?: string;
  year?: number;
}

export interface TrackRecord {
  id: string;
  title: string;
  artistId: string;
  albumId: string;
  trackNumber?: number;
  durationMs: number;
  filePath: string;
  format: string;
}

export function upsertArtist(db: Database, artist: ArtistRecord): void {
  db.run(
    `INSERT INTO artists (id, name) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
    [artist.id, artist.name]
  );
}

export function upsertAlbum(db: Database, album: AlbumRecord): void {
  db.run(
    `INSERT INTO albums (id, title, artist_id, cover_path, year) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       artist_id = excluded.artist_id,
       cover_path = excluded.cover_path,
       year = excluded.year`,
    [
      album.id,
      album.title,
      album.artistId,
      album.coverPath ?? null,
      album.year ?? null,
    ]
  );
}

export function upsertTrack(db: Database, track: TrackRecord): void {
  db.run(
    `INSERT INTO tracks (id, title, artist_id, album_id, track_number, duration_ms, file_path, format) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       artist_id = excluded.artist_id,
       album_id = excluded.album_id,
       track_number = excluded.track_number,
       duration_ms = excluded.duration_ms,
       file_path = excluded.file_path,
       format = excluded.format`,
    [
      track.id,
      track.title,
      track.artistId,
      track.albumId,
      track.trackNumber ?? null,
      track.durationMs,
      track.filePath,
      track.format,
    ]
  );
}

export function getTrack(
  db: Database,
  trackId: string
): TrackRecord | null {
  const row = db
    .prepare(`SELECT * FROM tracks WHERE id = ?`)
    .get(trackId) as {
    id: string;
    title: string;
    artist_id: string;
    album_id: string;
    track_number: number | null;
    duration_ms: number;
    file_path: string;
    format: string;
  } | null;

  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    artistId: row.artist_id,
    albumId: row.album_id,
    trackNumber: row.track_number ?? undefined,
    durationMs: row.duration_ms,
    filePath: row.file_path,
    format: row.format,
  };
}
