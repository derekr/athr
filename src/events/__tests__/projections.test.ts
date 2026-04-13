import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { EventStore } from "../store";
import { ProjectionEngine } from "../projections";
import { sessionProjection, getSessionProjection } from "../../projections/session";
import { playbackProjection, getPlaybackProjection } from "../../projections/playback";
import { queueProjection, getQueue } from "../../projections/queue";

describe("ProjectionEngine", () => {
  let db: Database;
  let store: EventStore;
  let engine: ProjectionEngine;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(sessionProjection);
    engine.register(playbackProjection);
    engine.register(queueProjection);
  });

  it("applies SessionCreated to session and playback projections", () => {
    const events = store.append(
      "session:sess_001",
      [{ type: "SessionCreated", data: {} }],
      -1
    );
    engine.apply(events[0]);

    const session = getSessionProjection(db, "sess_001");
    expect(session).not.toBeNull();
    expect(session!.current_view).toBe("library");

    const playback = getPlaybackProjection(db, "sess_001");
    expect(playback).not.toBeNull();
    expect(playback!.is_playing).toBe(0);
    expect(playback!.volume).toBe(1.0);
  });

  it("applies ViewChanged to session projection", () => {
    const created = store.append(
      "session:sess_001",
      [{ type: "SessionCreated", data: {} }],
      -1
    );
    engine.apply(created[0]);

    const changed = store.append(
      "session:sess_001",
      [{ type: "ViewChanged", data: { view: "album", viewData: { albumId: "alb_001" } } }],
      0
    );
    engine.apply(changed[0]);

    const session = getSessionProjection(db, "sess_001");
    expect(session!.current_view).toBe("album");
    expect(JSON.parse(session!.current_view_data)).toEqual({ albumId: "alb_001" });
  });

  it("rebuildAll resets and replays all events", () => {
    const e1 = store.append("session:sess_001", [{ type: "SessionCreated", data: {} }], -1);
    engine.apply(e1[0]);
    const e2 = store.append(
      "session:sess_001",
      [{ type: "ViewChanged", data: { view: "artist", viewData: { artistId: "art_001" } } }],
      0
    );
    engine.apply(e2[0]);

    // Now rebuild from scratch
    const allEvents = store.getAllEvents();
    engine.rebuildAll(allEvents);

    const session = getSessionProjection(db, "sess_001");
    expect(session!.current_view).toBe("artist");
  });

  it("applies PlaybackStarted to playback projection", () => {
    const e1 = store.append("session:sess_001", [{ type: "SessionCreated", data: {} }], -1);
    engine.apply(e1[0]);

    const e2 = store.append(
      "session:sess_001",
      [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 0 } }],
      0
    );
    engine.apply(e2[0]);

    const playback = getPlaybackProjection(db, "sess_001");
    expect(playback!.track_id).toBe("t_001");
    expect(playback!.is_playing).toBe(1);
  });

  it("applies TrackQueued and TrackDequeued to queue projection", () => {
    const e1 = store.append("session:sess_001", [{ type: "SessionCreated", data: {} }], -1);
    engine.apply(e1[0]);

    const e2 = store.append(
      "session:sess_001",
      [{ type: "TrackQueued", data: { trackId: "t_001", position: 0 } }],
      0
    );
    engine.apply(e2[0]);

    let queue = getQueue(db, "sess_001");
    expect(queue).toHaveLength(1);
    expect(queue[0].track_id).toBe("t_001");

    const e3 = store.append(
      "session:sess_001",
      [{ type: "TrackDequeued", data: { trackId: "t_001" } }],
      1
    );
    engine.apply(e3[0]);

    queue = getQueue(db, "sess_001");
    expect(queue).toHaveLength(0);
  });
});
