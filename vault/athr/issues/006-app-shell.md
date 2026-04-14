---
title: "Application Shell"
type: issue
id: ISSUE-006
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[002-session-and-shell]]"
related:
  - "[[005-session-lifecycle]]"
  - "[[007-sse-stream]]"
  - "[[013-player-chrome]]"
tags:
  - layout
  - html
  - datastar
estimate: medium
---

# Application Shell

The single HTML document that never navigates. Contains nav, content area, and player. The SSE connection drives all updates.

## Structure

```html
<body>
  <nav id="nav">
    <!-- @post commands for view navigation -->
    <a data-on:click__prevent="@post('/s/:id/view/library')">Library</a>
    <a data-on:click__prevent="@post('/s/:id/view/search')">Search</a>
    <button data-on:keydown__window="
      evt.metaKey && evt.key === ',' && window.open(...)
    ">Settings</button>
  </nav>

  <main id="content">
    <!-- Morphed by SSE — library, album, artist, search views -->
  </main>

  <div id="player"
       data-signals:_track-url="''"
       data-signals:_is-playing="false"
       data-signals:_seek-to="-1"
       data-init="@get('/s/:id/sse')">
    <audio id="audio" data-ignore-morph></audio>
    <!-- Player chrome: track info, controls, progress bar -->
  </div>
</body>
```

## Key decisions

- `data-init` on `#player` opens the SSE connection (not on `#content`)
- `<audio>` has `data-ignore-morph` — never touched by Datastar
- Audio controlled via signals: `_trackUrl`, `_isPlaying`, `_seekTo` (underscore prefix = local, not sent to server)
- `data-effect` on `#player` watches signals and drives the audio element
- Nav links use `data-on:click__prevent` to prevent default link behavior

## CSS

- View transitions enabled, default crossfade disabled
- Only progress bar fill has `view-transition-name`
- Dark theme consistent with existing upload demo

## Tasks

- [ ] Create `src/views/shell.ts` — shell layout function
- [ ] Nav with @post navigation commands
- [ ] Player area with signals, audio element, data-effect
- [ ] CSS with view transition setup
- [ ] Pre-render current view on initial load (from session projection)
