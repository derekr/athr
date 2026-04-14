import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { getSettings } from "../projections/settings";
import { db } from "../app";
import { readConfig } from "../lib/config";

const DATASTAR_CDN =
  "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.8/bundles/datastar.min.js";

export function renderSettingsPage(sessionId: string): HtmlEscapedString | Promise<HtmlEscapedString> {
  const settings = getSettings(db, sessionId);
  const config = readConfig();
  const musicDir = (settings["dir"] as string) ?? config.dir ?? "";

  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>athr — Settings</title>
  <script type="module" src="${DATASTAR_CDN}"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --surface2: #242424;
      --border: #333; --text: #e8e8e8; --text-muted: #888;
      --accent: #7c6af7; color-scheme: dark;
    }
    body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; padding: 24px; }
    h1 { font-size: 20px; margin-bottom: 24px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 12px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; margin-bottom: 6px; font-size: 13px; color: var(--text-muted); }
    .field input[type=text] { width: 100%; padding: 8px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 14px; }
    .field input[type=text]:focus { outline: none; border-color: var(--accent); }
    button[type=submit] { padding: 8px 16px; background: var(--accent); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px; }
    .status { margin-top: 12px; font-size: 13px; color: var(--text-muted); }
    #feedback { min-height: 20px; }
  </style>
</head>
<body>
  <div data-signals:music-dir="'${musicDir}'"></div>

  <h1>Settings</h1>

  <div id="settings-content">
    <div class="section">
      <h2>Library</h2>
      <div class="field">
        <label for="music-dir">Music directory</label>
        <input type="text" id="music-dir" value="${musicDir}"
               data-bind:musicDir
               placeholder="/path/to/your/Music" />
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button type="submit"
          data-on:click__prevent="@post('/s/${sessionId}/settings/update')">
          Save &amp; Rescan
        </button>
        <button type="submit"
          data-on:click__prevent="@post('/s/${sessionId}/settings/rescan')"
          style="background: var(--surface2); border: 1px solid var(--border);">
          Rescan
        </button>
        <button type="submit"
          data-on:click__prevent="@post('/s/${sessionId}/settings/clear-rescan')"
          style="background: var(--surface2); border: 1px solid var(--border); color: var(--text-muted);">
          Clear &amp; Rescan
        </button>
      </div>
    </div>

    <div id="feedback"></div>
  </div>
</body>
</html>`;
}

