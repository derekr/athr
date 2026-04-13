#!/usr/bin/env bun
// Entry point for the `athr` binary
// Built with: bun build --compile src/cli.ts --outfile athr

import app from './index'

const port = parseInt(process.env.PORT ?? '3000', 10)

// TODO: parse CLI args (serve --dir ~/Music --port 8080, config, scan)
const server = Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`athr running at http://localhost:${server.port}`)
