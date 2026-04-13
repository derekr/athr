import { Hono } from "hono";
import { db, appendEvents, eventStore } from "../app";
import { getSessionProjection } from "../projections/session";
import { getPlaybackProjection } from "../projections/playback";
import { getQueue } from "../projections/queue";
import { getTrack } from "../projections/catalogue";

const router = new Hono();

function getSessionVersion(sessionId: string): number {
  const events = eventStore.getStream(`session:${sessionId}`);
  return events.length > 0 ? events[events.length - 1].streamVersion : -1;
}

/**
 * POST /s/:id/play/:trackId
 * Starts playback of a track. Ensures the track is the current item
 * in the queue, trimming any history before it.
 */
router.post("/s/:id/play/:trackId", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const trackId = c.req.param("trackId");
  const track = getTrack(db, trackId);
  if (!track) return c.text("Track not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  const correlationId = c.get("correlationId");
  let version = getSessionVersion(sessionId);

  if (playback?.track_id === trackId && playback.is_playing === 1) {
    return c.body(null, 204);
  }

  const queue = getQueue(db, sessionId);
  const existingIdx = queue.findIndex((q) => q.track_id === trackId);

  if (existingIdx >= 0) {
    // Track is already in queue — trim everything before it
    if (existingIdx > 0) {
      const keepIds = queue.slice(existingIdx).map((q) => q.track_id);
      const appended = appendEvents(
        `session:${sessionId}`,
        [{ type: "QueueReordered", data: { trackIds: keepIds } }],
        version,
        correlationId
      );
      version = appended[appended.length - 1].streamVersion;
    }
  } else {
    // Track not in queue — clear history (everything before current),
    // then insert this track at position 0
    const currentIdx = playback?.track_id
      ? queue.findIndex((q) => q.track_id === playback.track_id)
      : -1;
    const keepAfterCurrent = currentIdx >= 0 ? queue.slice(currentIdx + 1).map((q) => q.track_id) : [];
    const newOrder = [trackId, ...keepAfterCurrent];
    const appended = appendEvents(
      `session:${sessionId}`,
      [{ type: "QueueReordered", data: { trackIds: newOrder } }],
      version,
      correlationId
    );
    version = appended[appended.length - 1].streamVersion;
  }

  appendEvents(
    `session:${sessionId}`,
    [{ type: "PlaybackStarted", data: { trackId, positionMs: 0 } }],
    version,
    correlationId
  );

  return c.body(null, 204);
});

/** POST /s/:id/playback/pause */
router.post("/s/:id/playback/pause", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  if (!playback?.track_id || playback.is_playing === 0) return c.body(null, 204);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "PlaybackPaused", data: { positionMs: playback.position_ms } }],
    getSessionVersion(sessionId),
    c.get("correlationId")
  );
  return c.body(null, 204);
});

/** POST /s/:id/playback/resume */
router.post("/s/:id/playback/resume", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  if (!playback?.track_id || playback.is_playing === 1) return c.body(null, 204);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "PlaybackResumed", data: { positionMs: playback.position_ms } }],
    getSessionVersion(sessionId),
    c.get("correlationId")
  );
  return c.body(null, 204);
});

/** POST /s/:id/playback/seek/:positionMs */
router.post("/s/:id/playback/seek/:positionMs", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  if (!playback?.track_id) return c.text("No track loaded", 400);

  const positionMs = parseInt(c.req.param("positionMs"), 10);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "PlaybackSeeked", data: { positionMs } }],
    getSessionVersion(sessionId),
    c.get("correlationId")
  );
  return c.body(null, 204);
});

/**
 * Find the next/prev track in the same album as the current track.
 * Returns null if there's no adjacent track.
 */
function getAlbumNeighbor(trackId: string, direction: "next" | "prev"): string | null {
  const track = db.prepare(`SELECT album_id, track_number FROM tracks WHERE id = ?`).get(trackId) as {
    album_id: string;
    track_number: number | null;
  } | null;
  if (!track) return null;

  const albumTracks = db
    .prepare(`SELECT id FROM tracks WHERE album_id = ? ORDER BY track_number ASC, title ASC`)
    .all(track.album_id) as { id: string }[];

  const idx = albumTracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return null;

  const neighborIdx = direction === "next" ? idx + 1 : idx - 1;
  return albumTracks[neighborIdx]?.id ?? null;
}

