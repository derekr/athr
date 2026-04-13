import { db } from "../app";
import { getPlaybackProjection } from "../projections/playback";
import { escHtml } from "./library";
import { formatDuration } from "./player-chrome";

interface TrackRow {
  id: string;
  title: string;
  track_number: number | null;
  duration_ms: number;
  artist_name: string;
  album_title: string;
  album_id: string;
  artist_id: string;
}

interface AlbumRow {
  id: string;
  title: string;
  artist_name: string;
  artist_id: string;
  year: number | null;
}

export function renderAlbum(sessionId: string, albumId: string): string {
  if (!albumId) {
    return `<div class="empty-state"><div class="icon">💿</div><h2>Album not found</h2></div>`;
  }

  const album = db
    .prepare(
      `SELECT al.id, al.title, ar.name as artist_name, ar.id as artist_id, al.year
       FROM albums al JOIN artists ar ON al.artist_id = ar.id WHERE al.id = ?`
    )
    .get(albumId) as AlbumRow | null;

  if (!album) {
    return `<div class="empty-state"><div class="icon">💿</div><h2>Album not found</h2></div>`;
  }

  const playback = getPlaybackProjection(db, sessionId);
  const currentTrackId = playback?.track_id ?? "";

  const tracks = db
    .prepare(
      `SELECT t.id, t.title, t.track_number, t.duration_ms,
              ar.name as artist_name, al.title as album_title, al.id as album_id, ar.id as artist_id
       FROM tracks t
       JOIN albums al ON t.album_id = al.id
       JOIN artists ar ON t.artist_id = ar.id
       WHERE t.album_id = ?
       ORDER BY t.track_number ASC, t.title ASC`
    )
    .all(albumId) as TrackRow[];

  return /* html */ `
    <div class="view-header">
      <div style="display: flex; align-items: flex-start; gap: 24px; margin-bottom: 24px;">
        <img src="/cover/${albumId}" alt="${escHtml(album.title)}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: var(--surface2);" />
        <div>
          <h1>${escHtml(album.title)}</h1>
          <div style="margin-top: 4px;">
            <button
              data-on:click__prevent="@post('/s/${sessionId}/view/artist/${album.artist_id}')"
              style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 15px; padding: 0;">
              ${escHtml(album.artist_name)}
            </button>
            ${album.year ? `<span style="color: var(--text-muted)"> · ${album.year}</span>` : ""}
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button
              data-on:click__prevent="@post('/s/${sessionId}/play/${tracks[0]?.id ?? ""}')"
              style="padding: 8px 16px; background: var(--accent); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px;">
              ▶ Play
            </button>
            <button
              data-on:click__prevent="@post('/s/${sessionId}/queue/add-album/${albumId}')"
              style="padding: 8px 16px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); cursor: pointer; font-size: 14px;">
              + Queue All
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="track-list">
      ${tracks
        .map(
          (track, i) => /* html */ `
        <div class="track-row${track.id === currentTrackId ? " now-playing" : ""}"
             data-on:dblclick__prevent="@post('/s/${sessionId}/play/${track.id}')">
          <div class="track-num">${track.track_number ?? i + 1}</div>
          <div class="track-info">
            <span class="track-name">${escHtml(track.title)}</span>
          </div>
          <div class="track-duration">${formatDuration(track.duration_ms)}</div>
          <div class="track-actions">
            <button data-on:click__prevent.stop="@post('/s/${sessionId}/play/${track.id}')">▶</button>
            <button data-on:click__prevent.stop="@post('/s/${sessionId}/queue/add/${track.id}')">+</button>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}
