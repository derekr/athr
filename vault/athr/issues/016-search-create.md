---
title: "Create Search Session"
type: issue
id: ISSUE-016
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
epic: "[[004-search]]"
related:
  - "[[017-search-refine]]"
  - "[[018-search-results-view]]"
tags:
  - search
  - commands
  - events
estimate: medium
---

# Create Search Session

Creating a search is a command that produces a new sub-resource with its own event stream.

## Route

```
POST /s/:id/searches → { query: string, filters?: Record<string, string> }
```

## Flow

1. Generate search ID: `srch_` + 12 chars
2. Append `SearchCreated` event to `search:srch_xyz` stream
3. Run query against catalogue tables
4. Cache results in search projection
5. Append `ViewChanged` event to `session:{id}` stream with `{ view: "search", viewData: { searchId: "srch_xyz" } }`
6. SSE pushes search results into `#content`
7. URL updates to `/s/:id/search/srch_xyz`

## Event

```typescript
// On search stream
{
  type: "SearchCreated",
  stream: "search:srch_xyz",
  data: {
    sessionId: "sess_abc",
    query: "radiohead",
    filters: {}
  }
}

// On session stream (triggers view update)
{
  type: "ViewChanged",
  stream: "session:sess_abc",
  data: {
    view: "search",
    viewData: { searchId: "srch_xyz" }
  }
}
```

## Query execution

Simple `LIKE` search across tracks, albums, and artists:

```sql
SELECT t.*, al.title as album_title, ar.name as artist_name
FROM tracks t
JOIN albums al ON t.album_id = al.id
JOIN artists ar ON t.artist_id = ar.id
WHERE t.title LIKE ? OR ar.name LIKE ? OR al.title LIKE ?
ORDER BY ar.name, al.year, t.track_number
```

FTS can be added later if needed.

## Tasks

- [ ] POST handler for search creation
- [ ] SearchCreated event definition
- [ ] Search projection (create row with cached results)
- [ ] Catalogue query logic
- [ ] ViewChanged event to switch content area
- [ ] URL update
