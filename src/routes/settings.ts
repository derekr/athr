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

  const reader = await ServerSentEventGenerator.readSignals(c.req.raw);
  if (!reader.success) return c.text(reader.error ?? "Bad signals", 400);

  const signals = (reader.signals ?? {}) as { musicDir?: string };
  const musicDir = signals.musicDir?.trim() ?? "";

  if (!musicDir) return c.text("musicDir signal required", 400);

  const correlationId = c.get("correlationId");
  const version = getSessionVersion(sessionId);

  appendEvents(
    `session:${sessionId}`,
    [{ type: "SettingsUpdated", data: { key: "dir", value: musicDir } }],
    version,
    correlationId
  );

  updateConfig("dir", musicDir);

  void scanMusicDirectory(musicDir, db).then((result) => {
    console.log(
      `Rescan complete: ${result.tracks} tracks, ${result.albums} albums, ${result.artists} artists`
    );
    if (result.errors.length > 0) {
      console.warn(`Scan errors: ${result.errors.join(", ")}`);
    }
  });

  return ServerSentEventGenerator.stream(c.req.raw, (sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Saved! Scanning library…</div>`
    );
  });
});

export default router;
