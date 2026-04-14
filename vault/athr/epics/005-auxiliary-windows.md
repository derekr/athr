---
title: "Auxiliary Windows"
type: epic
id: EPIC-005
status: done
priority: low
created: 2026-04-11
updated: 2026-04-13
tags:
  - popup
  - settings
  - auxiliary
depends_on:
  - "[[002-session-and-shell]]"
  - "[[003-playback]]"
issues:
  - "[[019-settings-popup]]"
  - "[[020-queue-popup]]"
  - "[[021-mini-player]]"
---

# Auxiliary Windows

Secondary views open as popup windows (via `window.open`), mirroring native app patterns like Cmd+, for preferences. Each popup is a real HTML page with its own SSE connection to the same session. Commands from any window mutate shared session state.

## Acceptance Criteria

- Cmd+, opens settings in a popup window
- Queue detail view opens in a popup
- Mini player opens as a small popup
- Changes in popups reflect in the main window (and vice versa) via SSE
- Closing a popup has no effect on playback

## Issues

- [[019-settings-popup]] — Settings page in popup, POST to session
- [[020-queue-popup]] — Queue editor popup with own SSE
- [[021-mini-player]] — Minimal transport controls popup
