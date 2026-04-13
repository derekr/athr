import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { EventStore } from "../../events/store";
import { ProjectionEngine } from "../../events/projections";
import { queueProjection, getQueue } from "../queue";
import { sessionProjection } from "../session";

describe("queue projection", () => {
  let db: Database;
  let store: EventStore;
  let engine: ProjectionEngine;
  let version: number;

  function appendAndApply(events: { type: string; data: Record<string, unknown> }[]) {
    const appended = store.append("session:sess_001", events, version);
    for (const e of appended) engine.apply(e);
    version += events.length;
    return appended;
  }

  beforeEach(() => {
    db = new Database(":memory:");
    store = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(sessionProjection);
    engine.register(queueProjection);
    version = -1;
    appendAndApply([{ type: "SessionCreated", data: {} }]);
  });

  it("starts with empty queue", () => {
    expect(getQueue(db, "sess_001")).toHaveLength(0);
  });

  it("adds tracks in order", () => {
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_A", position: 0 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_B", position: 1 } }]);

    const queue = getQueue(db, "sess_001");
    expect(queue.map((q) => q.track_id)).toEqual(["t_A", "t_B"]);
  });

  it("inserts track at given position and shifts others", () => {
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_A", position: 0 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_B", position: 1 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_X", position: 0 } }]); // insert at front

    const queue = getQueue(db, "sess_001");
    expect(queue.map((q) => q.track_id)).toEqual(["t_X", "t_A", "t_B"]);
  });

  it("removes track and compacts positions", () => {
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_A", position: 0 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_B", position: 1 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_C", position: 2 } }]);
    appendAndApply([{ type: "TrackDequeued", data: { trackId: "t_B" } }]);

    const queue = getQueue(db, "sess_001");
    expect(queue.map((q) => q.track_id)).toEqual(["t_A", "t_C"]);
    expect(queue.map((q) => q.position)).toEqual([0, 1]);
  });

  it("reorders queue", () => {
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_A", position: 0 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_B", position: 1 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_C", position: 2 } }]);
    appendAndApply([{ type: "QueueReordered", data: { trackIds: ["t_C", "t_A", "t_B"] } }]);

    const queue = getQueue(db, "sess_001");
    expect(queue.map((q) => q.track_id)).toEqual(["t_C", "t_A", "t_B"]);
  });

  it("clears queue", () => {
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_A", position: 0 } }]);
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_B", position: 1 } }]);
    appendAndApply([{ type: "QueueCleared", data: {} }]);

    expect(getQueue(db, "sess_001")).toHaveLength(0);
  });

  it("remove of non-existent track is no-op", () => {
    appendAndApply([{ type: "TrackQueued", data: { trackId: "t_A", position: 0 } }]);
    appendAndApply([{ type: "TrackDequeued", data: { trackId: "t_NOPE" } }]);

    expect(getQueue(db, "sess_001")).toHaveLength(1);
  });
});
