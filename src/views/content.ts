import type { SessionRow } from "../projections/session";
import { renderLibrary } from "./library";
import { renderAlbum } from "./album";
import { renderArtist } from "./artist";
import { renderSearchResults } from "./search-results";

export function renderView(sessionId: string, session: SessionRow): string {
  const viewData = JSON.parse(session.current_view_data) as Record<string, string>;

  switch (session.current_view) {
    case "library":
      return renderLibrary(sessionId);
    case "album":
      return renderAlbum(sessionId, viewData.albumId ?? "");
    case "artist":
      return renderArtist(sessionId, viewData.artistId ?? "");
    case "search":
      return renderSearchResults(sessionId, viewData.searchId ?? "");
    default:
      return renderLibrary(sessionId);
  }
}
