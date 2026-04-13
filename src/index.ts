import { Hono } from "hono";
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

const app = new Hono();

// Middleware
app.use("*", correlationMiddleware);

// Routes
app.route("/", sessionRouter);
app.route("/", sseRouter);
app.route("/", viewsRouter);
app.route("/", catalogueRouter);
app.route("/", playbackRouter);
app.route("/", queueRouter);
app.route("/", searchRouter);
app.route("/", settingsRouter);
app.route("/", miniRouter);

export default app;
