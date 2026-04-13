import { Database } from "bun:sqlite";

export interface StoredEvent {
  id: number;
  streamId: string;
  streamVersion: number;
  eventType: string;
  data: Record<string, unknown>;
  schemaVersion: number;
  correlationId: string | null;
  createdAt: string;
}

export interface AppendedEvent extends StoredEvent {}

export class ConcurrencyError extends Error {
  constructor(
    public readonly streamId: string,
    public readonly expectedVersion: number
  ) {
    super(
      `Concurrency conflict on stream "${streamId}": expected version ${expectedVersion}`
    );
    this.name = "ConcurrencyError";
  }
}

export class EventStore {
  constructor(private readonly db: Database) {
    this.init();
  }

  private init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stream_id TEXT NOT NULL,
        stream_version INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        data TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        correlation_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(stream_id, stream_version)
      )
    `);

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_stream ON events(stream_id, stream_version)`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`
    );
    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlation_id)`
    );
  }

  append(
    streamId: string,
    events: { type: string; data: Record<string, unknown> }[],
    expectedVersion: number,
    correlationId?: string
  ): AppendedEvent[] {
    const appended: AppendedEvent[] = [];

    const insertStmt = this.db.prepare(`
      INSERT INTO events (stream_id, stream_version, event_type, data, schema_version, correlation_id)
      VALUES (?, ?, ?, ?, 1, ?)
    `);

    const appendTx = this.db.transaction(() => {
      // Verify current version
      const row = this.db
        .prepare(
          `SELECT COALESCE(MAX(stream_version), -1) as current_version FROM events WHERE stream_id = ?`
        )
        .get(streamId) as { current_version: number };

      const currentVersion = row.current_version;
      if (currentVersion !== expectedVersion) {
        throw new ConcurrencyError(streamId, expectedVersion);
      }

      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        const nextVersion = expectedVersion + 1 + i;

        try {
          insertStmt.run(
            streamId,
            nextVersion,
            event.type,
            JSON.stringify(event.data),
            correlationId ?? null
          );

          const inserted = this.db
            .prepare(
              `SELECT * FROM events WHERE stream_id = ? AND stream_version = ?`
            )
            .get(streamId, nextVersion) as {
            id: number;
            stream_id: string;
            stream_version: number;
            event_type: string;
            data: string;
            schema_version: number;
            correlation_id: string | null;
            created_at: string;
          };

          appended.push(this.rowToEvent(inserted));
        } catch (err: unknown) {
          if (
            err instanceof Error &&
            err.message.includes("UNIQUE constraint failed")
          ) {
            throw new ConcurrencyError(streamId, expectedVersion + i);
          }
          throw err;
        }
      }
    });

    appendTx();
    return appended;
  }

  getStream(streamId: string, fromVersion?: number): StoredEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM events WHERE stream_id = ? AND stream_version >= ? ORDER BY stream_version ASC`
      )
      .all(streamId, fromVersion ?? 0) as Array<{
      id: number;
      stream_id: string;
      stream_version: number;
      event_type: string;
      data: string;
      schema_version: number;
      correlation_id: string | null;
      created_at: string;
    }>;

    return rows.map((r) => this.rowToEvent(r));
  }

  getAllEvents(afterId?: number): StoredEvent[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM events WHERE id > ? ORDER BY id ASC`
      )
      .all(afterId ?? 0) as Array<{
      id: number;
      stream_id: string;
      stream_version: number;
      event_type: string;
      data: string;
      schema_version: number;
      correlation_id: string | null;
      created_at: string;
    }>;

    return rows.map((r) => this.rowToEvent(r));
  }

  private rowToEvent(row: {
    id: number;
    stream_id: string;
    stream_version: number;
    event_type: string;
    data: string;
    schema_version: number;
    correlation_id: string | null;
    created_at: string;
  }): StoredEvent {
    return {
      id: row.id,
      streamId: row.stream_id,
      streamVersion: row.stream_version,
      eventType: row.event_type,
      data: JSON.parse(row.data) as Record<string, unknown>,
      schemaVersion: row.schema_version,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
    };
  }
}
