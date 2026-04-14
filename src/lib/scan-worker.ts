/**
 * Worker thread that runs the music scanner.
 * Receives { musicDir, dbPath } messages, runs the scan, posts results back.
 */
import { Database } from "bun:sqlite";
import { scanMusicDirectory } from "./music-scanner";
import { initCatalogue } from "../projections/catalogue";

declare var self: Worker;

self.onmessage = async (event: MessageEvent<{ musicDir: string; dbPath: string }>) => {
  const { musicDir, dbPath } = event.data;

  const db = new Database(dbPath, { create: true });
  initCatalogue(db);

  const result = await scanMusicDirectory(musicDir, db);
  db.close();

  self.postMessage(result);
};
