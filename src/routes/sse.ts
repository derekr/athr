import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db, eventBus } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderView } from "../views/content";
import { renderPlayerChrome } from "../views/player-chrome";
import { renderQueueList } from "../views/queue-popup";
import { getPlaybackProjection } from "../projections/playback";
import type { StoredEvent } from "../events/store";

const router = new Hono();

function sseEvent(eventName: string, data: string): string {
  return `event: ${eventName}\ndata: ${data}\n\n`;
}

function patchElements(
  html: string,
  selector: string,
  mode: "inner" | "outer" = "inner"
): string {
  return sseEvent(
    "datastar-patch-elements",
    JSON.stringify({ elements: html, selector, mode })
  );
}

function patchSignals(signals: Record<string, unknown>): string {
  return sseEvent(
    "datastar-patch-signals",
    JSON.stringify({ signals })
  );
}

/** GET /s/:id/sse — Main SSE stream for a session */
router.get("/s/:id/sse", (c) => {
  const sessionId = c.req.param("id");

  return stream(c, async (s) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

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
          _seekTo: -1,
          _volume: playback.volume,
        })
      );
    }

    let closed = false;

    // Subscribe to session events via EventBus
    const unsub = eventBus.subscribeStream(
      `session:${sessionId}`,
      (event: StoredEvent) => {
        if (closed) return;
        void handleEvent(event, s, sessionId);
      }
    );

    // Keep alive until client disconnects
    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });

    closed = true;
    unsub();
  });
});

interface Writer {
  write(data: string): Promise<unknown>;
}

async function handleEvent(
  event: StoredEvent,
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
      const data = event.data as { trackId: string; positionMs: number };
      await s.write(
        patchSignals({
          _trackUrl: `/audio/${data.trackId}`,
          _isPlaying: true,
          _seekTo: data.positionMs ?? 0,
        })
      );
      break;
    }
    case "PlaybackPaused": {
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      await s.write(patchSignals({ _isPlaying: false }));
      break;
    }
    case "PlaybackResumed": {
      const playerHtml = renderPlayerChrome(sessionId);
      await s.write(patchElements(playerHtml, "#player-chrome", "inner"));
      await s.write(patchSignals({ _isPlaying: true }));
      break;
    }
    case "PlaybackSeeked": {
      const data = event.data as { positionMs: number };
      await s.write(patchSignals({ _seekTo: data.positionMs }));
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

  return stream(c, async (s) => {
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    const session = getSessionProjection(db, sessionId);
    if (!session) { await s.close(); return; }

    // Push initial queue state
    await s.write(patchElements(renderQueueList(sessionId), "#queue-list", "inner"));

    let closed = false;

    const unsub = eventBus.subscribeStream(
      `session:${sessionId}`,
      (event: StoredEvent) => {
        if (closed) return;
        const queueEvents = [
          "TrackQueued", "TrackDequeued", "QueueReordered", "QueueCleared", "PlaybackStarted"
        ];
        if (queueEvents.includes(event.eventType)) {
          void s.write(patchElements(renderQueueList(sessionId), "#queue-list", "inner"));
        }
      }
    );

    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });

    closed = true;
    unsub();
  });
});

export default router;
