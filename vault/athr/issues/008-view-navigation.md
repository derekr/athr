---
title: "View Navigation Commands"
type: issue
id: ISSUE-008
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[002-session-and-shell]]"
related:
  - "[[007-sse-stream]]"
  - "[[009-url-and-popstate]]"
tags:
  - navigation
  - views
  - commands
estimate: medium
---

# View Navigation Commands

POST handlers that change the current view. The command appends a `ViewChanged` event, which triggers the SSE stream to morph `#content`.

## Routes

```
POST /s/:id/view/library
POST /s/:id/view/album/:albumId
POST /s/:id/view/artist/:artistId
```

## Event

```typescript
{
  type: "ViewChanged",
  stream: "session:{id}",
  data: {
    view: "album",           // library | album | artist | search
    viewData: { albumId: "alb_123" }
  }
}
```

## View templates

Each view is a function that reads projections/catalogue data and returns HTML:

```typescript
function renderView(sessionId: string): string {
  const session = getSessionProjection(sessionId);
  switch (session.currentView) {
    case "library": return renderLibrary();
    case "album":   return renderAlbum(session.currentViewData.albumId);
    case "artist":  return renderArtist(session.currentViewData.artistId);
    case "search":  return renderSearch(session.currentViewData.searchId);
    default:        return renderLibrary();
  }
}
```

## Response

The POST command responds with a minimal SSE event (or empty 204). The actual content update comes through the main SSE stream, which reacts to the ViewChanged event via the EventBus.

Alternatively, the POST response can include `data-replace-url` via an `execute-script` event to update the URL bar immediately, without waiting for the SSE stream.

## Tasks

- [ ] POST handlers for each view type
- [ ] ViewChanged event definition
- [ ] Session projection: update current_view on ViewChanged
- [ ] View rendering functions (library, album, artist)
- [ ] URL update via execute-script in POST response
