import { Hono } from "hono";
import { db, eventStore } from "../app";
import { getSessionProjection } from "../projections/session";
import { renderEventsPage, renderEventItem, renderRunBadge } from "../views/events-popup";
import type { BusEvent } from "../events/bus";
import { patchElements } from "../lib/sse";
import { createSSEStream } from "../lib/sse-stream";

const router = new Hono();

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

  // Run grouping state
  let eventCount = 0;
  let lastEventType = "";
  let runCount = 0;
  let runId = 0;

  function handleEvent(event: BusEvent, s: { write(data: string): Promise<unknown> }) {
    eventCount++;

    try {
      if (event.eventType === lastEventType) {
        runCount++;
        const badge = renderRunBadge(runId, runCount, event);
        void s.write(patchElements(badge, `#run-${runId}`, "outer"));
      } else {
        lastEventType = event.eventType;
        runCount = 1;
        runId++;
        const html = renderEventItem(event, runId);
        void s.write(patchElements(html, "#event-list", "append"));
      }
      void s.write(patchElements(`<span>${eventCount} events</span>`, "#event-count", "inner"));
    } catch {
      // Stream closed
    }
  }

  return createSSEStream(c, {
    sessionId,
    streamId: `session:${sessionId}`,
    async onInit(s) {
      const session = getSessionProjection(db, sessionId);
      if (!session) return;

      // Group last 50 events by consecutive type
      const recentEvents = eventStore.getStream(`session:${sessionId}`).slice(-50);
      const groupedHtml: string[] = [];

      for (const event of recentEvents) {
        if (event.eventType === lastEventType) {
          runCount++;
          groupedHtml[groupedHtml.length - 1] = renderRunBadge(runId, runCount, event);
        } else {
          lastEventType = event.eventType;
          runCount = 1;
          runId++;
          groupedHtml.push(renderEventItem(event, runId));
        }
      }

      eventCount = recentEvents.length;
      await s.write(patchElements(`<div id="event-list">${groupedHtml.join("")}</div>`, "#event-feed", "inner"));
      await s.write(patchElements(`<span>${eventCount} events</span>`, "#event-count", "inner"));
    },
    onEvent(event, s) {
      handleEvent(event, s);
    },
    onGlobalEvent(event, s) {
      if (event.streamId.startsWith("search:")) {
        handleEvent(event, s);
      }
    },
  });
});

export default router;
