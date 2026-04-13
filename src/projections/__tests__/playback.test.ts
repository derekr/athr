import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { EventStore } from "../../events/store";
import { ProjectionEngine } from "../../events/projections";
import {
  playbackProjection,
  getPlaybackProjection,
  estimatePositionMs,
} from "../playback";
import { sessionProjection } from "../session";

describe("playback projection", () => {
  let db: Database;
  let store: EventStore;
  let engine: ProjectionEngine;

  function appendAndApply(streamId: string, events: { type: string; data: Record<string, unknown> }[], expectedVersion: number) {
    const appended = store.append(streamId, events, expectedVersion);
    for (const e of appended) engine.apply(e);
    return appended;
  }

  beforeEach(() => {
    db = new Database(":memory:");
    store = new EventStore(db);
    engine = new ProjectionEngine(db);
    engine.register(sessionProjection);
    engine.register(playbackProjection);

    appendAndApply("session:sess_001", [{ type: "SessionCreated", data: {} }], -1);
  });

  it("initializes with defaults on SessionCreated", () => {
    const pb = getPlaybackProjection(db, "sess_001");
    expect(pb).not.toBeNull();
    expect(pb!.track_id).toBeNull();
    expect(pb!.is_playing).toBe(0);
    expect(pb!.volume).toBe(1.0);
    expect(pb!.position_ms).toBe(0);
  });

  it("updates on PlaybackStarted", () => {
    appendAndApply(
      "session:sess_001",
      [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 0 } }],
      0
    );
    const pb = getPlaybackProjection(db, "sess_001");
    expect(pb!.track_id).toBe("t_001");
    expect(pb!.is_playing).toBe(1);
    expect(pb!.position_ms).toBe(0);
  });

  it("updates on PlaybackPaused", () => {
    appendAndApply(
      "session:sess_001",
      [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 0 } }],
      0
    );
    appendAndApply(
      "session:sess_001",
      [{ type: "PlaybackPaused", data: { positionMs: 5000 } }],
      1
    );
    const pb = getPlaybackProjection(db, "sess_001");
    expect(pb!.is_playing).toBe(0);
    expect(pb!.position_ms).toBe(5000);
  });

  it("updates on PlaybackResumed", () => {
    appendAndApply("session:sess_001", [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 0 } }], 0);
    appendAndApply("session:sess_001", [{ type: "PlaybackPaused", data: { positionMs: 5000 } }], 1);
    appendAndApply("session:sess_001", [{ type: "PlaybackResumed", data: { positionMs: 5000 } }], 2);
    const pb = getPlaybackProjection(db, "sess_001");
    expect(pb!.is_playing).toBe(1);
    expect(pb!.position_ms).toBe(5000);
  });

  it("updates on PlaybackSeeked", () => {
    appendAndApply("session:sess_001", [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 0 } }], 0);
    appendAndApply("session:sess_001", [{ type: "PlaybackSeeked", data: { positionMs: 30000 } }], 1);
    const pb = getPlaybackProjection(db, "sess_001");
    expect(pb!.position_ms).toBe(30000);
  });

  it("updates on VolumeChanged", () => {
    appendAndApply("session:sess_001", [{ type: "VolumeChanged", data: { level: 0.5 } }], 0);
    const pb = getPlaybackProjection(db, "sess_001");
    expect(pb!.volume).toBe(0.5);
  });

  it("estimatePositionMs returns stored value when paused", () => {
    appendAndApply("session:sess_001", [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 1000 } }], 0);
    appendAndApply("session:sess_001", [{ type: "PlaybackPaused", data: { positionMs: 1000 } }], 1);
    const pb = getPlaybackProjection(db, "sess_001")!;
    expect(estimatePositionMs(pb)).toBe(1000);
  });

  it("estimatePositionMs adds elapsed time when playing", () => {
    appendAndApply("session:sess_001", [{ type: "PlaybackStarted", data: { trackId: "t_001", positionMs: 0 } }], 0);
    const pb = getPlaybackProjection(db, "sess_001")!;
    const estimated = estimatePositionMs(pb);
    expect(estimated).toBeGreaterThanOrEqual(0);
  });
});
