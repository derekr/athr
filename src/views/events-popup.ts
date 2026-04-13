import { escHtml } from "../lib/html";

const DATASTAR_CDN =
  "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.8/bundles/datastar.min.js";

export function renderEventsPage(sessionId: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>athr — Events</title>
  <script type="module" src="${DATASTAR_CDN}"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0f0f; --surface: #1a1a1a; --surface2: #242424;
      --border: #333; --text: #e8e8e8; --text-muted: #888;
      --accent: #7c6af7; color-scheme: dark;
    }
    body {
      background: var(--bg); color: var(--text);
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 12px;
      height: 100vh; display: flex; flex-direction: column;
    }
    .header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      background: var(--surface);
    }
    .header h1 { font-size: 14px; font-weight: 600; }
    .header .count { font-size: 11px; color: var(--text-muted); }
    #event-feed {
      flex: 1; overflow-y: auto; padding: 0;
      overflow-anchor: none;
    }
    #scroll-anchor {
      overflow-anchor: auto;
      height: 1px;
    }
    .event {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border);
      animation: fadeIn 0.2s ease-out;
    }
    .event:hover { background: var(--surface); }
    .event-header {
      display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
    }
    .event-type {
      font-weight: 600;
      color: var(--accent);
    }
    .event-stream {
      color: var(--text-muted);
      font-size: 11px;
    }
    .event-time {
      margin-left: auto;
      color: var(--text-muted);
      font-size: 10px;
    }
    .event-id {
      color: var(--text-muted);
      font-size: 10px;
    }
    .run-count {
      font-size: 10px;
      font-weight: 600;
      color: var(--bg);
      background: var(--text-muted);
      border-radius: 8px;
      padding: 1px 5px;
    }
    .event-data {
      color: var(--text-muted);
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 60px;
      overflow: hidden;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Event Stream</h1>
    <span class="count" id="event-count"></span>
  </div>
  <div id="event-feed" data-init="@get('/s/${sessionId}/events/sse')">
    <div id="scroll-anchor"></div>
  </div>

</body>
</html>`;
}

export function renderEventItem(event: {
  id: number;
  streamId: string;
  eventType: string;
  data: Record<string, unknown>;
  createdAt: string;
}, runId?: number): string {
  const time = event.createdAt.split(" ")[1] ?? event.createdAt;
  const dataStr = JSON.stringify(event.data);
  const shortData = dataStr.length > 120 ? dataStr.slice(0, 120) + "\u2026" : dataStr;
  const runAttr = runId != null ? ` id="run-${runId}"` : "";

  return /* html */ `
    <div class="event"${runAttr}>
      <div class="event-header">
        <span class="event-type">${escHtml(event.eventType)}</span>
        <span class="event-stream">${escHtml(event.streamId)}</span>
        <span class="event-time">${escHtml(time)}</span>
      </div>
      <div class="event-data">${escHtml(shortData)}</div>
    </div>
  `;
}

export function renderRunBadge(runId: number, count: number, event: {
  eventType: string;
  streamId: string;
  data: Record<string, unknown>;
  createdAt: string;
}): string {
  const time = event.createdAt.split(" ")[1] ?? event.createdAt;
  const dataStr = JSON.stringify(event.data);
  const shortData = dataStr.length > 120 ? dataStr.slice(0, 120) + "\u2026" : dataStr;

  return /* html */ `
    <div class="event" id="run-${runId}">
      <div class="event-header">
        <span class="event-type">${escHtml(event.eventType)}</span>
        <span class="run-count">&times;${count}</span>
        <span class="event-stream">${escHtml(event.streamId)}</span>
        <span class="event-time">${escHtml(time)}</span>
      </div>
      <div class="event-data">${escHtml(shortData)}</div>
    </div>
  `;
}
