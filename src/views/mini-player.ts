import { db } from "../app";
import { getPlaybackProjection, estimatePositionMs } from "../projections/playback";
import { formatDuration } from "./player-chrome";

const DATASTAR_CDN =
  "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.8/bundles/datastar.min.js";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMiniPlayerPage(sessionId: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>athr — Mini Player</title>
  <script type="module" src="${DATASTAR_CDN}"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --surface2: #242424;
      --border: #333; --text: #e8e8e8; --text-muted: #888;
      --accent: #7c6af7; color-scheme: dark;
    }
    body {
      background: var(--bg); color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px; user-select: none;
      height: 100vh; display: flex; flex-direction: column; justify-content: center;
      padding: 12px 16px;
    }
    #mini-chrome { display: flex; flex-direction: column; gap: 8px; }
    .mini-transport { display: flex; align-items: center; justify-content: center; gap: 12px; }
    .mini-transport button {
      background: none; border: none; color: var(--text); cursor: pointer;
      font-size: 16px; padding: 4px; border-radius: 4px;
    }
    .mini-transport button:hover { background: var(--surface2); }
    .mini-transport button.play-pause { font-size: 20px; }
    .mini-info { text-align: center; }
    .mini-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mini-artist { font-size: 11px; color: var(--text-muted); }
    .mini-progress { display: flex; align-items: center; gap: 6px; }
    .time-label { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .progress-track { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s linear; }
  </style>
</head>
<body data-init="@get('/s/${sessionId}/sse')">
  <div id="mini-chrome">
    ${renderMiniChrome(sessionId)}
  </div>
</body>
</html>`;
}

export function renderMiniChrome(sessionId: string): string {
  const playback = getPlaybackProjection(db, sessionId);
  if (!playback?.track_id) {
    return /* html */ `
      <div class="mini-transport">
        <button disabled>⏮</button>
        <button class="play-pause" disabled>▶</button>
        <button disabled>⏭</button>
      </div>
      <div class="mini-info">
        <div class="mini-title" style="color: var(--text-muted)">Nothing playing</div>
      </div>
      <div class="mini-progress">
        <span class="time-label">0:00</span>
        <div class="progress-track"><div class="progress-fill" style="width: 0%"></div></div>
        <span class="time-label">0:00</span>
      </div>
    `;
  }

  const track = db
    .prepare(
      `SELECT t.title, t.duration_ms, ar.name as artist_name
       FROM tracks t JOIN artists ar ON t.artist_id = ar.id WHERE t.id = ?`
    )
    .get(playback.track_id) as { title: string; duration_ms: number; artist_name: string } | null;

  if (!track) return `<div style="color: var(--text-muted)">Track not found</div>`;

  const positionMs = estimatePositionMs(playback);
  const pct = track.duration_ms > 0
    ? Math.min(100, (positionMs / track.duration_ms) * 100)
    : 0;
  const isPlaying = playback.is_playing === 1;

  return /* html */ `
    <div class="mini-transport">
      <button data-on:click__prevent="@post('/s/${sessionId}/playback/prev')" title="Previous">⏮</button>
      <button class="play-pause"
        data-on:click__prevent="@post('/s/${sessionId}/playback/${isPlaying ? "pause" : "resume"}')"
        title="${isPlaying ? "Pause" : "Play"}">
        ${isPlaying ? "⏸" : "▶"}
      </button>
      <button data-on:click__prevent="@post('/s/${sessionId}/playback/next')" title="Next">⏭</button>
    </div>
    <div class="mini-info">
      <div class="mini-title">${escHtml(track.title)}</div>
      <div class="mini-artist">${escHtml(track.artist_name)}</div>
    </div>
    <div class="mini-progress">
      <span class="time-label" id="mini-time-pos">${formatDuration(positionMs)}</span>
      <div class="progress-track">
        <div class="progress-fill" id="mini-progress-fill" style="width: ${pct.toFixed(2)}%"></div>
      </div>
      <span class="time-label" id="mini-time-dur">${formatDuration(track.duration_ms)}</span>
    </div>
  `;
}
