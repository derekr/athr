import { Hono } from "hono";
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/src/web/serverSentEventGenerator.js";
import { db, appendEvents, eventStore } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderSettingsPage } from "../views/settings";
import { updateConfig } from "../lib/config";
import { scanMusicDirectory } from "../lib/music-scanner";

const router = new Hono();

function getSessionVersion(sessionId: string): number {
  const events = eventStore.getStream(`session:${sessionId}`);
  return events.length > 0 ? events[events.length - 1].streamVersion : -1;
}

/** GET /s/:id/settings — Settings popup page */
router.get("/s/:id/settings", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.redirect("/");

  return c.html(renderSettingsPage(sessionId));
});

/** POST /s/:id/settings/update — Update a setting */
router.post("/s/:id/settings/update", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const body = await c.req
    .json<{ key: string; value: unknown }>()
    .catch(() => null);

  if (!body?.key) return c.text("key required", 400);

  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "SettingsUpdated", data: { key: body.key, value: body.value } }],
    version,
    correlationId
  );

  // Persist to config file
  updateConfig(body.key, body.value);

  // If the music directory changed, trigger a rescan
  if (body.key === "dir" && typeof body.value === "string") {
    void scanMusicDirectory(body.value, db).then((result) => {
      console.log(
        `Rescan complete: ${result.tracks} tracks, ${result.albums} albums, ${result.artists} artists`
      );
      if (result.errors.length > 0) {
        console.warn(`Scan errors: ${result.errors.join(", ")}`);
      }
    });
  }

  return ServerSentEventGenerator.stream((sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Saved!</div>`,
      { selector: "#feedback", mode: "outer" }
    );
  });
});

export default router;
