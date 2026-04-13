import { db } from "../app";

export function getSessionVersion(sessionId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(stream_version), -1) as v FROM events WHERE stream_id = ?`)
    .get(`session:${sessionId}`) as { v: number };
  return row.v;
}
