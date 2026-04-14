---
title: "CLI Binary (athr)"
type: issue
id: ISSUE-022
status: done
priority: high
created: 2026-04-11
updated: 2026-04-13
epic: "[[002-session-and-shell]]"
related:
  - "[[010-catalogue-seed]]"
  - "[[019-settings-popup]]"
tags:
  - cli
  - binary
  - bun
estimate: medium
---

# CLI Binary

Single binary built with `bun build --compile`. Name TBD (candidates: pulsar, aether, chorus, doppler, lyra, whistler).

## Usage

```bash
# Start the server, scan ~/Music for audio files
athr serve --dir ~/Music

# Start on a custom port
athr serve --dir ~/Music --port 8080

# Future subcommands
athr config           # print current config
athr config set dir ~/other-music
athr scan             # rescan library without starting server
```

## Building

```bash
bun build --compile src/cli.ts --outfile athr
```

Produces a single self-contained binary. No Bun installation needed to run it.

## CLI entry point

```typescript
// src/cli.ts
import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  positional: true,
  options: {
    dir: { type: "string", short: "d" },
    port: { type: "string", short: "p", default: "3000" },
    help: { type: "boolean", short: "h" },
  },
});

const command = positionals[0];

switch (command) {
  case "serve":
    // validate --dir exists
    // scan music directory
    // start Hono server
    break;
  case "config":
    // read/write config file
    break;
  default:
    printHelp();
}
```

## Config file

`~/.config/athr/config.json` (or XDG_CONFIG_HOME):

```json
{
  "dir": "/Users/drk/Music",
  "port": 3000
}
```

CLI flags override config file. Settings popup can write to config file and trigger a rescan.

## Music directory configuration

The source folder is configurable from three places (in priority order):

1. **CLI flag**: `athr serve --dir ~/Music`
2. **Config file**: `~/.config/athr/config.json`
3. **Settings popup**: `POST /s/:id/settings/update { key: "dir", value: "/new/path" }`

When changed via the settings popup:
1. Append `SettingsUpdated` event
2. Write new path to config file
3. Trigger library rescan
4. SSE pushes updated library view to main window

## Tasks

- [ ] `src/cli.ts` entry point with `parseArgs`
- [ ] `serve` subcommand — validate dir, scan, start server
- [ ] Config file read/write (`~/.config/athr/config.json`)
- [ ] `bun build --compile` script in package.json
- [ ] `--help` output
- [ ] Settings popup writes to config file
- [ ] Rescan trigger from settings
