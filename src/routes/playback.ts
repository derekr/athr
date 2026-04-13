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
 * POST /s/:id/play
 * Body: { trackId: string, positionMs?: number }
 * Starts playback of a track.
 */
router.post("/s/:id/play", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const body = await c.req.json<{ trackId: string; positionMs?: number }>().catch(
    () => null
  );
  if (!body?.trackId) return c.text("trackId required", 400);

  const track = getTrack(db, body.trackId);
  if (!track) return c.text("Track not found", 404);

  const playback = getPlaybackProjection(db, sessionId);
  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  // No-op: already playing the same track
  if (
    playback?.track_id === body.trackId &&
    playback.is_playing === 1 &&
    body.positionMs === undefined
  ) {
    return c.body(null, 204);
  }

  appendEvents(
    `session:${sessionId}`,
    [
      {
        type: "PlaybackStarted",
        data: { trackId: body.trackId, positionMs: body.positionMs ?? 0 },
      },
    ],
    version,
    correlationId
  );

  return c.body(null, 204);
});

/**
 * POST /s/:id/playback
 * Body: { action: "pause" | "resume" | "seek" | "next" | "prev" | "sync", positionMs?: number }
 */
router.post("/s/:id/playback", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const body = await c.req
    .json<{
      action: string;
      positionMs?: number;
    }>()
    .catch(() => null);

  if (!body?.action) return c.text("action required", 400);

  const playback = getPlaybackProjection(db, sessionId);
  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  switch (body.action) {
    case "pause": {
      if (!playback?.track_id) return c.body(null, 204);
      if (playback.is_playing === 0) return c.body(null, 204); // already paused

      appendEvents(
        `session:${sessionId}`,
        [{ type: "PlaybackPaused", data: { positionMs: body.positionMs ?? playback.position_ms } }],
        version,
        correlationId
      );
      break;
    }
    case "resume": {
      if (!playback?.track_id) return c.body(null, 204);
      if (playback.is_playing === 1) return c.body(null, 204); // already playing

      appendEvents(
        `session:${sessionId}`,
        [{ type: "PlaybackResumed", data: { positionMs: body.positionMs ?? playback.position_ms } }],
        version,
        correlationId
      );
      break;
    }
    case "seek": {
      if (!playback?.track_id) return c.text("No track loaded", 400);
      if (body.positionMs === undefined) return c.text("positionMs required", 400);

      appendEvents(
        `session:${sessionId}`,
        [{ type: "PlaybackSeeked", data: { positionMs: body.positionMs } }],
        version,
        correlationId
      );
      break;
    }
    case "next": {
      // Advance to next track in queue
      const queue = getQueue(db, sessionId);
      if (queue.length === 0) {
        // No queue — pause
        if (playback?.is_playing) {
          appendEvents(
            `session:${sessionId}`,
            [{ type: "PlaybackPaused", data: { positionMs: 0 } }],
            version,
            correlationId
          );
        }
        break;
      }
      const currentTrackId = playback?.track_id;
      const currentIdx = currentTrackId
        ? queue.findIndex((q) => q.track_id === currentTrackId)
        : -1;
      const nextItem = queue[currentIdx + 1] ?? queue[0];

      appendEvents(
        `session:${sessionId}`,
        [{ type: "PlaybackStarted", data: { trackId: nextItem.track_id, positionMs: 0 } }],
        version,
        correlationId
      );
      break;
    }
    case "prev": {
      const queue = getQueue(db, sessionId);
      if (queue.length === 0) break;
      const currentTrackId = playback?.track_id;
      const currentIdx = currentTrackId
        ? queue.findIndex((q) => q.track_id === currentTrackId)
        : 0;
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : queue.length - 1;
      const prevItem = queue[prevIdx];

      appendEvents(
        `session:${sessionId}`,
        [{ type: "PlaybackStarted", data: { trackId: prevItem.track_id, positionMs: 0 } }],
        version,
        correlationId
      );
      break;
    }
    case "sync": {
      // Client reports current position (e.g., on timeupdate)
      // Just update position if playing
      if (playback?.is_playing && body.positionMs !== undefined) {
        appendEvents(
          `session:${sessionId}`,
          [{ type: "PlaybackSeeked", data: { positionMs: body.positionMs } }],
          version,
          correlationId
        );
      }
      break;
    }
    default:
      return c.text(`Unknown action: ${body.action}`, 400);
  }

  return c.body(null, 204);
});

/**
 * POST /s/:id/volume
 * Body: { level: number } (0.0 - 1.0)
 */
router.post("/s/:id/volume", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const body = await c.req.json<{ level: number }>().catch(() => null);
  if (body?.level === undefined) return c.text("level required", 400);

  const level = Math.max(0, Math.min(1, body.level));
  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "VolumeChanged", data: { level } }],
    version,
    correlationId
  );

  return c.body(null, 204);
});

export default router;
