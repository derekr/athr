---
title: "Refine Search Session"
type: issue
id: ISSUE-017
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
epic: "[[004-search]]"
related:
  - "[[016-search-create]]"
  - "[[018-search-results-view]]"
tags:
  - search
  - mutation
  - events
estimate: small
---

# Refine Search Session

Mutate an existing search resource — update query, toggle filters, change page. The search resource is modified in place, not replaced.

## Route

```
POST /s/:id/searches/:searchId → { query?: string, filters?: Record<string, string>, page?: number }
```

## Events

```typescript
// Query or filter change
{
  type: "SearchRefined",
  stream: "search:srch_xyz",
  data: { query: "radiohead ok computer", filters: { genre: "rock" } }
}

// Page change
{
  type: "SearchPageChanged",
  stream: "search:srch_xyz",
  data: { page: 2 }
}
```

## Projection update

1. Update search projection with new query/filters/page
2. Re-run catalogue query with updated parameters
3. Cache new results in projection
4. SSE morphs search results view (content area)

## URL behavior

Same URL — `/s/:id/search/srch_xyz`. The resource was mutated, not replaced. This is the key difference from query-param search: the URL is a handle to a stateful object, not an encoding of the search parameters.

## Tasks

- [ ] POST handler for search refinement
- [ ] SearchRefined and SearchPageChanged event definitions
- [ ] Search projection apply functions
- [ ] Re-query and cache update
- [ ] SSE push updated results
