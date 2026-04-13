import { Hono } from "hono";
import { initLogger } from "evlog";
import { evlog, type EvlogVariables } from "evlog/hono";
import { createFsDrain } from "evlog/fs";
import { writeToFs } from "evlog/fs";
import { serveStatic } from "hono/bun";
import { correlationMiddleware } from "./middleware/correlation";
import sessionRouter from "./routes/session";
import sseRouter from "./routes/sse";
import viewsRouter from "./routes/views";
import catalogueRouter from "./routes/catalogue";
import playbackRouter from "./routes/playback";
import queueRouter from "./routes/queue";
import searchRouter from "./routes/search";
import settingsRouter from "./routes/settings";
import miniRouter from "./routes/mini";

initLogger({
  env: { service: "athr" },
});

const app = new Hono<EvlogVariables>();

// Static assets
app.use("/public/*", serveStatic({ root: "./" }));

// Middleware
app.use(evlog({ drain: createFsDrain() }));
app.use("*", correlationMiddleware);

// Client log ingest — receives batched logs from evlog/client transport
app.post("/api/_evlog/ingest", async (c) => {
  const body = await c.req.json();
  const entries = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    await writeToFs(entry, { dir: ".evlog/logs" });
  }
  return c.body(null, 204);
});

// Routes — sessionRouter must be last: its GET /s/:id/* wildcard
// must not swallow specific popup/SSE sub-paths.
app.route("/", sseRouter);
app.route("/", viewsRouter);
app.route("/", catalogueRouter);
app.route("/", playbackRouter);
app.route("/", queueRouter);
app.route("/", searchRouter);
app.route("/", settingsRouter);
app.route("/", miniRouter);
app.route("/", sessionRouter);

export default {
  fetch: app.fetch,
  idleTimeout: 120, // seconds — SSE streams need room to breathe
};
