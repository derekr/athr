import { Hono } from "hono";
import { log } from "evlog";
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/src/web/serverSentEventGenerator.js";
import { db, appendEvents } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderSettingsPage } from "../views/settings";
import { readConfig, updateConfig } from "../lib/config";
import { scanMusicDirectory } from "../lib/music-scanner";
import { watchMusicDirectory } from "../lib/music-watcher";
import { getSessionVersion } from "../lib/session-version";

const router = new Hono();

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

  const dbPath = process.env.DATABASE_PATH ?? "athr.db";
  void scanMusicDirectory(musicDir, db).then((result) => {
    log.info({ action: "rescan_complete", tracks: result.tracks, albums: result.albums, artists: result.artists });
    if (result.errors.length > 0) {
      log.warn({ action: "rescan_errors", errors: result.errors });
    }
    // Restart watcher on new directory
    watchMusicDirectory(musicDir, dbPath);
  });

  return ServerSentEventGenerator.stream(c.req.raw, (sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Saved! Scanning library…</div>`
    );
  });
});

/** POST /s/:id/settings/rescan — Rescan library without changing settings */
router.post("/s/:id/settings/rescan", (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const config = readConfig();
  const musicDir = config.dir;
  if (!musicDir) {
    return ServerSentEventGenerator.stream((sse) => {
      sse.patchElements(
        `<div id="feedback" style="color: #ef4444; font-size: 13px; margin-top: 12px;">No music directory configured.</div>`
      );
    });
  }

  void scanMusicDirectory(musicDir, db).then((result) => {
    log.info({ action: "manual_rescan_complete", tracks: result.tracks, albums: result.albums, artists: result.artists });
  });

  return ServerSentEventGenerator.stream((sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Rescanning library…</div>`
    );
  });
});

export default router;
