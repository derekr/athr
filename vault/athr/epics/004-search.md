---
title: "Search Sessions"
type: epic
id: EPIC-004
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
tags:
  - search
  - resource
  - cqrs
depends_on:
  - "[[001-event-sourcing-foundation]]"
  - "[[002-session-and-shell]]"
issues:
  - "[[016-search-create]]"
  - "[[017-search-refine]]"
  - "[[018-search-results-view]]"
---

# Search Sessions

Search as a first-class server-side resource. Instead of query params, creating a search produces a resource with its own stream of events. Filters, pagination, and results are server-owned state. Navigating away and back restores the search instantly.

## The pattern

```
User types "radiohead"
  → POST /s/:id/searches { query: "radiohead" }
  → Server creates search:srch_xyz
  → Appends SearchCreated event
  → Runs query, caches results in projection
  → SSE morphs #content with search results
  → URL updates to /s/:id/search/srch_xyz

User toggles "rock" genre filter
  → POST /s/:id/searches/srch_xyz { filters: { genre: "rock" } }
  → Appends SearchRefined event
  → Re-runs query, updates cached results
  → SSE morphs with filtered results
  → Same URL (resource was mutated, not replaced)

User navigates to album, then hits back
  → Popstate fires with /s/:id/search/srch_xyz
  → Server looks up srch_xyz, renders from cached results
  → Instant — no re-querying
```

## Acceptance Criteria

- Submitting a search creates a search resource with a unique ID
- Search results render in #content via SSE morph
- Refining (new query, filter toggle, page change) mutates the existing search
- Navigating away and back loads the search from its cached state
- Search URL is shareable (deep link works on first load)

## Issues

- [[016-search-create]] — POST handler, event, projection, initial render
- [[017-search-refine]] — Mutation handler, filter/query/page updates
- [[018-search-results-view]] — Search results HTML template
