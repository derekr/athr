---
title: "Progress Bar View Transition"
type: issue
id: ISSUE-015
status: done
priority: low
created: 2026-04-11
updated: 2026-04-13
epic: "[[003-playback]]"
related:
  - "[[013-player-chrome]]"
tags:
  - view-transitions
  - css
  - animation
estimate: trivial
---

# Progress Bar View Transition

Carry over from the upload demo — the playback progress bar fill is the only element with a `view-transition-name`. Since the app is single-document (no real navigation), this mainly applies to SSE morph updates of the player chrome.

## CSS

```css
@view-transition { navigation: auto; }

::view-transition-old(root),
::view-transition-new(root) { animation: none; }
```

## Progress fill

```html
<div class="progress-fill"
     style="width: 32%; view-transition-name: playback-progress;">
</div>
```

The `transition: width 0.3s ease` CSS property handles smooth updates from SSE morphs. The `view-transition-name` is available if needed but may not trigger in a single-document morph context (view transitions are primarily for cross-document navigations).

## Tasks

- [ ] Add view-transition-name to progress bar fill
- [ ] CSS transition on width for smooth SSE updates
- [ ] Test whether view transitions fire on Datastar morphs
