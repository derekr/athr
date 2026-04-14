---
title: "Mini Player Popup"
type: issue
id: ISSUE-021
status: done
priority: low
created: 2026-04-11
updated: 2026-04-13
epic: "[[005-auxiliary-windows]]"
related:
  - "[[013-player-chrome]]"
tags:
  - popup
  - player
  - auxiliary
estimate: trivial
---

# Mini Player Popup

A small popup window with just transport controls and track info. Like Spotify's mini player or macOS Now Playing widget.

## Opening

```html
<button data-on:click="window.open(
  '/s/${sessionId}/mini',
  'mini',
  'width=320,height=100,toolbar=no,menubar=no'
)">Mini Player</button>
```

## Page

`GET /s/:id/mini` — minimal HTML page:

```
┌──────────────────────────┐
│ ◀◀  ▶/❚❚  ▶▶            │
│ Track Title — Artist     │
│ ────●───────── 1:23/4:56 │
└──────────────────────────┘
```

- Own SSE via `data-init="@get('/s/:id/sse')"` (reuses main SSE handler, just renders mini chrome)
- Transport controls POST to same playback commands
- No audio element — playback runs in the main window

## Tasks

- [ ] `GET /s/:id/mini` route and template
- [ ] Compact player chrome template
- [ ] Transport controls wired to session commands
- [ ] SSE connection for live updates
