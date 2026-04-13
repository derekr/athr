import { Hono } from "hono";
import { correlationMiddleware } from "./middleware/correlation";
import sessionRouter from "./routes/session";
import sseRouter from "./routes/sse";
import viewsRouter from "./routes/views";
import catalogueRouter from "./routes/catalogue";

const app = new Hono();

// Middleware
app.use("*", correlationMiddleware);

// Routes
app.route("/", sessionRouter);
app.route("/", sseRouter);
app.route("/", viewsRouter);
app.route("/", catalogueRouter);

export default app;
