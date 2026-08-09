import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWatchingCodexServer } from "../bridge/server.mjs";

test("serves the dashboard and health API on loopback", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "watching-codex-test-"));
  const dist = path.join(root, "dist");
  await mkdir(dist);
  await writeFile(path.join(dist, "index.html"), "<!doctype html><title>WatchingCodex</title>");
  const app = createWatchingCodexServer({ workspace: root, distDir: dist, port: 0, version: "test", skipCodex: true });
  const address = await app.start();
  t.after(() => app.stop());
  const base = `http://127.0.0.1:${address.port}`;

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WatchingCodex/);
  assert.equal(page.headers.get("x-frame-options"), "DENY");

  const health = await (await fetch(`${base}/healthz`)).json();
  assert.deepEqual(health, { ok: true, codexConnected: false });

  const snapshot = await (await fetch(`${base}/api/status`)).json();
  assert.equal(snapshot.version, "test");
  assert.equal(snapshot.workspace, root);
});
