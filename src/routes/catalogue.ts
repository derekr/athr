import { Hono } from "hono";
import * as fs from "fs";
import * as path from "path";
import { db } from "../app";
import { getTrack } from "../projections/catalogue";

const router = new Hono();

const MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  opus: "audio/opus",
};

/** GET /audio/:trackId — Stream audio file with Range header support */
router.get("/audio/:trackId", (c) => {
  const trackId = c.req.param("trackId");
  const track = getTrack(db, trackId);

  if (!track) {
    return c.text("Track not found", 404);
  }

  if (!fs.existsSync(track.filePath)) {
    return c.text("Audio file not found on disk", 404);
  }

  const stat = fs.statSync(track.filePath);
  const fileSize = stat.size;
  const mimeType = MIME_TYPES[track.format] ?? "audio/mpeg";

  const rangeHeader = c.req.header("Range");

  if (rangeHeader) {
    // Parse Range: bytes=start-end
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return c.text("Invalid Range header", 416);
    }

    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start > end || end >= fileSize) {
      return c.text("Range Not Satisfiable", 416);
    }

    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(track.filePath, { start, end });

    return new Response(fileStream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  // Full file response
  const fileStream = fs.createReadStream(track.filePath);
  return new Response(fileStream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
    },
  });
});

/** GET /cover/:albumId — Serve cover art for an album */
router.get("/cover/:albumId", (c) => {
  const albumId = c.req.param("albumId");

  const row = db
    .prepare(`SELECT cover_path FROM albums WHERE id = ?`)
    .get(albumId) as { cover_path: string | null } | null;

  if (!row?.cover_path || !fs.existsSync(row.cover_path)) {
    // Return a simple SVG placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#242424"/>
      <text x="100" y="115" text-anchor="middle" font-size="64">💿</text>
    </svg>`;
    return c.text(svg, 200, { "Content-Type": "image/svg+xml" });
  }

  const ext = path.extname(row.cover_path).slice(1).toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  const mimeType = mimeMap[ext] ?? "image/jpeg";

  const fileStream = fs.createReadStream(row.cover_path);
  return new Response(fileStream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
});

export default router;
