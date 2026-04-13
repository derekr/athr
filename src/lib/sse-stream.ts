import { stream } from "hono/streaming";
import type { Context } from "hono";
import { eventBus } from "../app";
import type { BusEvent } from "../events/bus";

interface Writer {
  write(data: string): Promise<unknown>;
}

interface SSEStreamOptions {
  sessionId: string;
  streamId: string;
  onInit: (s: Writer) => Promise<void>;
  onEvent: (event: BusEvent, s: Writer) => void;
  /** Also subscribe to global bus events (not just the stream). */
  onGlobalEvent?: (event: BusEvent, s: Writer) => void;
}

/**
 * Create an SSE stream with standard boilerplate:
 * headers, initial state push, event subscription, heartbeat, cleanup.
 */
export function createSSEStream(c: Context, opts: SSEStreamOptions) {
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {
    await opts.onInit(s);

    let closed = false;

    const unsub = eventBus.subscribeStream(
      opts.streamId,
      (event: BusEvent) => {
        if (closed) return;
        opts.onEvent(event, s);
      }
    );

    let unsubGlobal: (() => void) | undefined;
    if (opts.onGlobalEvent) {
      const handler = opts.onGlobalEvent;
      unsubGlobal = eventBus.subscribe((event: BusEvent) => {
        if (closed) return;
        handler(event, s);
      });
    }

    const heartbeat = setInterval(() => {
      if (closed) return;
      void s.write(": heartbeat\n\n");
    }, 15_000);

    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", () => resolve());
    });

    closed = true;
    clearInterval(heartbeat);
    unsub();
    unsubGlobal?.();
  });
}
