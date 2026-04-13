import { db } from "../app";
import { getPlaybackProjection, estimatePositionMs } from "../projections/playback";
import { escHtml } from "./library";

interface TrackRow {
  id: string;
  title: string;
  artist_id: string;
  album_id: string;
  duration_ms: number;
}

interface ArtistRow {
  id: string;
  name: string;
}

interface AlbumRow {
  id: string;
  title: string;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function renderPlayerChrome(sessionId: string): string {
  const playback = getPlaybackProjection(db, sessionId);
  if (!playback || !playback.track_id) {
    return renderEmptyPlayer(sessionId);
  }

  const track = db
    .prepare(`SELECT id, title, artist_id, album_id, duration_ms FROM tracks WHERE id = ?`)
    .get(playback.track_id) as TrackRow | null;

  if (!track) {
    return renderEmptyPlayer(sessionId);
  }

  const artist = db
    .prepare(`SELECT id, name FROM artists WHERE id = ?`)
    .get(track.artist_id) as ArtistRow | null;

  const album = db
    .prepare(`SELECT id, title FROM albums WHERE id = ?`)
    .get(track.album_id) as AlbumRow | null;

  const positionMs = estimatePositionMs(playback);
  const progressPct =
    track.duration_ms > 0
      ? Math.min(100, (positionMs / track.duration_ms) * 100)
      : 0;

  const isPlaying = playback.is_playing === 1;

  return /* html */ `
    <div class="player-transport">
      <button
        data-on:click__prevent="@post('/s/${sessionId}/playback/prev')"
        title="Previous">⏮</button>
      <button
        data-on:click__prevent="@post('/s/${sessionId}/playback/${isPlaying ? "pause" : "resume"}')"
        title="${isPlaying ? "Pause" : "Play"}">
        ${isPlaying ? "⏸" : "▶"}
      </button>
      <button
        data-on:click__prevent="@post('/s/${sessionId}/playback/next')"
        title="Next">⏭</button>
    </div>

    <img src="/cover/${track.album_id}" alt="" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover; background: var(--surface2);" />

    <div class="player-track-info">
      <span class="track-title">${escHtml(track.title)}</span>
      <span class="track-artist">${escHtml(artist?.name ?? "Unknown")} — ${escHtml(album?.title ?? "Unknown")}</span>
    </div>

    <div class="player-progress">
      <span class="time-label" id="time-pos">${formatDuration(positionMs)}</span>
      <div class="progress-track"
           data-on:click__prevent="
             const rect = el.getBoundingClientRect();
             const pct = (evt.clientX - rect.left) / rect.width;
             @post('/s/${sessionId}/playback/seek/' + Math.floor(pct * ${track.duration_ms}))
           ">
        <div class="progress-fill" id="progress-fill" style="width: ${progressPct.toFixed(2)}%;"></div>
      </div>
      <span class="time-label" id="time-dur">${formatDuration(track.duration_ms)}</span>
    </div>

    <div class="player-volume">
      <span>🔊</span>
      <input type="range" min="0" max="100" value="${Math.round(playback.volume * 100)}"
             data-on:input__throttle.500ms="@post('/s/${sessionId}/volume/' + (el.value / 100))" />
    </div>
  `;
}

function renderEmptyPlayer(sessionId: string): string {
  return /* html */ `
    <div class="player-transport">
      <button disabled>⏮</button>
      <button disabled>▶</button>
      <button disabled>⏭</button>
    </div>
    <div class="player-track-info">
      <span class="track-title" style="color: var(--text-muted);">Nothing playing</span>
    </div>
    <div class="player-progress">
      <span class="time-label">0:00</span>
      <div class="progress-track">
        <div class="progress-fill" style="width: 0%;"></div>
      </div>
      <span class="time-label">0:00</span>
    </div>
    <div class="player-volume">
      <span>🔊</span>
      <input type="range" min="0" max="100" value="100"
             data-on:input__throttle.500ms="@post('/s/${sessionId}/volume/' + (el.value / 100))" />
    </div>
  `;
}
