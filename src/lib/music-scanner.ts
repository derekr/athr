import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "bun:sqlite";
import {
  upsertArtist,
  upsertAlbum,
  upsertTrack,
} from "../projections/catalogue";

const SUPPORTED_FORMATS = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac", ".opus"]);

const COVER_CACHE_DIR = path.join(process.cwd(), ".cache", "covers");

function deterministicId(prefix: string, value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

export interface ScanResult {
  tracks: number;
  albums: number;
  artists: number;
  added: number;
  removed: number;
  unchanged: number;
  errors: string[];
}

export interface ScanProgress {
  phase: "walking" | "processing" | "cleanup" | "complete";
  processed: number;
  total: number;
  currentFile?: string;
  added: number;
  removed: number;
}

export type ScanCallback = (progress: ScanProgress) => void;

/** Recursively walk a directory and yield audio file paths */
function* walkDir(dir: string): Generator<string> {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_FORMATS.has(ext)) {
          yield fullPath;
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

function findCoverInDir(dir: string): string | undefined {
  const coverNames = ["cover.jpg", "cover.jpeg", "cover.png", "folder.jpg", "folder.png", "artwork.jpg"];
  for (const name of coverNames) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function cacheEmbeddedCover(
  albumId: string,
  pictures: Array<{ format: string; data: Uint8Array }> | undefined
): string | undefined {
  if (!pictures || pictures.length === 0) return undefined;

  const pic = pictures[0];
  const extMap: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
  };
  const ext = extMap[pic.format] ?? ".jpg";
  const cachePath = path.join(COVER_CACHE_DIR, `${albumId}${ext}`);

  if (fs.existsSync(cachePath)) return cachePath;

  if (!fs.existsSync(COVER_CACHE_DIR)) {
    fs.mkdirSync(COVER_CACHE_DIR, { recursive: true });
  }

  fs.writeFileSync(cachePath, pic.data);
  return cachePath;
}

/**
 * Incremental scan: only process new/changed files, remove deleted ones.
 * Calls onProgress for live UI updates.
 */
export async function scanMusicDirectory(
  musicDir: string,
  db: Database,
  onProgress?: ScanCallback
): Promise<ScanResult> {
  const { parseFile } = await import("music-metadata");

  const result: ScanResult = { tracks: 0, albums: 0, artists: 0, added: 0, removed: 0, unchanged: 0, errors: [] };

  if (!fs.existsSync(musicDir)) {
    result.errors.push(`Music directory not found: ${musicDir}`);
    return result;
  }

  // Phase 1: Walk directory, collect files + mtimes
  onProgress?.({ phase: "walking", processed: 0, total: 0, added: 0, removed: 0 });

  const diskFiles = new Map<string, number>(); // filePath → mtime_ms
  for (const filePath of walkDir(musicDir)) {
    try {
      const stat = fs.statSync(filePath);
      diskFiles.set(filePath, Math.floor(stat.mtimeMs));
    } catch {
      // Skip unreadable files
    }
  }

  // Phase 2: Load existing tracks from DB for diff
  const existingTracks = db
    .prepare(`SELECT id, file_path, mtime_ms FROM tracks`)
    .all() as Array<{ id: string; file_path: string; mtime_ms: number }>;

  const existingByPath = new Map<string, { id: string; mtimeMs: number }>();
  for (const t of existingTracks) {
    existingByPath.set(t.file_path, { id: t.id, mtimeMs: t.mtime_ms });
  }

  // Phase 3: Process new and changed files
  const seenArtists = new Set<string>();
  const seenAlbums = new Set<string>();
  const totalFiles = diskFiles.size;
  let processed = 0;

  for (const [filePath, mtimeMs] of diskFiles) {
    processed++;
    const existing = existingByPath.get(filePath);

    // Skip unchanged files
    if (existing && existing.mtimeMs === mtimeMs) {
      result.unchanged++;
      // Still count entities for the result
      result.tracks++;
      continue;
    }

    onProgress?.({
      phase: "processing",
      processed,
      total: totalFiles,
      currentFile: path.basename(filePath),
      added: result.added,
      removed: result.removed,
    });

    try {
      const meta = await parseFile(filePath, { duration: true });
      const common = meta.common;
      const format = meta.format;

      const artistName = common.albumartist ?? common.artist ?? "Unknown Artist";
      const albumName = common.album ?? "Unknown Album";
      const trackTitle = common.title ?? path.basename(filePath, path.extname(filePath));
      const trackNumber = common.track?.no ?? undefined;
      const year = common.year ?? undefined;
      const durationMs = format.duration ? Math.round(format.duration * 1000) : 0;
      const fileExt = path.extname(filePath).slice(1).toLowerCase();

      const artistId = deterministicId("art", artistName.toLowerCase());
      const albumId = deterministicId("alb", `${artistName}::${albumName}`.toLowerCase());
      const trackId = deterministicId("t", filePath);

      if (!seenArtists.has(artistId)) {
        upsertArtist(db, { id: artistId, name: artistName });
        seenArtists.add(artistId);
        result.artists++;
      }

      if (!seenAlbums.has(albumId)) {
        const coverPath =
          cacheEmbeddedCover(albumId, common.picture as Array<{ format: string; data: Uint8Array }> | undefined) ??
          findCoverInDir(path.dirname(filePath));

        upsertAlbum(db, {
          id: albumId,
          title: albumName,
          artistId,
          coverPath,
          year,
        });
        seenAlbums.add(albumId);
        result.albums++;
      }

      upsertTrack(db, {
        id: trackId,
        title: trackTitle,
        artistId,
        albumId,
        trackNumber,
        durationMs,
        filePath,
        format: fileExt,
        mtimeMs,
      });
      result.tracks++;
      result.added++;
    } catch (err) {
      result.errors.push(
        `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Phase 4: Remove tracks no longer on disk
  onProgress?.({ phase: "cleanup", processed, total: totalFiles, added: result.added, removed: 0 });

  for (const [filePath, { id }] of existingByPath) {
    if (!diskFiles.has(filePath)) {
      db.run(`DELETE FROM tracks WHERE id = ?`, [id]);
      result.removed++;
    }
  }

  // Clean up orphaned albums and artists
  db.run(`DELETE FROM albums WHERE id NOT IN (SELECT DISTINCT album_id FROM tracks)`);
  db.run(`DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)`);

  onProgress?.({
    phase: "complete",
    processed: totalFiles,
    total: totalFiles,
    added: result.added,
    removed: result.removed,
  });

  return result;
}
