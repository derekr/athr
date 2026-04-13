import type { Database } from "bun:sqlite";
import type { StoredEvent } from "../events/store";
import type { Projection } from "../events/projections";

export interface SessionRow {
  session_id: string;
  current_view: string;
  current_view_data: string;
  created_at: string;
  updated_at: string;
}

export const sessionProjection: Projection = {
  name: "session",

  init(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS session_projections (
        session_id TEXT PRIMARY KEY,
        current_view TEXT NOT NULL DEFAULT 'library',
        current_view_data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  },

  apply(db: Database, event: StoredEvent): void {
    switch (event.eventType) {
      case "SessionCreated": {
        const sessionId = event.streamId.replace("session:", "");
        db.run(
          `INSERT OR IGNORE INTO session_projections (session_id, current_view, current_view_data, created_at, updated_at)
           VALUES (?, 'library', '{}', datetime('now'), datetime('now'))`,
          [sessionId]
        );
        break;
      }
      case "ViewChanged": {
        const sessionId = event.streamId.replace("session:", "");
        const data = event.data as { view: string; viewData: Record<string, string> };
        db.run(
          `UPDATE session_projections SET current_view = ?, current_view_data = ?, updated_at = datetime('now')
           WHERE session_id = ?`,
          [data.view, JSON.stringify(data.viewData ?? {}), sessionId]
        );
        break;
      }
    }
  },

  reset(db: Database): void {
    db.run(`DELETE FROM session_projections`);
  },
};

export function getSessionProjection(
  db: Database,
  sessionId: string
): SessionRow | null {
  return (
    db
      .prepare(`SELECT * FROM session_projections WHERE session_id = ?`)
      .get(sessionId) as SessionRow | null
  );
}
