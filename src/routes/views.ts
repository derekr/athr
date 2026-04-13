import { Hono } from "hono";
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/src/web/serverSentEventGenerator.js";
import { db, appendEvents } from "../app";
import { getSessionProjection } from "../projections/session";
import { getSessionVersion } from "../lib/session-version";

const router = new Hono();

/** Append a ViewChanged event for the session */
function changeView(
  sessionId: string,
  view: string,
  viewData: Record<string, string>,
  correlationId: string
): void {
  const version = getSessionVersion(sessionId);
  appendEvents(
    `session:${sessionId}`,
    [{ type: "ViewChanged", data: { view, viewData } }],
    version,
    correlationId
  );
}

/** Respond to a view navigation POST with an execute-script for URL push */
function respondWithUrlPush(url: string): Response {
  return ServerSentEventGenerator.stream((sse) => {
    sse.executeScript(`history.pushState({}, '', '${url}')`);
  });
}

/** POST /s/:id/view/library */
router.post("/s/:id/view/library", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.text("Session not found", 404);

  changeView(sessionId, "library", {}, c.get("correlationId"));
  return respondWithUrlPush(`/s/${sessionId}/library`);
});

/** POST /s/:id/view/album/:albumId */
router.post("/s/:id/view/album/:albumId", (c) => {
  const sessionId = c.req.param("id");
  const albumId = c.req.param("albumId");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.text("Session not found", 404);

  changeView(sessionId, "album", { albumId }, c.get("correlationId"));
  return respondWithUrlPush(`/s/${sessionId}/album/${albumId}`);
});

/** POST /s/:id/view/artist/:artistId */
router.post("/s/:id/view/artist/:artistId", (c) => {
  const sessionId = c.req.param("id");
  const artistId = c.req.param("artistId");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.text("Session not found", 404);

  changeView(sessionId, "artist", { artistId }, c.get("correlationId"));
  return respondWithUrlPush(`/s/${sessionId}/artist/${artistId}`);
});

/** POST /s/:id/view/search */
router.post("/s/:id/view/search", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.text("Session not found", 404);

  changeView(sessionId, "search", {}, c.get("correlationId"));
  return respondWithUrlPush(`/s/${sessionId}/search`);
});

/** POST /s/:id/view/resolve — Resolve URL path (popstate/back-forward) */
router.post("/s/:id/view/resolve", async (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.text("Session not found", 404);

  const referer = c.req.header("Referer") ?? "";
  const body = await c.req.json<{ path?: string }>().catch(() => ({ path: undefined }));
  const rawPath: string = body.path ?? new URL(referer, "http://localhost").pathname;
  const path = rawPath.replace(`/s/${sessionId}`, "");

  const correlationId = c.get("correlationId");

  const albumMatch = path.match(/^\/album\/(.+)$/);
  const artistMatch = path.match(/^\/artist\/(.+)$/);
  const searchMatch = path.match(/^\/search\/(.+)$/);

  if (albumMatch) {
    changeView(sessionId, "album", { albumId: albumMatch[1] }, correlationId);
  } else if (artistMatch) {
    changeView(sessionId, "artist", { artistId: artistMatch[1] }, correlationId);
  } else if (searchMatch) {
    changeView(sessionId, "search", { searchId: searchMatch[1] }, correlationId);
  } else {
    changeView(sessionId, "library", {}, correlationId);
  }

  return c.body(null, 204);
});

export default router;
