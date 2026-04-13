import { Hono } from "hono";
import { db, appendEvents } from "../app";
import { getSessionProjection } from "../projections/session";
import { getQueue } from "../projections/queue";
import { getTrack } from "../projections/catalogue";
import { renderQueuePage } from "../views/queue-popup";
import { getSessionVersion } from "../lib/session-version";

const router = new Hono();

/** GET /s/:id/queue — Queue popup page */
router.get("/s/:id/queue", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.redirect("/");
  return c.html(renderQueuePage(sessionId));
});

/** POST /s/:id/queue/add/:trackId — Add a track to queue */
router.post("/s/:id/queue/add/:trackId", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const trackId = c.req.param("trackId");
  const track = getTrack(db, trackId);
  if (!track) return c.text("Track not found", 404);

  const queue = getQueue(db, sessionId);
  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "TrackQueued", data: { trackId, position: queue.length } }],
    version,
    correlationId
  );
  return c.body(null, 204);
});

/** POST /s/:id/queue/add-album/:albumId — Add all tracks from an album to queue */
router.post("/s/:id/queue/add-album/:albumId", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const albumId = c.req.param("albumId");
  const tracks = db
    .prepare(`SELECT id FROM tracks WHERE album_id = ? ORDER BY track_number ASC, title ASC`)
    .all(albumId) as { id: string }[];

  if (tracks.length === 0) return c.body(null, 204);

  const queue = getQueue(db, sessionId);
  let pos = queue.length;
  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  const events = tracks.map((t) => ({
    type: "TrackQueued",
    data: { trackId: t.id, position: pos++ },
  }));

  appendEvents(`session:${sessionId}`, events, version, correlationId);
  return c.body(null, 204);
});

/** POST /s/:id/queue/remove/:trackId — Remove a track from queue */
router.post("/s/:id/queue/remove/:trackId", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const trackId = c.req.param("trackId");
  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "TrackDequeued", data: { trackId } }],
    version,
    correlationId
  );
  return c.body(null, 204);
});

/** POST /s/:id/queue/clear — Clear the queue */
router.post("/s/:id/queue/clear", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "QueueCleared", data: {} }],
    version,
    correlationId
  );
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
