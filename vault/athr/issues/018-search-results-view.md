---
title: "Search Results View"
type: issue
id: ISSUE-018
status: done
priority: medium
created: 2026-04-11
updated: 2026-04-13
epic: "[[004-search]]"
related:
  - "[[016-search-create]]"
  - "[[017-search-refine]]"
tags:
  - search
  - views
  - html
estimate: small
---

# Search Results View

HTML template for search results rendered into `#content`.

## Layout

```
┌──────────────────────────────────────┐
│ Search: [radiohead          ] [🔍]   │
│                                      │
│ Filters: [Rock ✕] [All Years ▾]     │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ▶ Paranoid Android  —  Radiohead │ │
│ │   OK Computer · 1997     6:23    │ │
│ ├──────────────────────────────────┤ │
│ │ ▶ Karma Police  —  Radiohead     │ │
│ │   OK Computer · 1997     4:22    │ │
│ ├──────────────────────────────────┤ │
│ │ ▶ Everything In Its...  —  Radio │ │
│ │   Kid A · 2000           3:48    │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Page 1 of 3   [← Prev] [Next →]     │
└──────────────────────────────────────┘
```

## Interactions

- **Search input**: `data-bind:_search-query` with debounced `@post` on input
- **Filter toggles**: `@post` to refine search
- **Track row play button**: `@post('/s/:id/play', { trackId: '...' })`
- **Track row click**: Navigate to album view
- **Pagination**: `@post` to change page

## Rendering

```typescript
function renderSearchResults(searchId: string): string {
  const search = getSearchProjection(searchId);
  const results = JSON.parse(search.results);

  return `
    <div class="search-view">
      <div class="search-bar">
        <input type="text" value="${search.query}"
               data-bind:_search-query
               data-on:input__debounce.300ms="@post('/s/:id/searches/${searchId}')" />
      </div>
      <div class="search-filters">...</div>
      <div class="search-results">
        ${results.map(renderTrackRow).join("")}
      </div>
      <div class="search-pagination">...</div>
    </div>
  `;
}
```

## Tasks

- [ ] `renderSearchResults()` template function
- [ ] Search bar with debounced input
- [ ] Track row template with play button
- [ ] Filter chips
- [ ] Pagination controls
- [ ] Empty state and loading state
