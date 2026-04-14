import * as fs from "fs";
import { log } from "evlog";
import { db, eventBus } from "../app";
import { scanMusicDirectory, type ScanResult } from "./music-scanner";
import { clearCatalogue } from "../projections/catalogue";

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
 * Run an incremental scan, publishing progress to the event bus.
 * Runs in the main thread — parseFile() yields the event loop between files.
 */
export async function runScan(musicDir: string, clear?: boolean): Promise<ScanResult> {
  publishScanEvent("ScanStarted", { dir: musicDir });

  if (clear) {
    clearCatalogue(db);
  }

  const result = await scanMusicDirectory(musicDir, db, (progress) => {
    publishScanEvent("ScanProgress", {
      phase: progress.phase,
      processed: progress.processed,
      total: progress.total,
      currentFile: progress.currentFile,
      added: progress.added,
      removed: progress.removed,
    });
  });

  publishScanEvent("ScanComplete", {
    tracks: result.tracks,
    albums: result.albums,
    artists: result.artists,
    added: result.added,
    removed: result.removed,
    unchanged: result.unchanged,
  });

  return result;
}

/**
 * Watch a music directory for changes and rescan when audio files change.
 */
export function watchMusicDirectory(musicDir: string): void {
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
      runScan(musicDir)
        .then((result) => {
          log.info({ action: "watcher_rescan_complete", added: result.added, removed: result.removed });
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
