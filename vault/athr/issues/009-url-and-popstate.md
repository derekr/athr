---
title: "URL Sync & Popstate"
type: issue
id: ISSUE-009
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
epic: "[[002-session-and-shell]]"
related:
  - "[[008-view-navigation]]"
tags:
  - navigation
  - url
  - deep-linking
estimate: small
---

# URL Sync & Popstate

Keep the URL bar in sync with the current view, and handle back/forward navigation.

## URL update on view change

When a view change command completes, the server sends an `execute-script` event to push the new URL:

```
event: datastar-execute-script
data: script history.pushState({}, '', '/s/sess_abc/album/alb_123')
```

Or use Datastar's `data-replace-url` attribute on the morphed content.

## Popstate (back/forward)

The shell includes a popstate listener:

```html
<div data-on:popstate__window="@post('/s/:id/view/resolve', {
  filterSignals: { exclude: /.*/ }
})"></div>
```

The `/view/resolve` endpoint reads `window.location.pathname` (sent as a header or parsed from referer) and maps it to a view command.

Alternatively, use `datastar-execute-script` to attach a more direct listener:

```javascript
window.addEventListener('popstate', () => {
  // Extract view from URL path and trigger navigation
  const path = window.location.pathname;
  // POST to server to resolve the URL to a view
});
```

## Deep linking

`GET /s/:id/album/alb_123` on first load:

1. Server reads the path suffix (`/album/alb_123`)
2. Sets session's current view to `album` with `viewData: { albumId: "alb_123" }`
3. Renders the shell with album content pre-populated in `#content`

This means the main `GET /s/:id` route needs to accept an optional path suffix and resolve it.

## Open questions

- Should view history be stored in the event log (ViewChanged events already capture it) or rely solely on browser history?
- How to handle forward navigation — the event log has the sequence, but the browser's forward stack may diverge.

## Tasks

- [ ] URL push after view change commands
- [ ] Popstate handler in shell HTML
- [ ] `/view/resolve` endpoint to map URL → view command
- [ ] Deep link handling on `GET /s/:id/*`
