---
title: "Session & Application Shell"
type: epic
id: EPIC-002
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
tags:
  - session
  - shell
  - sse
  - datastar
depends_on:
  - "[[001-event-sourcing-foundation]]"
issues:
  - "[[005-session-lifecycle]]"
  - "[[006-app-shell]]"
  - "[[007-sse-stream]]"
  - "[[008-view-navigation]]"
  - "[[009-url-and-popstate]]"
  - "[[022-cli-binary]]"
---

# Session & Application Shell

Establish the session-as-resource model and the single-document application shell. A session is created on first visit, persisted in the event store, and drives all subsequent interactions. The shell is the HTML document that never navigates — content is morphed via SSE.

## Acceptance Criteria

- Visiting `/` creates a new session and redirects to `/s/:id`
- The shell renders with nav, content area, and player placeholder
- A long-lived SSE connection opens on load and streams content patches
- "Navigation" between views happens via `@post` commands that morph `#content`
- URL bar updates via `data-replace-url` to reflect current view
- Back/forward buttons work via popstate handler
- Deep linking works: `GET /s/:id/album/123` renders the shell with album view pre-populated

## Issues

- [[005-session-lifecycle]] — Create, load, redirect
- [[006-app-shell]] — HTML shell layout with nav, content, player areas
- [[007-sse-stream]] — Long-lived SSE connection for content + player patches
- [[008-view-navigation]] — POST commands to change view, morph #content
- [[009-url-and-popstate]] — URL bar sync and back/forward support
- [[022-cli-binary]] — Single binary CLI with `serve` subcommand
