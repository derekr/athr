---
title: "Settings Popup Window"
type: issue
id: ISSUE-019
status: done
priority: low
created: 2026-04-11
updated: 2026-04-13
epic: "[[005-auxiliary-windows]]"
related:
  - "[[006-app-shell]]"
tags:
  - popup
  - settings
  - auxiliary
estimate: small
---

# Settings Popup Window

Settings opens as a native-style popup window via `window.open`. It's a separate HTML document that POSTs commands to the same session.

## Opening

From the main window, Cmd+, or a nav button:

```html
<button data-on:click="window.open(
  '/s/${sessionId}/settings',
  'settings',
  'width=500,height=600'
)">Settings</button>
```

Also via keyboard shortcut:

```html
<div data-on:keydown__window="
  evt.metaKey && evt.key === ',' &&
  (evt.preventDefault(), window.open('/s/${sessionId}/settings', 'settings', 'width=500,height=600'))
"></div>
```

## Page

`GET /s/:id/settings` — full HTML page, no player, no nav. Just settings content. Has its own Datastar script tag and can POST to the session.

## Settings

For POC:

- Music directory path (triggers rescan)
- Theme (dark/light — just to demonstrate cross-window state sync)
- Audio quality / crossfade (placeholder)

## Cross-window sync

Settings changes POST to `/s/:id/settings/update`. This appends a `SettingsUpdated` event. The main window's SSE stream picks it up and can react (e.g., theme change morphs the shell).

## Tasks

- [ ] `GET /s/:id/settings` route and template
- [ ] `POST /s/:id/settings/update` command handler
- [ ] SettingsUpdated event and projection
- [ ] Keyboard shortcut in main shell
- [ ] Cross-window reactivity via SSE
