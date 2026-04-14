/**
 * Worker thread that runs the music scanner.
 * Receives { musicDir, dbPath } messages, posts progress + result back.
 */
import { Database } from "bun:sqlite";
import { scanMusicDirectory } from "./music-scanner";
import { initCatalogue, clearCatalogue } from "../projections/catalogue";

declare var self: Worker;

self.onmessage = (event: MessageEvent<{ musicDir: string; dbPath: string; clear?: boolean }>) => {
  const { musicDir, dbPath, clear } = event.data;

  (async () => {
    const db = new Database(dbPath, { create: true });
    initCatalogue(db);

    if (clear) {
      clearCatalogue(db);
      self.postMessage({ type: "cleared" });
    }

    const result = await scanMusicDirectory(musicDir, db, (progress) => {
      self.postMessage({ type: "progress", ...progress });
    });

    db.close();

    self.postMessage({ type: "complete", ...result });
  })();
};
