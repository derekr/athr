import * as fs from "fs";
import { log } from "evlog";
import { eventBus } from "../app";
import type { ScanResult } from "./music-scanner";

let watcherInstance: fs.FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let scanning = false;

const DEBOUNCE_MS = 2000;

const AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".ogg", ".m4a", ".wav", ".aac", ".opus"]);

function isAudioFile(filename: string | null): boolean {
  if (!filename) return false;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

function publishScanEvent(eventType: string, data: Record<string, unknown>): void {
  eventBus.publish({
    id: 0,
    streamId: "catalogue",
    streamVersion: 0,
    eventType,
    data,
    schemaVersion: 1,
    correlationId: null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Run the music scanner in a worker thread.
 * Publishes progress and completion events to the event bus.
 */
export function scanInWorker(musicDir: string, dbPath: string, clear?: boolean): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scan-worker.ts", import.meta.url).href);

    publishScanEvent("ScanStarted", { dir: musicDir });

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;

      if (msg.type === "progress") {
        publishScanEvent("ScanProgress", {
          phase: msg.phase,
          processed: msg.processed,
          total: msg.total,
          currentFile: msg.currentFile,
          added: msg.added,
          removed: msg.removed,
        });
      } else if (msg.type === "complete") {
        const result: ScanResult = {
          tracks: msg.tracks,
          albums: msg.albums,
          artists: msg.artists,
          added: msg.added,
          removed: msg.removed,
          unchanged: msg.unchanged,
          errors: msg.errors,
        };

        publishScanEvent("ScanComplete", {
          tracks: result.tracks,
          albums: result.albums,
          artists: result.artists,
          added: result.added,
          removed: result.removed,
          unchanged: result.unchanged,
        });

        resolve(result);
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      reject(new Error(String(err)));
      worker.terminate();
    };

    worker.postMessage({ musicDir, dbPath, clear });
  });
}

/**
 * Watch a music directory for changes and rescan when audio files change.
 * Debounces rapid changes. Scanning runs in a worker thread.
 */
export function watchMusicDirectory(musicDir: string, dbPath: string): void {
  stopWatching();

  if (!fs.existsSync(musicDir)) {
    log.warn({ action: "watcher_dir_not_found", dir: musicDir });
    return;
  }

  log.info({ action: "watcher_started", dir: musicDir });

  watcherInstance = fs.watch(musicDir, { recursive: true }, (_event, filename) => {
    if (!isAudioFile(filename as string | null)) return;
    if (scanning) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanning = true;
      log.info({ action: "watcher_rescan_triggered" });
      scanInWorker(musicDir, dbPath)
        .then((result) => {
          log.info({ action: "watcher_rescan_complete", tracks: result.tracks, albums: result.albums, artists: result.artists, added: result.added, removed: result.removed });
        })
        .catch((err) => {
          log.error({ action: "watcher_rescan_failed", error: String(err) });
        })
        .finally(() => {
          scanning = false;
        });
    }, DEBOUNCE_MS);
  });

  watcherInstance.on("error", (err) => {
    log.error({ action: "watcher_error", error: err.message });
  });
}

export function stopWatching(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcherInstance) {
    watcherInstance.close();
    watcherInstance = null;
  }
}
