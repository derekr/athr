import { Hono } from "hono";
import { db } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderMiniPlayerPage } from "../views/mini-player";

const router = new Hono();

/** GET /s/:id/mini — Mini player popup page */
router.get("/s/:id/mini", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.redirect("/");
  return c.html(renderMiniPlayerPage(sessionId));
});

export default router;
