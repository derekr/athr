import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db, eventBus } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderView } from "../views/content";
import { renderPlayerChrome } from "../views/player-chrome";
import { renderQueueList } from "../views/queue-popup";
import { renderMiniChrome } from "../views/mini-player";
import { getPlaybackProjection } from "../projections/playback";
import type { BusEvent } from "../events/bus";

const router = new Hono();

function patchElements(
  html: string,
  selector: string,
  mode: "inner" | "outer" = "inner"
): string {
  const lines = [`event: datastar-patch-elements`];
  lines.push(`data: selector ${selector}`);
  if (mode !== "outer") lines.push(`data: mode ${mode}`);
  for (const line of html.split("\n")) {
    lines.push(`data: elements ${line}`);
  }
  lines.push("", "");
  return lines.join("\n");
}

function patchSignals(signals: Record<string, unknown>): string {
  const lines = [`event: datastar-patch-signals`];
  lines.push(`data: signals ${JSON.stringify(signals)}`);
  lines.push("", "");
  return lines.join("\n");
}

/** GET /s/:id/sse — Main SSE stream for a session */
router.get("/s/:id/sse", (c) => {
  const sessionId = c.req.param("id");

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {

    const session = getSessionProjection(db, sessionId);
    if (!session) {
      await s.close();
      return;
    }

    // Send initial state immediately on connect
    const contentHtml = renderView(sessionId, session);
    await s.write(patchElements(contentHtml, "#content", "inner"));

    const playerHtml = renderPlayerChrome(sessionId);
    await s.write(patchElements(playerHtml, "#player-chrome", "inner"));

    // Push initial audio signals
    const playback = getPlaybackProjection(db, sessionId);
    if (playback?.track_id) {
      await s.write(
        patchSignals({
          _trackUrl: `/audio/${playback.track_id}`,
          _isPlaying: playback.is_playing === 1,
          _seekTo: playback.position_ms,
          _volume: playback.volume,
        })
      );
    }

    let closed = false;

    // Subscribe to session events via EventBus
    const unsub = eventBus.subscribeStream(
      `session:${sessionId}`,
      (event: BusEvent) => {
        if (closed) return;
        console.log(`[sse] event received: ${event.eventType} for ${sessionId}`);
        void handleEvent(event, s, sessionId);
      }
    );
    console.log(`[sse] subscribed to session:${sessionId}`);

    // Heartbeat keeps SSE connection alive (Bun idleTimeout)
    const heartbeat = setInterval(() => {
      if (closed) return;
      void s.write(": heartbeat\n\n");
    }, 15_000);

    // Keep alive until client disconnects
    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });

    closed = true;
    clearInterval(heartbeat);
    unsub();
  });
});

interface Writer {
  write(data: string): Promise<unknown>;
}

async function handleEvent(
  event: BusEvent,
  s: Writer,
  sessionId: string
): Promise<void> {
  switch (event.eventType) {
    case "ViewChanged": {
      const session = getSessionProjection(db, sessionId);
      if (!session) return;
      const contentHtml = renderView(sessionId, session);
      await s.write(patchElements(contentHtml, "#content", "inner"));
      break;
    }
    case "PlaybackStarted": {
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      await s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
      // Re-render content so now-playing indicator updates
      const session = getSessionProjection(db, sessionId);
      if (session) {
        const contentHtml = renderView(sessionId, session);
        await s.write(patchElements(contentHtml, "#content", "inner"));
      }
      const data = event.data as { trackId: string; positionMs: number };
      // Look up track metadata for Media Session
      const trackMeta = db
        .prepare(
          `SELECT t.title, t.album_id, ar.name as artist_name, al.title as album_title
           FROM tracks t
           JOIN artists ar ON t.artist_id = ar.id
           JOIN albums al ON t.album_id = al.id
           WHERE t.id = ?`
        )
        .get(data.trackId) as { title: string; album_id: string; artist_name: string; album_title: string } | null;
      await s.write(
        patchSignals({
          _trackUrl: `/audio/${data.trackId}`,
          _isPlaying: true,
          _seekTo: data.positionMs ?? 0,
          _mediaTitle: trackMeta?.title ?? "",
          _mediaArtist: trackMeta?.artist_name ?? "",
          _mediaAlbum: trackMeta?.album_title ?? "",
          _mediaArtwork: trackMeta ? `/cover/${trackMeta.album_id}` : "",
        })
      );
      break;
    }
    case "PlaybackPaused": {
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      await s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
      await s.write(patchSignals({ _isPlaying: false }));
      break;
    }
    case "PlaybackResumed": {
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      await s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
      await s.write(patchSignals({ _isPlaying: true }));
      break;
    }
    case "PlaybackSeeked": {
      const data = event.data as { positionMs: number };
      await s.write(patchSignals({ _seekTo: data.positionMs }));
      await s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
      break;
    }
    case "PlaybackPositionSynced": {
      // Position sync from main window — update mini player only, no _seekTo
      await s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
      break;
    }
    case "VolumeChanged": {
      const data = event.data as { level: number };
      await s.write(patchSignals({ _volume: data.level }));
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      break;
    }
    case "TrackQueued":
    case "TrackDequeued":
    case "QueueReordered":
    case "QueueCleared": {
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      break;
    }
    case "SettingsUpdated": {
      const session = getSessionProjection(db, sessionId);
      if (!session) return;
      const contentHtml = renderView(sessionId, session);
      await s.write(patchElements(contentHtml, "#content", "inner"));
      break;
    }
  }
}

/** GET /s/:id/queue/sse — Queue popup SSE stream */
router.get("/s/:id/queue/sse", (c) => {
  const sessionId = c.req.param("id");

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {

    const session = getSessionProjection(db, sessionId);
    if (!session) { await s.close(); return; }

    // Push initial queue state
    await s.write(patchElements(renderQueueList(sessionId), "#queue-list", "inner"));

    let closed = false;

    const unsub = eventBus.subscribeStream(
      `session:${sessionId}`,
      (event: BusEvent) => {
        if (closed) return;
        const queueEvents = [
          "TrackQueued", "TrackDequeued", "QueueReordered", "QueueCleared", "PlaybackStarted"
        ];
        if (queueEvents.includes(event.eventType)) {
          void s.write(patchElements(renderQueueList(sessionId), "#queue-list", "inner"));
        }
      }
    );

    const heartbeat = setInterval(() => {
      if (closed) return;
      void s.write(": heartbeat\n\n");
    }, 15_000);

    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });

    closed = true;
    clearInterval(heartbeat);
    unsub();
  });
});

export default router;
