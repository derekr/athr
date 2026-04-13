import type { Database } from "bun:sqlite";
import type { StoredEvent } from "../events/store";
import type { Projection } from "../events/projections";

export interface SearchRow {
  search_id: string;
  session_id: string;
  query: string;
  filters: string;
  page: number;
  results: string;
  created_at: string;
  updated_at: string;
}

export const searchProjection: Projection = {
  name: "search",

  init(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS search_projections (
        search_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        query TEXT NOT NULL DEFAULT '',
        filters TEXT NOT NULL DEFAULT '{}',
        page INTEGER NOT NULL DEFAULT 1,
        results TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },

  apply(db: Database, event: StoredEvent): void {
    const searchId = event.streamId.replace("search:", "");

    switch (event.eventType) {
      case "SearchCreated": {
        const data = event.data as {
          sessionId: string;
          query: string;
          filters: Record<string, string>;
        };
        db.run(
          `INSERT OR IGNORE INTO search_projections (search_id, session_id, query, filters, page, results, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, '[]', datetime('now'), datetime('now'))`,
          [searchId, data.sessionId, data.query, JSON.stringify(data.filters ?? {})]
        );
        break;
      }
      case "SearchRefined": {
        const data = event.data as {
          query?: string;
          filters?: Record<string, string>;
        };
        if (data.query !== undefined) {
          db.run(
            `UPDATE search_projections SET query = ?, updated_at = datetime('now') WHERE search_id = ?`,
            [data.query, searchId]
          );
        }
        if (data.filters !== undefined) {
          db.run(
            `UPDATE search_projections SET filters = ?, updated_at = datetime('now') WHERE search_id = ?`,
            [JSON.stringify(data.filters), searchId]
          );
        }
        // Reset page when query/filters change
        db.run(
          `UPDATE search_projections SET page = 1, updated_at = datetime('now') WHERE search_id = ?`,
          [searchId]
        );
        break;
      }
      case "SearchPageChanged": {
        const data = event.data as { page: number };
        db.run(
          `UPDATE search_projections SET page = ?, updated_at = datetime('now') WHERE search_id = ?`,
          [data.page, searchId]
        );
        break;
      }
    }
  },

  reset(db: Database): void {
    db.run(`DELETE FROM search_projections`);
  },
};

export function getSearchProjection(
  db: Database,
  searchId: string
): SearchRow | null {
  return (
    db
      .prepare(`SELECT * FROM search_projections WHERE search_id = ?`)
      .get(searchId) as SearchRow | null
  );
}

export function updateSearchResults(
  db: Database,
  searchId: string,
  results: unknown[]
): void {
  db.run(
    `UPDATE search_projections SET results = ?, updated_at = datetime('now') WHERE search_id = ?`,
    [JSON.stringify(results), searchId]
  );
}
