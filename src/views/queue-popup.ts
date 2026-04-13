import { db } from "../app";
import { getQueue } from "../projections/queue";
import { getPlaybackProjection } from "../projections/playback";
import { formatDuration } from "./player-chrome";

const DATASTAR_CDN =
  "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.8/bundles/datastar.min.js";

interface QueueTrack {
  track_id: string;
  position: number;
  title: string;
  artist_name: string;
  duration_ms: number;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderQueuePage(sessionId: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>athr — Queue</title>
  <script type="module" src="${DATASTAR_CDN}"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --surface2: #242424;
      --border: #333; --text: #e8e8e8; --text-muted: #888;
      --accent: #7c6af7; color-scheme: dark;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border); }
    .header h1 { font-size: 16px; }
    .header button { background: none; border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); padding: 4px 12px; cursor: pointer; font-size: 12px; }
    .queue-list { overflow-y: auto; height: calc(100vh - 56px); }
    .queue-item { display: grid; grid-template-columns: 32px 1fr auto auto; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
    .queue-item.current { background: color-mix(in srgb, var(--accent) 15%, transparent); }
    .queue-item.current .pos { color: var(--accent); }
    .queue-item .pos { color: var(--text-muted); font-size: 12px; text-align: center; }
    .queue-item .info { min-width: 0; }
    .queue-item .title { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
    .queue-item .artist { display: block; font-size: 12px; color: var(--text-muted); }
    .queue-item .duration { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .queue-item .actions button { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; font-size: 14px; }
    .queue-item .actions button:hover { color: var(--text); }
    .empty { padding: 48px 16px; text-align: center; color: var(--text-muted); }
  </style>
</head>
<body data-init="@get('/s/${sessionId}/queue/sse')">
  <div class="header">
    <h1>Queue</h1>
    <button data-on:click__prevent="@post('/s/${sessionId}/queue/clear')">
      Clear All
    </button>
  </div>
  <div id="queue-list">
    ${renderQueueList(sessionId)}
  </div>
</body>
</html>`;
}

export function renderQueueList(sessionId: string): string {
  const queue = getQueue(db, sessionId);
  const playback = getPlaybackProjection(db, sessionId);
  const currentTrackId = playback?.track_id;

  if (queue.length === 0) {
    return `<div class="empty">Queue is empty</div>`;
  }

  // Get track info for all queued tracks
  const tracks = queue.map((item) => {
    const track = db
      .prepare(
        `SELECT t.id, t.title, t.duration_ms, ar.name as artist_name
         FROM tracks t JOIN artists ar ON t.artist_id = ar.id
         WHERE t.id = ?`
      )
      .get(item.track_id) as QueueTrack | null;
    return track
      ? { ...track, track_id: track.id, position: item.position }
      : { track_id: item.track_id, position: item.position, title: "Unknown", artist_name: "Unknown", duration_ms: 0 };
  });

  return `<div class="queue-list">
    ${tracks
      .map(
        (track) => /* html */ `
      <div class="queue-item ${track.track_id === currentTrackId ? "current" : ""}">
        <div class="pos">${track.position + 1}</div>
        <div class="info">
          <span class="title">${escHtml(track.title)}</span>
          <span class="artist">${escHtml(track.artist_name)}</span>
        </div>
        <div class="duration">${formatDuration(track.duration_ms)}</div>
        <div class="actions">
          <button
            data-on:click__prevent="@post('/s/${sessionId}/play/${track.track_id}')"
            title="Play">▶</button>
          <button
            data-on:click__prevent="@post('/s/${sessionId}/queue/remove/${track.track_id}')"
            title="Remove">✕</button>
        </div>
      </div>
    `
      )
      .join("")}
  </div>`;
}
