/**
 * Application-level singleton instances: database, event store,
 * projection engine, and event bus. Initialized once on startup.
 */
import { Database } from "bun:sqlite";
import { EventStore } from "./events/store";
import { ProjectionEngine } from "./events/projections";
import { EventBus } from "./events/bus";
import { sessionProjection } from "./projections/session";
import { playbackProjection } from "./projections/playback";
import { queueProjection } from "./projections/queue";
import { searchProjection } from "./projections/search";
import { initCatalogue } from "./projections/catalogue";
import { settingsProjection } from "./projections/settings";

/** Shared SQLite database (single file for both events and projections) */
export const db = new Database(
  process.env.DATABASE_PATH ?? "athr.db",
  { create: true }
);

/** Append-only event log */
export const eventStore = new EventStore(db);

/** Projection engine — keeps read models up to date */
export const projectionEngine = new ProjectionEngine(db);
projectionEngine.register(sessionProjection);
projectionEngine.register(playbackProjection);
projectionEngine.register(queueProjection);
projectionEngine.register(searchProjection);
projectionEngine.register(settingsProjection);

/** Initialize catalogue tables */
initCatalogue(db);

/** In-process pub/sub bridge from event store to SSE streams */
export const eventBus = new EventBus();

/**
 * Append events and automatically apply projections + publish to bus.
 * Use this instead of calling eventStore.append() directly.
 */
export function appendEvents(
  streamId: string,
  events: { type: string; data: Record<string, unknown> }[],
  expectedVersion: number,
  correlationId?: string
) {
  const appended = eventStore.append(streamId, events, expectedVersion, correlationId);
  for (const event of appended) {
    projectionEngine.apply(event);
    console.log(`[bus] publishing ${event.eventType} to ${event.streamId}`);
    eventBus.publish(event);
  }
  return appended;
}
