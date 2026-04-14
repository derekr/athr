#!/usr/bin/env bun
// Entry point for the `athr` binary
// Built with: bun build --compile src/cli.ts --outfile athr

import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    dir: { type: "string", short: "d" },
    port: { type: "string", short: "p" },
    help: { type: "boolean", short: "h" },
  },
});

const command = positionals[0];

function printHelp(): void {
  console.log(`
athr — local music player

Usage:
  athr serve [options]     Start the server
  athr config              Print current config
  athr config set <key> <value>  Update config
  athr scan                Rescan library without starting server

Options:
  -d, --dir <path>   Music directory
  -p, --port <port>  HTTP port (default: 3000)
  -h, --help         Show this help

Examples:
  athr serve --dir ~/Music
  athr serve --dir ~/Music --port 8080
  athr config set dir ~/Music
  athr scan
`.trim());
}

if (values.help || !command) {
  printHelp();
  process.exit(0);
}

async function runServe(): Promise<void> {
  const { readConfig } = await import("./lib/config");
  const { db, projectionEngine } = await import("./app");
  const { initCatalogue } = await import("./projections/catalogue");
  const { scanMusicDirectory } = await import("./lib/music-scanner");
  const appModule = await import("./index");

  const config = readConfig();
  const port = parseInt(values.port ?? String(config.port ?? 3000), 10);
  const musicDir = values.dir ?? config.dir;

  initCatalogue(db);

  if (musicDir) {
    console.log(`Scanning music directory: ${musicDir}`);
    const result = await scanMusicDirectory(musicDir, db);
    const counts = db.prepare(`SELECT
      (SELECT COUNT(*) FROM tracks) as tracks,
      (SELECT COUNT(*) FROM albums) as albums,
      (SELECT COUNT(*) FROM artists) as artists`).get() as { tracks: number; albums: number; artists: number };
    console.log(`Scan complete: ${counts.tracks} tracks, ${counts.albums} albums, ${counts.artists} artists (${result.added} added, ${result.removed} removed)`);
    if (result.errors.length > 0) {
      console.warn(`Scan errors (${result.errors.length}):`);
      for (const err of result.errors.slice(0, 10)) {
        console.warn(`  ${err}`);
      }
    }
  } else {
    console.log("No music directory configured. Use --dir or run: athr config set dir ~/Music");
  }

  void projectionEngine; // ensure initialized

  const server = Bun.serve({
    port,
    idleTimeout: 0,
    fetch: appModule.default.fetch,
  });

  console.log(`athr running at http://localhost:${server.port}`);
  if (musicDir) {
    console.log(`Music directory: ${musicDir}`);
  }
}

async function runConfig(): Promise<void> {
  const { readConfig, updateConfig } = await import("./lib/config");
  const subCmd = positionals[1];

  if (subCmd === "set") {
    const key = positionals[2];
    const val = positionals[3];
    if (!key || val === undefined) {
      console.error("Usage: athr config set <key> <value>");
      process.exit(1);
    }
    updateConfig(key, val);
    console.log(`Config updated: ${key} = ${val}`);
  } else {
    const config = readConfig();
    console.log(JSON.stringify(config, null, 2));
  }
}

async function runScan(): Promise<void> {
  const { readConfig } = await import("./lib/config");
  const { db } = await import("./app");
  const { initCatalogue } = await import("./projections/catalogue");
  const { scanMusicDirectory } = await import("./lib/music-scanner");

  const config = readConfig();
  const musicDir = values.dir ?? config.dir;

  if (!musicDir) {
    console.error("No music directory configured. Use --dir or run: athr config set dir ~/Music");
    process.exit(1);
  }

  initCatalogue(db);
  console.log(`Scanning: ${musicDir}`);
  const result = await scanMusicDirectory(musicDir, db);
  console.log(`Scan complete: ${result.tracks} tracks, ${result.albums} albums, ${result.artists} artists`);
  if (result.errors.length > 0) {
    console.warn(`Errors:`);
    for (const err of result.errors) console.warn(`  ${err}`);
  }
}

switch (command) {
  case "serve":
    await runServe();
    break;
  case "config":
    await runConfig();
    break;
  case "scan":
    await runScan();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
