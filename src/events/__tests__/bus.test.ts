import { describe, it, expect, beforeEach } from "bun:test";
import { EventBus } from "../bus";
import type { StoredEvent } from "../store";

function makeEvent(
  streamId: string,
  eventType: string,
  id = 1
): StoredEvent {
  return {
    id,
    streamId,
    streamVersion: 0,
    eventType,
    data: {},
    schemaVersion: 1,
    correlationId: null,
    createdAt: new Date().toISOString(),
  };
}

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("notifies global subscribers on publish", () => {
    const received: StoredEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const event = makeEvent("session:sess_001", "SessionCreated");
    bus.publish(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it("notifies stream subscribers on matching stream", () => {
    const received: StoredEvent[] = [];
    bus.subscribeStream("session:sess_001", (e) => received.push(e));

    bus.publish(makeEvent("session:sess_001", "ViewChanged", 1));
    bus.publish(makeEvent("session:sess_002", "ViewChanged", 2));

    expect(received).toHaveLength(1);
    expect(received[0].streamId).toBe("session:sess_001");
  });

  it("does not notify stream subscriber on different stream", () => {
    const received: StoredEvent[] = [];
    bus.subscribeStream("session:sess_A", (e) => received.push(e));

    bus.publish(makeEvent("session:sess_B", "SessionCreated"));

    expect(received).toHaveLength(0);
  });

  it("unsubscribe removes global listener", () => {
    const received: StoredEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));

    bus.publish(makeEvent("session:sess_001", "Evt1"));
    unsub();
    bus.publish(makeEvent("session:sess_001", "Evt2"));

    expect(received).toHaveLength(1);
  });

  it("unsubscribe removes stream listener", () => {
    const received: StoredEvent[] = [];
    const unsub = bus.subscribeStream("session:sess_001", (e) => received.push(e));

    bus.publish(makeEvent("session:sess_001", "Evt1"));
    unsub();
    bus.publish(makeEvent("session:sess_001", "Evt2"));

    expect(received).toHaveLength(1);
  });

  it("cleans up stream listener map when last listener unsubscribes", () => {
    const unsub = bus.subscribeStream("session:sess_001", () => {});
    unsub();

    // No error when publishing after cleanup
    bus.publish(makeEvent("session:sess_001", "Evt1"));
  });

  it("multiple subscribers all receive the event", () => {
    const received1: StoredEvent[] = [];
    const received2: StoredEvent[] = [];
    bus.subscribe((e) => received1.push(e));
    bus.subscribe((e) => received2.push(e));

    bus.publish(makeEvent("session:sess_001", "Evt1"));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it("global and stream subscribers both receive matching event", () => {
    const global: StoredEvent[] = [];
    const stream: StoredEvent[] = [];
    bus.subscribe((e) => global.push(e));
    bus.subscribeStream("session:sess_001", (e) => stream.push(e));

    bus.publish(makeEvent("session:sess_001", "Evt1"));

    expect(global).toHaveLength(1);
    expect(stream).toHaveLength(1);
  });
});
