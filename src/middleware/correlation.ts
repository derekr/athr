import type { MiddlewareHandler } from "hono";
import { newCorrelationId } from "../lib/ids";

declare module "hono" {
  interface ContextVariableMap {
    correlationId: string;
  }
}

export const correlationMiddleware: MiddlewareHandler = async (c, next) => {
  const correlationId = newCorrelationId();
  c.set("correlationId", correlationId);
  c.header("X-Correlation-Id", correlationId);
  await next();
};
