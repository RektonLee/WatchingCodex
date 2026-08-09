#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { createWatchingCodexServer } from "../bridge/server.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));

function usage() {
  console.log(`WatchingCodex v${packageJson.version}

Usage:
  watching-codex [workspace] [options]

Options:
  -p, --port <number>  Local port (default: 7331)
      --no-open        Do not open a browser automatically
  -v, --version        Print the version
  -h, --help           Show this help

Examples:
  watching-codex
  watching-codex ~/code/my-project
  watching-codex . --port 8080 --no-open`);
}

const args = process.argv.slice(2);
let workspaceArg;
let port = 7331;
let shouldOpen = true;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
  if (arg === "--version" || arg === "-v") { console.log(packageJson.version); process.exit(0); }
  if (arg === "--no-open") { shouldOpen = false; continue; }
  if (arg === "--port" || arg === "-p") { port = Number(args[++index]); continue; }
  if (arg.startsWith("-")) { console.error(`Unknown option: ${arg}`); usage(); process.exit(1); }
  if (workspaceArg) { console.error("Only one workspace path can be provided"); process.exit(1); }
  workspaceArg = arg;
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error("Port must be an integer between 1024 and 65535"); process.exit(1); }

const workspace = path.resolve(workspaceArg || process.cwd());
const distDir = path.join(packageRoot, "dist");
try { await access(workspace); await access(path.join(distDir, "index.html")); }
catch { console.error("WatchingCodex is not built yet, or the workspace does not exist. Run `npm run build` first."); process.exit(1); }

const app = createWatchingCodexServer({ workspace, distDir, port, version: packageJson.version });
try { await app.start(); }
catch (error) { console.error(`Could not start WatchingCodex: ${error.message}`); process.exit(1); }

const url = `http://127.0.0.1:${port}`;
console.log(`\n  WatchingCodex v${packageJson.version}`);
console.log(`  Workspace  ${workspace}`);
console.log(`  Dashboard  ${url}\n`);

if (shouldOpen) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const openArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, openArgs, { detached: true, stdio: "ignore" }); child.on("error", () => {}); child.unref();
}

let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true; console.log("\n  Stopping WatchingCodex…"); await app.stop(); process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
