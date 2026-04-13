import { Hono } from "hono";
import { db, appendEvents, eventStore } from "../app";
import { getSessionProjection } from "../projections/session";
import {
  getSearchProjection,
  updateSearchResults,
} from "../projections/search";
import { newSearchId } from "../lib/ids";
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/src/web/serverSentEventGenerator.js";

const router = new Hono();

function getSessionVersion(sessionId: string): number {
  const events = eventStore.getStream(`session:${sessionId}`);
  return events.length > 0 ? events[events.length - 1].streamVersion : -1;
}

function getSearchVersion(searchId: string): number {
  const events = eventStore.getStream(`search:${searchId}`);
  return events.length > 0 ? events[events.length - 1].streamVersion : -1;
}

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

/** Execute a search query against the catalogue */
function runQuery(query: string, filters?: Record<string, string>): SearchResultTrack[] {
  if (!query.trim()) return [];

  const like = `%${query}%`;
  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.duration_ms,
              al.title as album_title, al.id as album_id, al.year,
              ar.name as artist_name, ar.id as artist_id
       FROM tracks t
       JOIN albums al ON t.album_id = al.id
       JOIN artists ar ON t.artist_id = ar.id
       WHERE t.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ?
       ORDER BY ar.name, al.year, t.track_number`
    )
    .all(like, like, like) as SearchResultTrack[];

  // Apply filters (genre etc. are placeholders for now)
  return filters && Object.keys(filters).length > 0
    ? rows // TODO: implement genre/year filters
    : rows;
}

/**
 * POST /s/:id/searches
 * Body: { query: string, filters?: Record<string, string> }
 * Creates a new search session and switches to the search view.
 */
router.post("/s/:id/searches", async (c) => {
  const sessionId = c.req.param("id");
  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);

  const query = c.req.query("q") ?? "";
  const filters: Record<string, string> = {};

  const searchId = newSearchId();
  const correlationId = c.get("correlationId");

  // Append SearchCreated to the search stream
  appendEvents(
    `search:${searchId}`,
    [{ type: "SearchCreated", data: { sessionId, query, filters } }],
    -1,
    correlationId
  );

  // Run the query and cache results
  const results = runQuery(query, filters);
  updateSearchResults(db, searchId, results);

  // Switch session view to search
  const sessionVersion = getSessionVersion(sessionId);
  appendEvents(
    `session:${sessionId}`,
    [{ type: "ViewChanged", data: { view: "search", viewData: { searchId } } }],
    sessionVersion,
    correlationId
  );

  return ServerSentEventGenerator.stream((sse) => {
    sse.executeScript(
      `history.pushState({}, '', '/s/${sessionId}/search/${searchId}')`
    );
  });
});

/**
 * POST /s/:id/searches/:searchId
 * Body: { query?: string, filters?: Record<string, string>, page?: number }
 * Refines an existing search.
 */
router.post("/s/:id/searches/:searchId", async (c) => {
  const sessionId = c.req.param("id");
  const searchId = c.req.param("searchId");

  if (!getSessionProjection(db, sessionId)) return c.text("Session not found", 404);
  if (!getSearchProjection(db, searchId)) return c.text("Search not found", 404);

  const query = c.req.query("q");
  const correlationId = c.get("correlationId");
  const searchVersion = getSearchVersion(searchId);

  if (query !== undefined) {
    appendEvents(
      `search:${searchId}`,
      [{ type: "SearchRefined", data: { query } }],
      searchVersion,
      correlationId
    );
  }

  // Re-run query with updated state
  const search = getSearchProjection(db, searchId)!;
  const effectiveQuery = query ?? search.query;
  const effectiveFilters = JSON.parse(search.filters) as Record<string, string>;

  const results = runQuery(effectiveQuery, effectiveFilters);
  updateSearchResults(db, searchId, results);

  // Emit ViewChanged to trigger SSE re-render of the search view
  const sessionVersion = getSessionVersion(sessionId);
  appendEvents(
    `session:${sessionId}`,
    [{ type: "ViewChanged", data: { view: "search", viewData: { searchId } } }],
    sessionVersion,
    correlationId
  );

  return c.body(null, 204);
});

export default router;
