import * as fs from "fs";
import { log } from "evlog";
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

/**
 * Run the music scanner in a worker thread so it doesn't block the main thread.
 */
function scanInWorker(musicDir: string, dbPath: string): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scan-worker.ts", import.meta.url).href);
    worker.onmessage = (event: MessageEvent<ScanResult>) => {
      resolve(event.data);
      worker.terminate();
    };
    worker.onerror = (err) => {
      reject(new Error(String(err)));
      worker.terminate();
    };
    worker.postMessage({ musicDir, dbPath });
  });
}

/**
 * Watch a music directory for changes and rescan when audio files are added/removed.
 * Debounces rapid changes (e.g., copying an album folder) into a single rescan.
 * Scanning runs in a worker thread to avoid blocking the server.
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
          log.info({ action: "watcher_rescan_complete", tracks: result.tracks, albums: result.albums, artists: result.artists });
          if (result.errors.length > 0) {
            log.warn({ action: "watcher_rescan_errors", errors: result.errors });
          }
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