/** POST /s/:id/playback/next */
router.post("/s/:id/playback/next", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  const queue = getQueue(db, sessionId);
  const correlationId = c.get("correlationId");
  let version = getSessionVersion(sessionId);

  const currentIdx = playback?.track_id
    ? queue.findIndex((q) => q.track_id === playback.track_id)
    : -1;

  let nextTrackId: string | null = null;

  if (currentIdx >= 0 && currentIdx + 1 < queue.length) {
    // There's a next track in the queue
    nextTrackId = queue[currentIdx + 1].track_id;
  } else if (playback?.track_id) {
    // Nothing ahead in queue — auto-enqueue album neighbor
    nextTrackId = getAlbumNeighbor(playback.track_id, "next");
    if (nextTrackId) {
      const appended = appendEvents(
        `session:${sessionId}`,
        [{ type: "TrackQueued", data: { trackId: nextTrackId, position: queue.length } }],
        version,
        correlationId
      );
      version = appended[appended.length - 1].streamVersion;
    }
  }

  if (!nextTrackId) {
    // End of album, nothing in queue — pause
    if (playback?.is_playing) {
      appendEvents(`session:${sessionId}`, [{ type: "PlaybackPaused", data: { positionMs: 0 } }], version, correlationId);
    }
    return c.body(null, 204);
  }

  // Trim history: drop everything before the next track
  const updatedQueue = getQueue(db, sessionId);
  const nextIdx = updatedQueue.findIndex((q) => q.track_id === nextTrackId);
  if (nextIdx > 0) {
    const keepIds = updatedQueue.slice(nextIdx).map((q) => q.track_id);
    const appended = appendEvents(
      `session:${sessionId}`,
      [{ type: "QueueReordered", data: { trackIds: keepIds } }],
      version,
      correlationId
    );
    version = appended[appended.length - 1].streamVersion;
  }

  appendEvents(`session:${sessionId}`, [{ type: "PlaybackStarted", data: { trackId: nextTrackId, positionMs: 0 } }], version, correlationId);
  return c.body(null, 204);
});

/** POST /s/:id/playback/prev */
router.post("/s/:id/playback/prev", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  const queue = getQueue(db, sessionId);
  const correlationId = c.get("correlationId");
  let version = getSessionVersion(sessionId);

  const currentIdx = playback?.track_id
    ? queue.findIndex((q) => q.track_id === playback.track_id)
    : -1;

  let prevTrackId: string | null = null;

  if (currentIdx > 0) {
    // There's a previous track in the queue
    prevTrackId = queue[currentIdx - 1].track_id;
  } else if (playback?.track_id) {
    // Nothing behind in queue — auto-enqueue album neighbor at front
    prevTrackId = getAlbumNeighbor(playback.track_id, "prev");
    if (prevTrackId) {
      const appended = appendEvents(
        `session:${sessionId}`,
        [{ type: "TrackQueued", data: { trackId: prevTrackId, position: 0 } }],
        version,
        correlationId
      );
      version = appended[appended.length - 1].streamVersion;
    }
  }

  if (!prevTrackId) return c.body(null, 204);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "PlaybackStarted", data: { trackId: prevTrackId, positionMs: 0 } }],
    version,
    correlationId
  );
  return c.body(null, 204);
});

/** POST /s/:id/playback/sync/:positionMs — Client reports current position (no audio seek) */
router.post("/s/:id/playback/sync/:positionMs", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  if (!playback?.is_playing) return c.body(null, 204);

  const positionMs = parseInt(c.req.param("positionMs"), 10);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "PlaybackPositionSynced", data: { positionMs } }],
    getSessionVersion(sessionId),
    c.get("correlationId")
  );
  return c.body(null, 204);
});

/** POST /s/:id/volume/:level — Set volume (0-100 integer, mapped to 0.0-1.0) */
router.post("/s/:id/volume/:level", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const level = Math.max(0, Math.min(1, parseFloat(c.req.param("level"))));

  appendEvents(
    `session:${sessionId}`,
    [{ type: "VolumeChanged", data: { level } }],
    getSessionVersion(sessionId),
    c.get("correlationId")
  );
  return c.body(null, 204);
});

export default router;
