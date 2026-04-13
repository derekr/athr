import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "bun:sqlite";
import {
  upsertArtist,
  upsertAlbum,
  upsertTrack,
} from "../projections/catalogue";

const SUPPORTED_FORMATS = [".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac", ".opus"];

const COVER_CACHE_DIR = path.join(process.cwd(), ".cache", "covers");

/** Generate a deterministic ID from a string value */
function deterministicId(prefix: string, value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

export interface ScanResult {
  tracks: number;
  albums: number;
  artists: number;
  errors: string[];
}

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
        if (SUPPORTED_FORMATS.includes(ext)) {
          yield fullPath;
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}

/** Look for cover art in the same directory as the audio file */
function findCoverInDir(dir: string): string | undefined {
  const coverNames = ["cover.jpg", "cover.jpeg", "cover.png", "folder.jpg", "folder.png", "artwork.jpg"];
  for (const name of coverNames) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/** Extract embedded cover art and cache to disk. Returns cached file path or undefined. */
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

  // Skip if already cached
  if (fs.existsSync(cachePath)) return cachePath;

  if (!fs.existsSync(COVER_CACHE_DIR)) {
    fs.mkdirSync(COVER_CACHE_DIR, { recursive: true });
  }

  fs.writeFileSync(cachePath, pic.data);
  return cachePath;
}

/** Scan a music directory and upsert metadata into the catalogue */
export async function scanMusicDirectory(
  musicDir: string,
  db: Database
): Promise<ScanResult> {
  const { parseFile } = await import("music-metadata");

  const result: ScanResult = { tracks: 0, albums: 0, artists: 0, errors: [] };
  const seenArtists = new Set<string>();
  const seenAlbums = new Set<string>();

  if (!fs.existsSync(musicDir)) {
    result.errors.push(`Music directory not found: ${musicDir}`);
    return result;
  }

  for (const filePath of walkDir(musicDir)) {
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

      // Deterministic IDs
      const artistId = deterministicId("art", artistName.toLowerCase());
      const albumId = deterministicId("alb", `${artistName}::${albumName}`.toLowerCase());
      const trackId = deterministicId("t", filePath);

      // Upsert artist
      if (!seenArtists.has(artistId)) {
        upsertArtist(db, { id: artistId, name: artistName });
        seenArtists.add(artistId);
        result.artists++;
      }

      // Upsert album (with cover art: embedded > directory > none)
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

      // Upsert track
      upsertTrack(db, {
        id: trackId,
        title: trackTitle,
        artistId,
        albumId,
        trackNumber,
        durationMs,
        filePath,
        format: fileExt,
      });
      result.tracks++;
    } catch (err) {
      result.errors.push(
        `Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}
