---
title: "Correlation ID Middleware"
type: issue
id: ISSUE-004
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
epic: "[[001-event-sourcing-foundation]]"
related:
  - "[[001-event-store]]"
tags:
  - middleware
  - observability
  - hono
estimate: trivial
---

# Correlation ID Middleware

Hono middleware that generates a unique correlation ID for every inbound request. The ID is passed through to the event store so all events produced by a single request can be traced back to it.

## Implementation

```typescript
app.use("*", async (c, next) => {
  const correlationId = `cor_${crypto.randomUUID().slice(0, 12)}`;
  c.set("correlationId", correlationId);
  c.header("X-Correlation-Id", correlationId);
  await next();
});
```

Command handlers read it from context:

```typescript
app.post("/s/:id/play", async (c) => {
  const correlationId = c.get("correlationId");
  eventStore.append(streamId, [event], expectedVersion, correlationId);
});
```

## Tasks

- [ ] Create correlation ID middleware in `src/middleware/correlation.ts`
- [ ] Register in Hono app
- [ ] Pass through to event store `append()` calls
