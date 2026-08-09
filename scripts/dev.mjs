import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createWatchingCodexServer } from "../bridge/server.mjs";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const workspace = path.resolve(process.argv[2] || packageRoot);
const app = createWatchingCodexServer({ workspace, distDir: path.join(packageRoot, "dist"), port: 7331, version: "dev" });
await app.start();
const vite = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["exec", "vite", "--", "--host", "127.0.0.1"], { cwd: packageRoot, stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } });
console.log(`Watching workspace: ${workspace}`);

let stopping = false;
async function shutdown(code = 0) { if (stopping) return; stopping = true; vite.kill("SIGTERM"); await app.stop(); process.exit(code); }
vite.on("exit", (code) => shutdown(code || 0));
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
