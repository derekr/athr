import { html, raw } from "hono/html";
import { db } from "../app";
import { getPlaybackProjection } from "../projections/playback";
import { formatDuration } from "./player-chrome";

interface ArtistRow {
  id: string;
  name: string;
}

interface AlbumRow {
  id: string;
  title: string;
  year: number | null;
}

interface TrackRow {
  id: string;
  title: string;
  track_number: number | null;
  duration_ms: number;
  album_title: string;
  album_id: string;
}

export function renderArtist(sessionId: string, artistId: string): string {
  if (!artistId) {
    return html`<div class="empty-state"><div class="icon">👤</div><h2>Artist not found</h2></div>`.toString();
  }

  const artist = db
    .prepare(`SELECT id, name FROM artists WHERE id = ?`)
    .get(artistId) as ArtistRow | null;

  if (!artist) {
    return html`<div class="empty-state"><div class="icon">👤</div><h2>Artist not found</h2></div>`.toString();
  }

  const playback = getPlaybackProjection(db, sessionId);
  const currentTrackId = playback?.track_id ?? "";

  const albums = db
    .prepare(
      `SELECT id, title, year FROM albums WHERE artist_id = ? ORDER BY year ASC, title ASC`
    )
    .all(artistId) as AlbumRow[];

  const tracks = db
    .prepare(
      `SELECT t.id, t.title, t.track_number, t.duration_ms, al.title as album_title, al.id as album_id
       FROM tracks t JOIN albums al ON t.album_id = al.id
       WHERE t.artist_id = ?
       ORDER BY al.year ASC, t.track_number ASC, t.title ASC`
    )
    .all(artistId) as TrackRow[];

  return html`
    <div class="view-header">
      <div style="display: flex; align-items: center; gap: 24px; margin-bottom: 24px;">
        <div style="width: 80px; height: 80px; background: var(--surface2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 36px; flex-shrink: 0;">👤</div>
        <div>
          <h1>${artist.name}</h1>
          <div style="color: var(--text-muted); margin-top: 4px;">${raw(`${albums.length} album${albums.length !== 1 ? "s" : ""} · ${tracks.length} track${tracks.length !== 1 ? "s" : ""}`)}</div>
        </div>
      </div>
    </div>

    ${
      albums.length > 0
        ? html`
      <section style="margin-bottom: 32px;">
        <h2 style="font-size: 16px; margin-bottom: 16px; color: var(--text-muted);">Albums</h2>
        <div class="grid">
          ${albums.map(
              (album) => html`
            <div class="grid-card"
                 data-on:click__prevent="@post('/s/${sessionId}/view/album/${album.id}')">
              <div class="cover">💿</div>
              <div class="card-info">
                <div class="card-title">${album.title}</div>
                <div class="card-subtitle">${album.year ?? ""}</div>
              </div>
            </div>
          `
            )}
        </div>
      </section>
    `
        : ""
    }

    <section>
      <h2 style="font-size: 16px; margin-bottom: 16px; color: var(--text-muted);">All Tracks</h2>
      <div class="track-list">
        ${tracks.map(
            (track) => html`
          <div class="track-row${raw(track.id === currentTrackId ? " now-playing" : "")}"
               data-on:dblclick__prevent="@post('/s/${sessionId}/play/${track.id}')">
            <div class="track-num">♪</div>
            <div class="track-info">
              <span class="track-name">${track.title}</span>
              <span class="track-meta">${track.album_title}</span>
            </div>
            <div class="track-duration">${formatDuration(track.duration_ms)}</div>
            <div class="track-actions">
              <button data-on:click__prevent.stop="@post('/s/${sessionId}/play/${track.id}')">▶</button>
              <button data-on:click__prevent.stop="@post('/s/${sessionId}/queue/add/${track.id}')">+</button>
            </div>
          </div>
        `
          )}
      </div>
    </section>
  `.toString();
}
