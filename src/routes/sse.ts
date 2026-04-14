import { Hono } from "hono";
import { db } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderView } from "../views/content";
import { renderPlayerChrome } from "../views/player-chrome";
import { renderQueueList } from "../views/queue-popup";
import { renderMiniChrome } from "../views/mini-player";
import { getPlaybackProjection } from "../projections/playback";
import type { BusEvent } from "../events/bus";
import { patchElements, patchSignals } from "../lib/sse";
import { createSSEStream } from "../lib/sse-stream";

const router = new Hono();

// ── Event handlers (main window) ────────────────────────────

interface Writer {
  write(data: string): Promise<unknown>;
}

async function onViewChanged(s: Writer, sessionId: string): Promise<void> {
  const session = getSessionProjection(db, sessionId);
  if (!session) return;
  await s.write(patchElements(renderView(sessionId, session), "#content", "inner"));

  // Update nav active states
  const v = session.current_view;
  const libClass = ["library", "album", "artist"].includes(v) ? "active" : "";
  const searchClass = v === "search" ? "active" : "";
  await s.write(patchElements(
    `<a id="nav-library" href="/s/${sessionId}/library" data-on:click__prevent="@post('/s/${sessionId}/view/library')" class="${libClass}">Library</a>`,
    "#nav-library", "outer"
  ));
  await s.write(patchElements(
    `<a id="nav-search" href="/s/${sessionId}/search" data-on:click__prevent="@post('/s/${sessionId}/view/search')" class="${searchClass}">Search</a>`,
    "#nav-search", "outer"
  ));
}

async function onPlaybackStartedMain(s: Writer, sessionId: string, event: BusEvent): Promise<void> {
  await s.write(patchElements(renderPlayerChrome(sessionId), "#player-chrome", "inner"));

  const session = getSessionProjection(db, sessionId);
  if (session) {
    await s.write(patchElements(renderView(sessionId, session), "#content", "inner"));
  }

  const data = event.data as { trackId: string; positionMs: number };
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
}

async function onPlaybackPausedMain(s: Writer, sessionId: string): Promise<void> {
  await s.write(patchElements(renderPlayerChrome(sessionId), "#player-chrome", "inner"));
  await s.write(patchSignals({ _isPlaying: false }));
}

async function onPlaybackResumedMain(s: Writer, sessionId: string): Promise<void> {
  await s.write(patchElements(renderPlayerChrome(sessionId), "#player-chrome", "inner"));
  await s.write(patchSignals({ _isPlaying: true }));
}

async function onPlaybackSeekedMain(s: Writer, event: BusEvent): Promise<void> {
  const data = event.data as { positionMs: number };
  await s.write(patchSignals({ _seekTo: data.positionMs }));
}

async function onVolumeChangedMain(s: Writer, sessionId: string, event: BusEvent): Promise<void> {
  const data = event.data as { level: number };
  await s.write(patchSignals({ _volume: data.level }));
  await s.write(patchElements(renderPlayerChrome(sessionId), "#player-chrome", "inner"));
}

async function onQueueChangedMain(s: Writer, sessionId: string): Promise<void> {
  await s.write(patchElements(renderPlayerChrome(sessionId), "#player-chrome", "inner"));
}

async function onSettingsUpdatedMain(s: Writer, sessionId: string): Promise<void> {
  const session = getSessionProjection(db, sessionId);
  if (!session) return;
  await s.write(patchElements(renderView(sessionId, session), "#content", "inner"));
}

async function onCatalogueChangedMain(s: Writer, sessionId: string, eventType: string): Promise<void> {
  // Re-render library view on scan completion (content may have changed)
  if (eventType === "ScanComplete") {
    const session = getSessionProjection(db, sessionId);
    if (session && ["library", "album", "artist"].includes(session.current_view)) {
      await s.write(patchElements(renderView(sessionId, session), "#content", "inner"));
    }
  }
}

// ── Event dispatch ──────────────────────────────────────────

function handleMainEvent(event: BusEvent, s: Writer, sessionId: string): void {
  switch (event.eventType) {
    case "ViewChanged": void onViewChanged(s, sessionId); break;
    case "PlaybackStarted": void onPlaybackStartedMain(s, sessionId, event); break;
    case "PlaybackPaused": void onPlaybackPausedMain(s, sessionId); break;
    case "PlaybackResumed": void onPlaybackResumedMain(s, sessionId); break;
    case "PlaybackSeeked": void onPlaybackSeekedMain(s, event); break;
    case "VolumeChanged": void onVolumeChangedMain(s, sessionId, event); break;
    case "TrackQueued":
    case "TrackDequeued":
    case "QueueReordered":
    case "QueueCleared": void onQueueChangedMain(s, sessionId); break;
    case "SettingsUpdated": void onSettingsUpdatedMain(s, sessionId); break;
  }
}

function handleMiniEvent(event: BusEvent, s: Writer, sessionId: string): void {
  const miniEvents = [
    "PlaybackStarted", "PlaybackPaused", "PlaybackResumed",
    "PlaybackSeeked", "PlaybackPositionSynced",
  ];
  if (miniEvents.includes(event.eventType)) {
    void s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
  }
}

// ── Routes ──────────────────────────────────────────────────

/** Detect caller context from Referer header */
function getSSEContext(referer: string): "main" | "mini" {
  if (referer.includes("/mini")) return "mini";
  return "main";
}

/** GET /s/:id/sse — SSE stream for main window and mini player */
router.get("/s/:id/sse", (c) => {
  const sessionId = c.req.param("id");
  const ctx = getSSEContext(c.req.header("Referer") ?? "");

  return createSSEStream(c, {
    sessionId,
    streamId: `session:${sessionId}`,
    async onInit(s) {
      const session = getSessionProjection(db, sessionId);
      if (!session) return;

      if (ctx === "main") {
        await s.write(patchElements(renderView(sessionId, session), "#content", "inner"));
        await s.write(patchElements(renderPlayerChrome(sessionId), "#player-chrome", "inner"));

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
      } else {
        await s.write(patchElements(renderMiniChrome(sessionId), "#mini-chrome", "inner"));
      }
    },
    onEvent(event, s) {
      if (ctx === "main") {
        handleMainEvent(event, s, sessionId);
      } else {
        handleMiniEvent(event, s, sessionId);
      }
    },
    onGlobalEvent(event, s) {
      if (ctx === "main" && event.streamId === "catalogue") {
        void onCatalogueChangedMain(s, sessionId, event.eventType);
      }
    },
  });
});

/** GET /s/:id/queue/sse — Queue popup SSE stream */
router.get("/s/:id/queue/sse", (c) => {
  const sessionId = c.req.param("id");
  const queueEvents = new Set([
    "TrackQueued", "TrackDequeued", "QueueReordered", "QueueCleared", "PlaybackStarted",
    "PlaybackPaused", "PlaybackResumed",
  ]);

  return createSSEStream(c, {
    sessionId,
    streamId: `session:${sessionId}`,
    async onInit(s) {
      const session = getSessionProjection(db, sessionId);
      if (!session) return;
      await s.write(patchElements(renderQueueList(sessionId), "#queue-list", "inner"));
    },
    onEvent(event, s) {
      if (queueEvents.has(event.eventType)) {
        void s.write(patchElements(renderQueueList(sessionId), "#queue-list", "inner"));
      }
    },
  });
});

export default router;
