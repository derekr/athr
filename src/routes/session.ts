import { Hono } from "hono";
import { db, appendEvents, eventStore } from "../app";
import { newSessionId } from "../lib/ids";
import { getSessionProjection } from "../projections/session";
import { renderShell } from "../views/shell";

const router = new Hono();

/** GET / — Create a new session and redirect to it */
router.get("/", (c) => {
  const sessionId = newSessionId();
  const correlationId = c.get("correlationId");

  appendEvents(
    `session:${sessionId}`,
    [{ type: "SessionCreated", data: {} }],
    -1,
    correlationId
  );

  return c.redirect(`/s/${sessionId}`);
});

/** GET /s/:id — Load session and render shell */
router.get("/s/:id", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);

  // Session not found — redirect to create a new one
  if (!session) {
    return c.redirect("/");
  }

  const html = renderShell(sessionId, session);
  return c.html(html);
});

/** GET /s/:id/* — Deep link support: resolve path to view */
router.get("/s/:id/*", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);

  if (!session) {
    return c.redirect("/");
  }

  // Parse the sub-path to resolve the view
  const path = c.req.path;
  const subPath = path.slice(`/s/${sessionId}`.length);

  let targetView = session.current_view;
  let targetViewData: Record<string, string> = JSON.parse(
    session.current_view_data
  ) as Record<string, string>;

  const albumMatch = subPath.match(/^\/album\/(.+)$/);
  const artistMatch = subPath.match(/^\/artist\/(.+)$/);
  const searchMatch = subPath.match(/^\/search\/(.+)$/);

  if (subPath === "/library" || subPath === "/") {
    targetView = "library";
    targetViewData = {};
  } else if (albumMatch) {
    targetView = "album";
    targetViewData = { albumId: albumMatch[1] };
  } else if (artistMatch) {
    targetView = "artist";
    targetViewData = { artistId: artistMatch[1] };
  } else if (searchMatch) {
    targetView = "search";
    targetViewData = { searchId: searchMatch[1] };
  }

  // If we need to change the view, emit an event
  if (
    targetView !== session.current_view ||
    JSON.stringify(targetViewData) !== session.current_view_data
  ) {
    const correlationId = c.get("correlationId");
    const streamEvents = eventStore.getStream(`session:${sessionId}`);
    const currentVersion = streamEvents.length > 0
      ? streamEvents[streamEvents.length - 1].streamVersion
      : -1;

    appendEvents(
      `session:${sessionId}`,
      [{ type: "ViewChanged", data: { view: targetView, viewData: targetViewData } }],
      currentVersion,
      correlationId
    );
  }

  const updatedSession = getSessionProjection(db, sessionId)!;
  const html = renderShell(sessionId, updatedSession);
  return c.html(html);
});

export default router;
