import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { EventStore, ConcurrencyError } from "../store";

describe("EventStore", () => {
  let db: Database;
  let store: EventStore;

  beforeEach(() => {
    db = new Database(":memory:");
    store = new EventStore(db);
  });

  it("appends a single event to a new stream", () => {
    const appended = store.append(
      "session:sess_001",
      [{ type: "SessionCreated", data: {} }],
      -1
    );

    expect(appended).toHaveLength(1);
    expect(appended[0].eventType).toBe("SessionCreated");
    expect(appended[0].streamId).toBe("session:sess_001");
    expect(appended[0].streamVersion).toBe(0);
  });

  it("appends multiple events incrementing version", () => {
    store.append(
      "session:sess_001",
      [{ type: "SessionCreated", data: {} }],
      -1
    );

    const appended = store.append(
      "session:sess_001",
      [
        { type: "ViewChanged", data: { view: "library" } },
        { type: "PlaybackStarted", data: { trackId: "t_001" } },
      ],
      0
    );

    expect(appended).toHaveLength(2);
    expect(appended[0].streamVersion).toBe(1);
    expect(appended[1].streamVersion).toBe(2);
  });

  it("throws ConcurrencyError when expectedVersion is wrong", () => {
    store.append(
      "session:sess_001",
      [{ type: "SessionCreated", data: {} }],
      -1
    );

    expect(() =>
      store.append(
        "session:sess_001",
        [{ type: "ViewChanged", data: {} }],
        -1 // wrong: current is 0
      )
    ).toThrow(ConcurrencyError);
  });

  it("stores and retrieves correlation ID", () => {
    const appended = store.append(
      "session:sess_001",
      [{ type: "SessionCreated", data: {} }],
      -1,
      "cor_abc123"
    );

    expect(appended[0].correlationId).toBe("cor_abc123");
  });

  it("stores and retrieves event data", () => {
    const data = { trackId: "t_001", positionMs: 1234 };
    store.append(
      "session:sess_001",
      [{ type: "PlaybackStarted", data }],
      -1
    );

    const events = store.getStream("session:sess_001");
    expect(events[0].data).toEqual(data);
  });

  it("getStream returns events in version order", () => {
    store.append("session:sess_001", [{ type: "Evt1", data: {} }], -1);
    store.append("session:sess_001", [{ type: "Evt2", data: {} }], 0);
    store.append("session:sess_001", [{ type: "Evt3", data: {} }], 1);

    const events = store.getStream("session:sess_001");
    expect(events.map((e) => e.eventType)).toEqual(["Evt1", "Evt2", "Evt3"]);
  });

  it("getStream with fromVersion skips earlier versions", () => {
    store.append("session:sess_001", [{ type: "Evt1", data: {} }], -1);
    store.append("session:sess_001", [{ type: "Evt2", data: {} }], 0);
    store.append("session:sess_001", [{ type: "Evt3", data: {} }], 1);

    const events = store.getStream("session:sess_001", 1);
    expect(events.map((e) => e.eventType)).toEqual(["Evt2", "Evt3"]);
  });

  it("getAllEvents returns all events across streams in id order", () => {
    store.append("session:sess_001", [{ type: "Evt1", data: {} }], -1);
    store.append("session:sess_002", [{ type: "Evt2", data: {} }], -1);
    store.append("session:sess_001", [{ type: "Evt3", data: {} }], 0);

    const events = store.getAllEvents();
    expect(events.map((e) => e.eventType)).toEqual(["Evt1", "Evt2", "Evt3"]);
  });

  it("getAllEvents with afterId returns only events after that id", () => {
    store.append("session:sess_001", [{ type: "Evt1", data: {} }], -1);
    store.append("session:sess_001", [{ type: "Evt2", data: {} }], 0);
    store.append("session:sess_001", [{ type: "Evt3", data: {} }], 1);

    const all = store.getAllEvents();
    const afterFirst = store.getAllEvents(all[0].id);
    expect(afterFirst.map((e) => e.eventType)).toEqual(["Evt2", "Evt3"]);
  });

  it("handles concurrent writes to same stream correctly", () => {
    // First append succeeds
    store.append("session:sess_001", [{ type: "Evt1", data: {} }], -1);

    // Simulates two concurrent readers both seeing version 0
    // One succeeds, one fails
    store.append("session:sess_001", [{ type: "Evt2", data: {} }], 0);

    expect(() =>
      store.append("session:sess_001", [{ type: "Evt2b", data: {} }], 0)
    ).toThrow(ConcurrencyError);
  });

  it("allows parallel streams without interference", () => {
    store.append("session:sess_A", [{ type: "EvtA", data: {} }], -1);
    store.append("session:sess_B", [{ type: "EvtB", data: {} }], -1);

    const streamA = store.getStream("session:sess_A");
    const streamB = store.getStream("session:sess_B");

    expect(streamA).toHaveLength(1);
    expect(streamB).toHaveLength(1);
    expect(streamA[0].streamVersion).toBe(0);
    expect(streamB[0].streamVersion).toBe(0);
  });
});
