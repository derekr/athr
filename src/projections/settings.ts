import type { Database } from "bun:sqlite";
import type { StoredEvent } from "../events/store";
import type { Projection } from "../events/projections";

export interface SettingsRow {
  session_id: string;
  settings: string; // JSON object
  updated_at: string;
}

export const settingsProjection: Projection = {
  name: "settings",

  init(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS settings_projections (
        session_id TEXT PRIMARY KEY,
        settings TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      )
    `);
  },

  apply(db: Database, event: StoredEvent): void {
    const sessionId = event.streamId.replace("session:", "");

    switch (event.eventType) {
      case "SessionCreated": {
        db.run(
          `INSERT OR IGNORE INTO settings_projections (session_id, settings, updated_at)
           VALUES (?, '{}', datetime('now'))`,
          [sessionId]
        );
        break;
      }
      case "SettingsUpdated": {
        const data = event.data as { key: string; value: unknown };
        const row = db
          .prepare(`SELECT settings FROM settings_projections WHERE session_id = ?`)
          .get(sessionId) as { settings: string } | null;
        const current = row ? (JSON.parse(row.settings) as Record<string, unknown>) : {};
        current[data.key] = data.value;
        db.run(
          `UPDATE settings_projections SET settings = ?, updated_at = datetime('now')
           WHERE session_id = ?`,
          [JSON.stringify(current), sessionId]
        );
        break;
      }
    }
  },

  reset(db: Database): void {
    db.run(`DELETE FROM settings_projections`);
  },
};

export function getSettings(
  db: Database,
  sessionId: string
): Record<string, unknown> {
  const row = db
    .prepare(`SELECT settings FROM settings_projections WHERE session_id = ?`)
    .get(sessionId) as { settings: string } | null;
  return row ? (JSON.parse(row.settings) as Record<string, unknown>) : {};
}
