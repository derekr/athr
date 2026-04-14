import { html, raw } from "hono/html";
import { db } from "../app";
import { getPlaybackProjection } from "../projections/playback";
import { getSearchProjection } from "../projections/search";
import { formatDuration } from "./player-chrome";

interface SearchResultTrack {
  id: string;
  title: string;
  duration_ms: number;
  album_title: string;
  album_id: string;
  artist_name: string;
  artist_id: string;
  year: number | null;
}

export function renderSearchResults(
  sessionId: string,
  searchId: string
): string {
  if (!searchId) {
    return renderSearchEmpty(sessionId, "");
  }

  const search = getSearchProjection(db, searchId);
  if (!search) {
    return renderSearchEmpty(sessionId, "");
  }

  const results = JSON.parse(search.results) as SearchResultTrack[];
  const playback = getPlaybackProjection(db, sessionId);
  const currentTrackId = playback?.track_id ?? "";

  return html`
    <div class="search-view">
      <div class="search-bar">
        <input
          type="text"
          value="${search.query}"
          placeholder="Search tracks, albums, artists..."
          data-on:input="@post('/s/${sessionId}/searches/${searchId}?q=' + encodeURIComponent(el.value))"
        />
      </div>

      ${
        results.length === 0
          ? html`
        <div class="empty-state">
          <div class="icon">🔍</div>
          <h2>${search.query ? "No results" : "Search for music"}</h2>
          <p>${search.query ? html`No tracks, albums, or artists found for "${search.query}"` : "Type to search your library"}</p>
        </div>
      `
          : html`
        <div style="margin-bottom: 12px; color: var(--text-muted); font-size: 13px;">
          ${raw(`${results.length} result${results.length !== 1 ? "s" : ""}`)}
        </div>
        <div class="track-list">
          ${results.map(
              (track) => html`
            <div class="track-row${raw(track.id === currentTrackId ? " now-playing" : "")}"
                 data-on:dblclick__prevent="@post('/s/${sessionId}/play/${track.id}')">
              <div class="track-num">♪</div>
              <div class="track-info">
                <span class="track-name">${track.title}</span>
                <span class="track-meta">${track.artist_name} · ${track.album_title}${track.year ? raw(` · ${track.year}`) : ""}</span>
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
      `
      }
    </div>
  `.toString();
}

function renderSearchEmpty(sessionId: string, query: string): string {
  return html`
    <div class="search-view">
      <div class="search-bar">
        <input
          type="text"
          value="${query}"
          placeholder="Search tracks, albums, artists..."
          data-on:input="@post('/s/${sessionId}/searches?q=' + encodeURIComponent(el.value))"
        />
      </div>
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h2>Search your library</h2>
        <p>Find tracks, albums, and artists</p>
      </div>
    </div>
  `.toString();
}
