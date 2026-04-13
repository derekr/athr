import { Hono } from "hono";
import { db, appendEvents, eventStore } from "../app";
import { getSessionProjection } from "../projections/session";
import { getQueue } from "../projections/queue";
import { getTrack } from "../projections/catalogue";

const router = new Hono();

function getSessionVersion(sessionId: string): number {
  const events = eventStore.getStream(`session:${sessionId}`);
  return events.length > 0 ? events[events.length - 1].streamVersion : -1;
}

/**
 * POST /s/:id/queue
 * Body: { action: "add" | "remove" | "clear" | "next" | "prev" | "add_album", trackId?, albumId?, position? }
 */
router.post("/s/:id/queue", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const body = await c.req
    .json<{
      action: string;
      trackId?: string;
      albumId?: string;
      position?: number;
    }>()
    .catch(() => null);

  if (!body?.action) return c.text("action required", 400);

  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  switch (body.action) {
    case "add": {
      if (!body.trackId) return c.text("trackId required", 400);
      const track = getTrack(db, body.trackId);
      if (!track) return c.text("Track not found", 404);

      const queue = getQueue(db, sessionId);
      const position = body.position ?? queue.length;

      appendEvents(
        `session:${sessionId}`,
        [{ type: "TrackQueued", data: { trackId: body.trackId, position } }],
        version,
        correlationId
      );
      break;
    }
    case "add_album": {
      if (!body.albumId) return c.text("albumId required", 400);
      const tracks = db
        .prepare(`SELECT id FROM tracks WHERE album_id = ? ORDER BY track_number ASC, title ASC`)
        .all(body.albumId) as { id: string }[];

      if (tracks.length === 0) return c.body(null, 204);

      const queue = getQueue(db, sessionId);
      let pos = queue.length;
      let ver = version;

      const events = tracks.map((t) => ({
        type: "TrackQueued",
        data: { trackId: t.id, position: pos++ },
      }));

      appendEvents(`session:${sessionId}`, events, ver, correlationId);
      break;
    }
    case "remove": {
      if (!body.trackId) return c.text("trackId required", 400);

      appendEvents(
        `session:${sessionId}`,
        [{ type: "TrackDequeued", data: { trackId: body.trackId } }],
        version,
        correlationId
      );
      break;
    }
    case "clear": {
      appendEvents(
        `session:${sessionId}`,
        [{ type: "QueueCleared", data: {} }],
        version,
        correlationId
      );
      break;
    }
    case "next":
    case "prev": {
      // These are handled by the playback route
      return c.body(null, 204);
    }
    default:
      return c.text(`Unknown action: ${body.action}`, 400);
  }

  return c.body(null, 204);
});

/**
 * POST /s/:id/queue/reorder
 * Body: { trackIds: string[] }
 */
router.post("/s/:id/queue/reorder", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const body = await c.req.json<{ trackIds: string[] }>().catch(() => null);
  if (!Array.isArray(body?.trackIds)) return c.text("trackIds array required", 400);

  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "QueueReordered", data: { trackIds: body!.trackIds } }],
    version,
    correlationId
  );

  return c.body(null, 204);
});

export default router;
