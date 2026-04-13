import type { SessionRow } from "../projections/session";
import { renderView } from "./content";

const DATASTAR_CDN =
  "https://cdn.jsdelivr.net/gh/starfederation/datastar@v1.0.0-RC.8/bundles/datastar.min.js";

const dataEffect = [
  "const audio = document.getElementById('audio');",
  "if (!audio) return;",
  "if ($_trackUrl && !audio.src.endsWith($_trackUrl)) {",
  "  audio.src = $_trackUrl;",
  "  if ($_seekTo >= 0) audio.currentTime = $_seekTo / 1000;",
  "}",
  "if ($_isPlaying && audio.paused) audio.play().catch(function() { $_isPlaying = false; });",
  "if (!$_isPlaying && !audio.paused) audio.pause();",
  "audio.volume = $_volume;",
  "if ($_seekTo >= 0 && $_trackUrl && audio.src.endsWith($_trackUrl)) {",
  "  audio.currentTime = $_seekTo / 1000;",
  "  $_seekTo = -1;",
  "}",
  "if ($_mediaTitle && navigator.mediaSession) {",
  "  var aw = $_mediaArtwork ? [{src: $_mediaArtwork, type: 'image/jpeg'}] : [];",
  "  navigator.mediaSession.metadata = new MediaMetadata({title: $_mediaTitle, artist: $_mediaArtist, album: $_mediaAlbum, artwork: aw});",
  "}",
].join(" ");

