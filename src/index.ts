import { Hono } from "hono";
import { correlationMiddleware } from "./middleware/correlation";
import sessionRouter from "./routes/session";

const app = new Hono();

// Middleware
app.use("*", correlationMiddleware);

// Routes
app.route("/", sessionRouter);

export default app;
