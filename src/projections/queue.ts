import type { Database } from "bun:sqlite";
import type { StoredEvent } from "../events/store";
import type { Projection } from "../events/projections";

export interface QueueRow {
  session_id: string;
  track_id: string;
  position: number;
}

export const queueProjection: Projection = {
  name: "queue",

  init(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS queue_projections (
        session_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (session_id, position)
      )
    `);
  },

  apply(db: Database, event: StoredEvent): void {
    const sessionId = event.streamId.replace("session:", "");

    switch (event.eventType) {
      case "TrackQueued": {
        const data = event.data as { trackId: string; position: number };
        // Shift existing items at or after the position
        db.run(
          `UPDATE queue_projections SET position = position + 1
           WHERE session_id = ? AND position >= ?`,
          [sessionId, data.position]
        );
        db.run(
          `INSERT INTO queue_projections (session_id, track_id, position)
           VALUES (?, ?, ?)`,
          [sessionId, data.trackId, data.position]
        );
        break;
      }
      case "TrackDequeued": {
        const data = event.data as { trackId: string };
        const row = db
          .prepare(
            `SELECT position FROM queue_projections WHERE session_id = ? AND track_id = ?`
          )
          .get(sessionId, data.trackId) as { position: number } | null;
        if (row) {
          db.run(
            `DELETE FROM queue_projections WHERE session_id = ? AND track_id = ?`,
            [sessionId, data.trackId]
          );
          // Compact positions
          db.run(
            `UPDATE queue_projections SET position = position - 1
             WHERE session_id = ? AND position > ?`,
            [sessionId, row.position]
          );
        }
        break;
      }
      case "QueueReordered": {
        const data = event.data as { trackIds: string[] };
        db.run(`DELETE FROM queue_projections WHERE session_id = ?`, [
          sessionId,
        ]);
        for (let i = 0; i < data.trackIds.length; i++) {
          db.run(
            `INSERT INTO queue_projections (session_id, track_id, position) VALUES (?, ?, ?)`,
            [sessionId, data.trackIds[i], i]
          );
        }
        break;
      }
      case "QueueCleared": {
        db.run(`DELETE FROM queue_projections WHERE session_id = ?`, [
          sessionId,
        ]);
        break;
      }
    }
  },

  reset(db: Database): void {
    db.run(`DELETE FROM queue_projections`);
  },
};

export function getQueue(db: Database, sessionId: string): QueueRow[] {
  return db
    .prepare(
      `SELECT * FROM queue_projections WHERE session_id = ? ORDER BY position ASC`
    )
    .all(sessionId) as QueueRow[];
}
