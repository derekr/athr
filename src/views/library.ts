import { db } from "../app";

interface AlbumRow {
  id: string;
  title: string;
  artist_name: string;
  year: number | null;
  cover_path: string | null;
}

interface ArtistRow {
  id: string;
  name: string;
}

export function renderLibrary(sessionId: string): string {
  const albums = db
    .prepare(
      `SELECT al.id, al.title, ar.name as artist_name, al.year, al.cover_path
       FROM albums al
       JOIN artists ar ON al.artist_id = ar.id
       ORDER BY ar.name, al.year, al.title`
    )
    .all() as AlbumRow[];

  const artists = db
    .prepare(`SELECT id, name FROM artists ORDER BY name`)
    .all() as ArtistRow[];

  if (albums.length === 0) {
    return /* html */ `
      <div class="empty-state">
        <div class="icon">🎵</div>
        <h2>No music yet</h2>
        <p>Open Settings to point athr at your music folder.</p>
      </div>
    `;
  }

  return /* html */ `
    <div class="view-header">
      <h1>Library</h1>
    </div>

    <section style="margin-bottom: 32px;">
      <h2 style="font-size: 16px; margin-bottom: 16px; color: var(--text-muted);">Artists</h2>
      <div class="grid">
        ${artists
          .map(
            (artist) => /* html */ `
          <div class="grid-card"
               data-on:click__prevent="@post('/s/${sessionId}/view/artist/${artist.id}')">
            <div class="cover">👤</div>
            <div class="card-info">
              <div class="card-title">${escHtml(artist.name)}</div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </section>

    <section>
      <h2 style="font-size: 16px; margin-bottom: 16px; color: var(--text-muted);">Albums</h2>
      <div class="grid">
        ${albums
          .map(
            (album) => /* html */ `
          <div class="grid-card"
               data-on:click__prevent="@post('/s/${sessionId}/view/album/${album.id}')">
            <div class="cover">💿</div>
            <div class="card-info">
              <div class="card-title">${escHtml(album.title)}</div>
              <div class="card-subtitle">${escHtml(album.artist_name)}${album.year ? ` · ${album.year}` : ""}</div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
