# TypeScript Backend Reference

Use this file for Datastar + TypeScript backend implementation details.

## SDK Installation

```bash
bun add @starfederation/datastar-sdk
```

Bun uses the web runtime import:

```ts
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web"
```

## Basic Handler Pattern (Bun / Hono)

```ts
import { Hono } from "hono"
import { ServerSentEventGenerator } from "@starfederation/datastar-sdk/web"

const app = new Hono()

type CounterSignals = {
  count?: number
  name?: string
}

app.post("/counter/increment", async (c) => {
  const reader = await ServerSentEventGenerator.readSignals(c.req.raw)
  if (!reader.success) return c.text(reader.error ?? "Invalid signals", 400)

  const signals = (reader.signals ?? {}) as CounterSignals
  const nextCount = (signals.count ?? 0) + 1

  return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
    stream.patchSignals(JSON.stringify({ count: nextCount }))
    stream.patchElements(`<p id="counter">Current count: ${nextCount}</p>`)
  })
})
```

## Reading Client Signals

```ts
const reader = await ServerSentEventGenerator.readSignals(c.req.raw)
if (!reader.success) return c.text(reader.error ?? "Bad Request", 400)

const { email = "", password = "", remember = false } =
  (reader.signals ?? {}) as {
    email?: string
    password?: string
    remember?: boolean
  }
```

## SSE Event Methods

```ts
return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
  // Patch DOM elements (morph by default)
  stream.patchElements('<div id="result">Updated content</div>')

  // Append to a list
  stream.patchElements('<li>New Item</li>', {
    selector: "#item-list",
    mode: "append",
  })

  // Remove elements
  stream.removeElements("#temporary-message")

  // Update signals
  stream.patchSignals(JSON.stringify({
    count: 42,
    message: "Hello",
    user: { name: "John", email: "john@example.com" },
  }))

  // Set signal only if not already present
  stream.patchSignals(JSON.stringify({ defaultTheme: "dark" }), {
    onlyIfMissing: true,
  })

  // Remove signals
  stream.removeSignals("errorMessage")
  stream.removeSignals(["draft", "tempSelection"])

  // Execute client-side script
  stream.executeScript("window.scrollTo({ top: 0, behavior: 'smooth' })", {
    autoRemove: true,
  })
})
```

`patchElements(..., { mode })` supports:
`outer` (default/morph), `inner`, `replace`, `prepend`, `append`, `before`, `after`, `remove`.

## Multi-Step SSE Response

```ts
return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
  stream.patchSignals(JSON.stringify({ loading: true }))

  // ...do work...

  stream.patchSignals(JSON.stringify({ loading: false, saved: true }))
  stream.patchElements('<div id="result" class="success">Saved!</div>')
})
```

## Error Handling

```ts
return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
  const email = String((reader.signals as any)?.email ?? "").trim()

  if (!email) {
    stream.patchSignals(JSON.stringify({ loading: false, hasError: true, errorMessage: "Email is required" }))
    stream.patchElements('<div id="form-error" class="error">Email is required</div>')
    return
  }

  stream.patchSignals(JSON.stringify({ loading: false, hasError: false }))
  stream.patchElements('<div id="form-error"></div>')
})
```

## Long-Lived SSE Stream (GET /s/:id/sse)

For the main SSE stream, use Hono's `stream` helper directly — `ServerSentEventGenerator.stream` is for short-lived POST responses:

```ts
import { stream } from "hono/streaming"

app.get("/s/:id/sse", (c) => {
  const sessionId = c.req.param("id")
  return stream(c, async (s) => {
    s.onAbort(() => { /* unsubscribe from EventBus */ })

    // Write raw Datastar SSE events:
    // event: datastar-patch-elements
    // data: {"selector":"#content","elements":"<div>...</div>"}
    //
    // event: datastar-patch-signals
    // data: {"signals":{"_isPlaying":true}}
    await s.write(`event: datastar-patch-elements\ndata: ${JSON.stringify({ elements: html })}\n\n`)
  })
})
```

## Common Patterns

### Live Search with Debouncing

```ts
const query = String((reader.signals as any)?.query ?? "").trim().toLowerCase()

return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
  if (query.length < 2) {
    stream.patchElements('<ul id="search-results"></ul>')
    return
  }
  const items = catalogue.search(query).map((v) => `<li>${v.title}</li>`).join("")
  stream.patchElements(`<ul id="search-results">${items}</ul>`)
})
```

### Infinite Scroll / Load More

```ts
return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
  const page = Number((reader.signals as any)?.page ?? 0)
  const next = page + 1
  const rows = loadPage(next).map((item) => `<li>${item.title}</li>`).join("")

  stream.patchElements(rows, { selector: "#feed", mode: "append" })
  stream.patchSignals(JSON.stringify({ page: next }))
})
```

### Loading Indicators

```ts
return ServerSentEventGenerator.stream(c.req.raw, (stream) => {
  stream.patchSignals(JSON.stringify({ loading: true }))
  // ...work...
  stream.patchSignals(JSON.stringify({ loading: false }))
})
```

## Common Gotchas

1. **Signal casing** — keep server field names in `camelCase` matching client signal names.
2. **Actions require `@` prefix** — `@post('/endpoint')` not `post('/endpoint')`.
3. **Stable element IDs** — morphing targets elements by `id`; keep them stable across patches.
4. **SSE headers** — do not let proxies buffer `text/event-stream` responses.
5. **Underscore signals are local** — `$_foo` is never sent to the server by default.
6. **Request cancellation** — rapid interactions cancel in-flight requests; keep handlers idempotent.
7. **Empty vs missing signals** — treat missing and empty values differently when business logic depends on it.
8. **Type coercion** — validate and coerce types on the backend (`number`, `boolean`) to avoid drift.

## SSE Event Types (Raw)

- `datastar-patch-elements`
- `datastar-patch-signals`
- `datastar-remove-elements`
- `datastar-remove-signals`
- `datastar-execute-script`

## Reference Links

- [Datastar TypeScript SDK](https://github.com/starfederation/datastar-typescript)
- [Datastar docs](https://data-star.dev)
