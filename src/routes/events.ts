import { Hono } from "hono";
import { stream } from "hono/streaming";
import { db, eventStore, eventBus } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderEventsPage, renderEventItem, renderRunBadge } from "../views/events-popup";
import type { StoredEvent } from "../events/store";

const router = new Hono();

function patchElements(
  html: string,
  selector: string,
  mode: "inner" | "outer" | "prepend" | "append" = "inner"
): string {
  const lines = [`event: datastar-patch-elements`];
  lines.push(`data: selector ${selector}`);
  if (mode !== "outer") lines.push(`data: mode ${mode}`);
  for (const line of html.split("\n")) {
    lines.push(`data: elements ${line}`);
  }
  lines.push("", "");
  return lines.join("\n");
}

/** GET /s/:id/events — Events popup page */
router.get("/s/:id/events", (c) => {
  const sessionId = c.req.param("id");
  const session = getSessionProjection(db, sessionId);
  if (!session) return c.redirect("/");
  return c.html(renderEventsPage(sessionId));
});

/** GET /s/:id/events/sse — Live event stream for the events popup */
router.get("/s/:id/events/sse", (c) => {
  const sessionId = c.req.param("id");

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  return stream(c, async (s) => {
    const session = getSessionProjection(db, sessionId);
    if (!session) { await s.close(); return; }

    // Send recent events as initial state, grouped by consecutive type
    const recentEvents = eventStore.getStream(`session:${sessionId}`).slice(-50);
    let initRunId = 0;
    let initLastType = "";
    let initRunCount = 0;
    const groupedHtml: string[] = [];

    for (const event of recentEvents) {
      if (event.eventType === initLastType) {
        initRunCount++;
        groupedHtml[groupedHtml.length - 1] = renderRunBadge(initRunId, initRunCount, event);
      } else {
        initLastType = event.eventType;
        initRunCount = 1;
        initRunId++;
        groupedHtml.push(renderEventItem(event, initRunId));
      }
    }

    await s.write(patchElements(groupedHtml.join(""), "#event-feed", "inner"));
    await s.write(patchElements(`<span>${recentEvents.length} events</span>`, "#event-count", "inner"));

    let eventCount = recentEvents.length;
    let closed = false;
    let lastEventType = initLastType;
    let runCount = initRunCount;
    let runId = initRunId;

    function handleEvent(event: StoredEvent) {
      if (closed) return;
      // Skip telemetry — not a domain event
      if (event.eventType === "PlaybackPositionSynced") return;
      eventCount++;

      if (event.eventType === lastEventType) {
        // Same type as last — update the run counter
        runCount++;
        const badge = renderRunBadge(runId, runCount, event);
        void s.write(patchElements(badge, `#run-${runId}`, "outer"));
      } else {
        // New event type — append a fresh row
        lastEventType = event.eventType;
        runCount = 1;
        runId++;
        const html = renderEventItem(event, runId);
        void s.write(patchElements(html, "#event-feed", "append"));
      }

      void s.write(patchElements(`<span>${eventCount} events</span>`, "#event-count", "inner"));
    }

    // Subscribe to new events on this session's stream
    const unsub = eventBus.subscribeStream(
      `session:${sessionId}`,
      handleEvent
    );

    // Also subscribe to search stream events (they're on separate streams)
    const unsubGlobal = eventBus.subscribe((event: StoredEvent) => {
      if (event.streamId.startsWith("search:")) handleEvent(event);
    });

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
    unsubGlobal();
  });
});

export default router;
