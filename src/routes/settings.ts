import { Hono } from "hono";
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/src/web/serverSentEventGenerator.js";
import { db, appendEvents } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderSettingsPage } from "../views/settings";
import { readConfig, updateConfig } from "../lib/config";
import { scanInWorker, watchMusicDirectory } from "../lib/music-watcher";
import { getSessionVersion } from "../lib/session-version";

const router = new Hono();

const dbPath = process.env.DATABASE_PATH ?? "athr.db";

/** GET /s/:id/settings — Settings popup page */
router.get("/s/:id/settings", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.redirect("/");

  return c.html(renderSettingsPage(sessionId));
});

/** POST /s/:id/settings/update — Update a setting and rescan */
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

  // Fire-and-forget — progress/completion events will push via SSE
  void scanInWorker(musicDir, dbPath).then(() => {
    watchMusicDirectory(musicDir, dbPath);
  });

  return ServerSentEventGenerator.stream((sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Saved! Scanning library…</div>`
    );
  });
});

/** POST /s/:id/settings/rescan — Rescan library */
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

  void scanInWorker(musicDir, dbPath);

  return ServerSentEventGenerator.stream((sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Scanning… Library will update in real time.</div>`
    );
  });
});

/** POST /s/:id/settings/clear-rescan — Clear library and rescan from scratch */
router.post("/s/:id/settings/clear-rescan", (c) => {
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

  void scanInWorker(musicDir, dbPath, true);

  return ServerSentEventGenerator.stream((sse) => {
    sse.patchElements(
      `<div id="feedback" style="color: #4ade80; font-size: 13px; margin-top: 12px;">Cleared! Rescanning from scratch…</div>`
    );
  });
});

export default router;
