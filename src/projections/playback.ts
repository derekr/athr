import type { Database } from "bun:sqlite";
import type { StoredEvent } from "../events/store";
import type { Projection } from "../events/projections";

export interface PlaybackRow {
  session_id: string;
  track_id: string | null;
  position_ms: number;
  is_playing: number;
  volume: number;
  updated_at: string;
}

export const playbackProjection: Projection = {
  name: "playback",

  init(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS playback_projections (
        session_id TEXT PRIMARY KEY,
        track_id TEXT,
        position_ms INTEGER NOT NULL DEFAULT 0,
        is_playing INTEGER NOT NULL DEFAULT 0,
        volume REAL NOT NULL DEFAULT 1.0,
        updated_at TEXT NOT NULL
      )
    `);
  },

  apply(db: Database, event: StoredEvent): void {
    const sessionId = event.streamId.replace("session:", "");

    switch (event.eventType) {
      case "SessionCreated": {
        db.run(
          `INSERT OR IGNORE INTO playback_projections (session_id, position_ms, is_playing, volume, updated_at)
           VALUES (?, 0, 0, 1.0, datetime('now'))`,
          [sessionId]
        );
        break;
      }
      case "PlaybackStarted": {
        const data = event.data as { trackId: string; positionMs: number };
        db.run(
          `UPDATE playback_projections SET track_id = ?, position_ms = ?, is_playing = 1, updated_at = datetime('now')
           WHERE session_id = ?`,
          [data.trackId, data.positionMs ?? 0, sessionId]
        );
        break;
      }
      case "PlaybackPaused": {
        const data = event.data as { positionMs: number };
        db.run(
          `UPDATE playback_projections SET is_playing = 0, position_ms = ?, updated_at = datetime('now')
           WHERE session_id = ?`,
          [data.positionMs, sessionId]
        );
        break;
      }
      case "PlaybackResumed": {
        const data = event.data as { positionMs: number };
        db.run(
          `UPDATE playback_projections SET is_playing = 1, position_ms = ?, updated_at = datetime('now')
           WHERE session_id = ?`,
          [data.positionMs, sessionId]
        );
        break;
      }
      case "PlaybackSeeked":
      case "PlaybackPositionSynced": {
        const data = event.data as { positionMs: number };
        db.run(
          `UPDATE playback_projections SET position_ms = ?, updated_at = datetime('now')
           WHERE session_id = ?`,
          [data.positionMs, sessionId]
        );
        break;
      }
      case "VolumeChanged": {
        const data = event.data as { level: number };
        db.run(
          `UPDATE playback_projections SET volume = ?, updated_at = datetime('now')
           WHERE session_id = ?`,
          [data.level, sessionId]
        );
        break;
      }
    }
  },

  reset(db: Database): void {
    db.run(`DELETE FROM playback_projections`);
  },
};

export function getPlaybackProjection(
  db: Database,
  sessionId: string
): PlaybackRow | null {
  return (
    db
      .prepare(`SELECT * FROM playback_projections WHERE session_id = ?`)
      .get(sessionId) as PlaybackRow | null
  );
}

/** Estimate current position in ms, accounting for elapsed time if playing */
export function estimatePositionMs(playback: PlaybackRow): number {
  return playback.position_ms;
}