export function renderShell(sessionId: string, session: SessionRow): string {
  const viewHtml = renderView(sessionId, session);

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>athr</title>
  <script type="module" src="${DATASTAR_CDN}"></script>
  <script type="module">
    import { initLog, log } from '/public/evlog-client.js';
    initLog({
      service: 'athr-web',
      transport: {
        enabled: true,
        endpoint: '/api/_evlog/ingest',
      },
    });
    log.info({ action: 'app_init', path: window.location.pathname, sessionId: '${sessionId}' });
    window.__evlog = log;
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f0f0f;
      --surface: #1a1a1a;
      --surface2: #242424;
      --border: #333;
      --text: #e8e8e8;
      --text-muted: #888;
      --accent: #7c6af7;
      --accent-hover: #9585ff;
      color-scheme: dark;
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
    }

    body {
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: 1fr;
      height: 100dvh;
      overflow: hidden;
    }

    /* Nav */
    #nav {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 16px;
      height: 48px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }

    #nav .app-name {
      font-weight: 700;
      font-size: 16px;
      color: var(--accent);
      margin-right: 12px;
    }

    #nav button, #nav a {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      background: none;
      border: none;
      border-radius: 6px;
      color: var(--text-muted);
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: color 0.15s, background 0.15s;
    }

    #nav button:hover, #nav a:hover {
      color: var(--text);
      background: var(--surface2);
    }

    #nav button.active, #nav a.active {
      color: var(--text);
      background: var(--surface2);
    }

    /* Content area */
    #content {
      overflow-y: auto;
      padding: 24px;
    }

    /* Player */
    #player {
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 12px 16px;
    }

    /* Player chrome */
    #player-chrome {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .player-transport {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .player-transport button {
      background: none;
      border: none;
      color: var(--text);
      cursor: pointer;
      padding: 6px;
      border-radius: 50%;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .player-transport button:hover {
      background: var(--surface2);
    }

    .player-track-info {
      flex: 1;
      min-width: 0;
    }

    .track-title {
      display: block;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-artist {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 2;
      min-width: 0;
    }

    .time-label {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .progress-track {
      flex: 1;
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
      cursor: pointer;
    }

    .progress-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.3s linear;
      view-transition-name: playback-progress;
    }

    .player-volume {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .player-volume input[type=range] {
      width: 80px;
      accent-color: var(--accent);
    }

    /* Library/content views */
    .view-header {
      margin-bottom: 24px;
    }

    .view-header h1 {
      font-size: 24px;
      font-weight: 700;
    }

    .track-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .track-row {
      display: grid;
      grid-template-columns: 36px 1fr auto auto;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.1s;
    }

    .track-row:hover {
      background: var(--surface2);
    }

    .track-row.now-playing {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }

    .track-row.now-playing .track-num {
      color: var(--accent);
    }

    .track-row .track-num {
      color: var(--text-muted);
      font-size: 13px;
      text-align: center;
    }

    .track-row .track-info { min-width: 0; }

    .track-row .track-name {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
    }

    .track-row .track-meta {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-row .track-duration {
      font-size: 12px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .track-row .track-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.1s;
    }

    .track-row:hover .track-actions {
      opacity: 1;
    }

    .track-row .track-actions button {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 13px;
      transition: color 0.1s, background 0.1s;
    }

    .track-row .track-actions button:hover {
      color: var(--text);
      background: var(--surface);
    }

    /* Album/Artist grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 16px;
    }

    .grid-card {
      cursor: pointer;
      border-radius: 8px;
      overflow: hidden;
      transition: transform 0.15s;
    }

    .grid-card:hover { transform: translateY(-2px); }

    .grid-card .cover {
      width: 100%;
      aspect-ratio: 1;
      background: var(--surface2);
      object-fit: cover;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
    }

    .grid-card img.cover {
      display: block;
      font-size: inherit;
    }

    .grid-card .card-info {
      padding: 8px;
    }

    .grid-card .card-title {
      font-weight: 600;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .grid-card .card-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 24px;
      text-align: center;
      color: var(--text-muted);
    }

    .empty-state .icon { font-size: 64px; margin-bottom: 16px; }
    .empty-state h2 { font-size: 20px; margin-bottom: 8px; color: var(--text); }
    .empty-state p { font-size: 14px; max-width: 300px; }

    /* Search */
    .search-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .search-bar input {
      flex: 1;
      padding: 10px 14px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 14px;
    }

    .search-bar input:focus {
      outline: none;
      border-color: var(--accent);
    }

    /* View transitions */
    @view-transition { navigation: auto; }

    ::view-transition-old(root),
    ::view-transition-new(root) { animation: none; }
  </style>
</head>
<body>
  <nav id="nav">
    <span class="app-name">athr</span>
    <button
      data-on:click__prevent="@post('/s/${sessionId}/view/library')"
      class="${session.current_view === "library" ? "active" : ""}">
      Library
    </button>
    <button
      data-on:click__prevent="@post('/s/${sessionId}/view/search')"
      class="${session.current_view === "search" ? "active" : ""}">
      Search
    </button>
    <button
      data-on:click="window.open('/s/${sessionId}/queue', 'queue', 'width=400,height=600')">
      Queue
    </button>
    <button
      data-on:click="window.open('/s/${sessionId}/settings', 'settings', 'width=500,height=600')">
      Settings
    </button>
    <button
      data-on:click="window.open('/s/${sessionId}/mini', 'mini', 'width=320,height=120,toolbar=no,menubar=no')">
      Mini
    </button>
    <button
      data-on:click="window.open('/s/${sessionId}/events', 'events', 'width=500,height=700')">
      Events
    </button>
  </nav>

  <main id="content">
    ${viewHtml}
  </main>

  <div id="player"
       data-signals:_track-url="''"
       data-signals:_is-playing="false"
       data-signals:_seek-to="-1"
       data-signals:_volume="1.0"
       data-signals:_media-title="''"
       data-signals:_media-artist="''"
       data-signals:_media-album="''"
       data-signals:_media-artwork="''"
       data-effect="${dataEffect}"
       data-init="@get('/s/${sessionId}/sse')">

    <audio id="audio"
           data-ignore-morph
           data-on:ended__debounce.100ms="@post('/s/${sessionId}/playback/next')">
    </audio>

    <script>
      (function() {
        var audio = document.getElementById('audio');
        if (!audio) return;
        function fmt(s) {
          var m = Math.floor(s / 60);
          var sec = Math.floor(s) % 60;
          return m + ':' + (sec < 10 ? '0' : '') + sec;
        }
        // Smooth local progress (sub-second)
        audio.addEventListener('timeupdate', function() {
          var fill = document.getElementById('progress-fill');
          var elPos = document.getElementById('time-pos');
          var dur = audio.duration || 0;
          if (fill && dur > 0) fill.style.width = (audio.currentTime / dur * 100).toFixed(2) + '%';
          if (elPos) elPos.textContent = fmt(audio.currentTime);
        });
        audio.addEventListener('loadedmetadata', function() {
          var elDur = document.getElementById('time-dur');
          if (elDur) elDur.textContent = fmt(audio.duration || 0);
        });
        // Sync position to server every 1s so other windows stay in sync
        var lastSync = 0;
        audio.addEventListener('timeupdate', function() {
          if (audio.paused) return;
          var now = Date.now();
          if (now - lastSync < 1000) return;
          if (isNaN(audio.currentTime)) return;
          lastSync = now;
          var trackPath = audio.src.split('/').pop() || '';
          fetch('/s/${sessionId}/playback/sync/' + trackPath + '/' + Math.floor(audio.currentTime * 1000), { method: 'POST', keepalive: true });
        });

        // Media Session API — browser/OS media controls
        var sid = '${sessionId}';
        function postAction(path) { fetch(path, { method: 'POST', keepalive: true }); }

        navigator.mediaSession.setActionHandler('play', function() { postAction('/s/' + sid + '/playback/resume'); });
        navigator.mediaSession.setActionHandler('pause', function() { postAction('/s/' + sid + '/playback/pause'); });
        navigator.mediaSession.setActionHandler('nexttrack', function() { postAction('/s/' + sid + '/playback/next'); });
        navigator.mediaSession.setActionHandler('previoustrack', function() { postAction('/s/' + sid + '/playback/prev'); });
        navigator.mediaSession.setActionHandler('seekto', function(details) {
          if (details.seekTime != null) {
            audio.currentTime = details.seekTime;
            postAction('/s/' + sid + '/playback/seek/' + Math.floor(details.seekTime * 1000));
          }
        });

        // Media Session — driven by server-pushed signals
        audio.addEventListener('play', function() { navigator.mediaSession.playbackState = 'playing'; });
        audio.addEventListener('pause', function() { navigator.mediaSession.playbackState = 'paused'; });
      })();
    </script>

    <div id="player-chrome">
      <!-- Morphed by SSE on playback events -->
    </div>
  </div>

  <div data-on:keydown__window="
    if (evt.metaKey && evt.key === ',') {
      evt.preventDefault();
      window.open('/s/${sessionId}/settings', 'settings', 'width=500,height=600');
    }
  "></div>

  <div data-on:popstate__window="@post('/s/${sessionId}/view/resolve')"></div>
</body>
</html>`;
}
