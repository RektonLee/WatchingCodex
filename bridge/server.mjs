import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { buildRiskSignals, compact, describeItem, gitNullDevice, mergeFileChanges, normalizePlan, parseNumstat, parsePorcelainStatus } from "./core.mjs";

const execFileAsync = promisify(execFile);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".map": "application/json; charset=utf-8" };

export function createWatchingCodexServer({ workspace, distDir, port = 7331, version = "0.1.0", skipCodex = false, codexCommand = "codex" }) {
  const clients = new Set();
  const pending = new Map();
  const itemIndex = new Map();
  let rpcId = 0;
  let codex;
  let rpcBuffer = "";
  let workspaceTimer;
  let heartbeatTimer;

  const state = {
    bridgeConnected: true, codexConnected: false, workspace, version,
    activeThreadId: null, activeTurnId: null, turnStatus: "idle", startedAt: null,
    plan: [], activity: [], files: [], diff: "", board: "", threads: [], approvals: [], riskSignals: [], tokenUsage: {}, error: null,
  };

  const snapshot = () => JSON.parse(JSON.stringify(state));
  const securityHeaders = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  };
  const broadcast = () => {
    state.riskSignals = buildRiskSignals(state.files, state.activity, state.turnStatus, state.activity.at(-1)?.at);
    const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
    for (const client of clients) client.write(payload);
  };

  function send(message) {
    if (!codex?.stdin.writable) throw new Error("Codex App Server is not connected");
    codex.stdin.write(`${JSON.stringify(message)}\n`);
  }
  const notify = (method, params = {}) => send({ method, params });
  function rpc(method, params = {}) {
    const id = ++rpcId;
    return new Promise((resolve, reject) => {
      const timeoutMs = method === "thread/start" || method === "thread/resume" ? 180000 : 30000;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      timeout.unref();
      pending.set(id, { resolve, reject, method, timeout });
      try { send({ method, id, params }); } catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); }
    });
  }

  function upsertActivity(item) {
    if (!item?.id) return;
    const description = describeItem(item);
    const activity = { id: item.id, type: item.type || "activity", title: description.title, detail: description.detail, status: item.status, at: itemIndex.get(item.id)?.at || new Date().toISOString() };
    itemIndex.set(item.id, activity);
    const existing = state.activity.findIndex((entry) => entry.id === item.id);
    if (existing >= 0) state.activity[existing] = activity; else state.activity.push(activity);
    state.activity = state.activity.slice(-200);
  }
  function appendDelta(itemId, delta) {
    const activity = itemIndex.get(itemId);
    if (!activity) return;
    activity.detail = compact(`${activity.detail || ""}${delta}`, 4000);
    const existing = state.activity.findIndex((entry) => entry.id === itemId);
    if (existing >= 0) state.activity[existing] = { ...activity };
  }
  function handleNotification({ method, params = {} }) {
    if (method === "turn/started") {
      state.activeTurnId = params.turn?.id || state.activeTurnId; state.turnStatus = "inProgress"; state.startedAt = new Date().toISOString();
    } else if (method === "turn/completed") {
      state.turnStatus = params.turn?.status || "completed"; state.activeTurnId = null;
    } else if (method === "turn/plan/updated") state.plan = normalizePlan(params.plan || []);
    else if (method === "turn/diff/updated") state.diff = params.diff || "";
    else if (method === "item/started" || method === "item/completed") upsertActivity(params.item);
    else if (["item/agentMessage/delta", "item/reasoning/summaryTextDelta", "item/reasoning/textDelta", "item/commandExecution/outputDelta"].includes(method)) appendDelta(params.itemId, params.delta || params.text || "");
    else if (method === "thread/tokenUsage/updated") {
      const usage = params.tokenUsage || params;
      state.tokenUsage = { totalTokens: usage.total?.totalTokens ?? usage.totalTokens, modelContextWindow: usage.modelContextWindow };
    }
    else if (method === "thread/status/changed" && params.threadId === state.activeThreadId) state.turnStatus = params.status?.type || params.status || state.turnStatus;
    else if (method === "error") state.error = params.error?.message || params.message || "Codex runtime error";
    broadcast();
  }
  function handleMessage(message) {
    if (process.env.CODEX_WATCH_DEBUG === "1") console.error(`[app-server] ${message.method || "response"} ${message.id ?? ""}`.trim());
    if (message.id != null && (message.result !== undefined || message.error)) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout); pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message || `${request.method} failed`)); else request.resolve(message.result);
      return;
    }
    if (message.id != null && message.method) {
      state.approvals = [...state.approvals.filter((item) => item.id !== message.id), { id: message.id, method: message.method, params: message.params || {} }]; broadcast(); return;
    }
    if (message.method) handleNotification(message);
  }

  async function startCodex() {
    if (skipCodex) { state.error = "Codex connection skipped in test mode"; broadcast(); return; }
    codex = spawn(codexCommand, ["app-server"], { cwd: workspace, stdio: ["pipe", "pipe", "pipe"] });
    codex.stdout.setEncoding("utf8");
    codex.stdout.on("data", (chunk) => {
      rpcBuffer += chunk;
      const lines = rpcBuffer.split("\n"); rpcBuffer = lines.pop() || "";
      for (const line of lines) if (line.trim()) { try { handleMessage(JSON.parse(line)); } catch (error) { state.error = `Could not parse a Codex event: ${error.message}`; broadcast(); } }
    });
    codex.stderr.setEncoding("utf8");
    codex.stderr.on("data", (chunk) => {
      for (const line of chunk.trim().split("\n").filter(Boolean)) {
        let isError = /^(error|fatal|panic)\b/i.test(line);
        try { isError = JSON.parse(line).level === "ERROR"; } catch { /* plain stderr */ }
        if (isError) { state.error = compact(line, 600); broadcast(); }
      }
    });
    codex.on("error", (error) => { state.codexConnected = false; state.error = `Could not start Codex: ${error.message}`; broadcast(); });
    codex.on("exit", (code) => { state.codexConnected = false; if (code !== 0 && code != null) state.error = `Codex App Server exited with code ${code}`; broadcast(); });

    const initialized = await rpc("initialize", { clientInfo: { name: "watching_codex", title: "WatchingCodex", version }, capabilities: { experimentalApi: false } });
    notify("initialized"); state.codexConnected = true; state.error = null;
    try { const result = await rpc("thread/list", { cwd: workspace, limit: 30 }); state.threads = result.data || result.threads || []; }
    catch (error) { state.error = `Thread history unavailable: ${error.message}`; }
    if (initialized?.codexHome) state.codexHome = initialized.codexHome;
    broadcast();
  }

  async function runGit(args, maxBuffer = 1024 * 1024) {
    try { return (await execFileAsync("git", args, { cwd: workspace, maxBuffer, encoding: "utf8" })).stdout; }
    catch (error) { return typeof error.stdout === "string" ? error.stdout : ""; }
  }
  async function diffUntracked(statusEntries) {
    const chunks = [];
    for (const entry of statusEntries.filter((item) => item.state.includes("?")).slice(0, 30)) {
      const absolute = path.resolve(workspace, entry.path);
      if (!absolute.startsWith(`${workspace}${path.sep}`)) continue;
      try {
        const metadata = await stat(absolute);
        if (!metadata.isFile() || metadata.size > 512 * 1024) continue;
        const content = await readFile(absolute);
        if (content.includes(0)) continue;
        const diff = await runGit(["diff", "--no-index", "--no-ext-diff", "--unified=3", "--", gitNullDevice(), entry.path], 2 * 1024 * 1024);
        if (diff) chunks.push(diff.replaceAll("a/dev/null", "a/dev/null"));
      } catch { /* unreadable untracked files stay in the file list */ }
    }
    return chunks.join("\n");
  }
  async function refreshWorkspace() {
    const [statusOutput, numstat, trackedDiff] = await Promise.all([
      runGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal"]),
      runGit(["diff", "--numstat", "HEAD", "--"]),
      runGit(["diff", "--no-ext-diff", "--unified=3", "HEAD", "--"], 8 * 1024 * 1024),
    ]);
    const statusEntries = parsePorcelainStatus(statusOutput);
    state.files = mergeFileChanges(statusEntries, parseNumstat(numstat));
    const untrackedDiff = await diffUntracked(statusEntries);
    if (state.turnStatus !== "inProgress" || !state.diff) state.diff = [trackedDiff, untrackedDiff].filter(Boolean).join("\n");
    state.board = "";
    for (const name of ["board.md", "BOARD.md", "Board.md"]) { try { state.board = await readFile(path.join(workspace, name), "utf8"); break; } catch { /* optional */ } }
    broadcast();
  }

  function json(response, statusCode, value) {
    response.writeHead(statusCode, { ...securityHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(value));
  }
  async function readJson(request) {
    let body = "";
    for await (const chunk of request) { body += chunk; if (body.length > 128 * 1024) throw new Error("Request body too large"); }
    return body ? JSON.parse(body) : {};
  }
  function validOrigin(request) {
    const origin = request.headers.origin;
    return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}` || (process.env.NODE_ENV !== "production" && origin === "http://127.0.0.1:5173");
  }
  async function serveStatic(urlPath, response) {
    const requested = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
    let absolute = path.resolve(distDir, requested);
    if (!absolute.startsWith(`${distDir}${path.sep}`) && absolute !== distDir) return false;
    try {
      const metadata = await stat(absolute);
      if (metadata.isDirectory()) absolute = path.join(absolute, "index.html");
      const content = await readFile(absolute);
      response.writeHead(200, { ...securityHeaders, "content-type": MIME[path.extname(absolute)] || "application/octet-stream", "cache-control": absolute.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" }); response.end(content); return true;
    } catch {
      if (!path.extname(requested)) { try { const content = await readFile(path.join(distDir, "index.html")); response.writeHead(200, { ...securityHeaders, "content-type": MIME[".html"], "cache-control": "no-cache" }); response.end(content); return true; } catch { return false; } }
      return false;
    }
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (request.method === "GET" && url.pathname === "/healthz") return json(response, 200, { ok: true, codexConnected: state.codexConnected });
      if (request.method === "GET" && url.pathname === "/api/status") return json(response, 200, snapshot());
      if (request.method === "GET" && url.pathname === "/events") {
        response.writeHead(200, { ...securityHeaders, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        clients.add(response); response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`); request.on("close", () => clients.delete(response)); return;
      }
      if (request.method === "POST" && !validOrigin(request)) return json(response, 403, { error: "Origin not allowed" });
      if (request.method === "POST" && url.pathname === "/api/task/start") {
        const body = await readJson(request); if (!body.prompt?.trim()) return json(response, 400, { error: "Task cannot be empty" });
        state.turnStatus = "starting"; state.startedAt = new Date().toISOString(); state.error = null; broadcast();
        let thread;
        try { thread = body.threadId ? (await rpc("thread/resume", { threadId: body.threadId })).thread : (await rpc("thread/start", { cwd: workspace, serviceName: "watching_codex" })).thread; }
        catch (error) { state.turnStatus = "idle"; throw error; }
        state.activeThreadId = thread.id; state.plan = []; state.activity = []; state.error = null; itemIndex.clear();
        const result = await rpc("turn/start", { threadId: thread.id, input: [{ type: "text", text: body.prompt.trim() }] });
        state.activeTurnId = result.turn?.id || null; state.turnStatus = "inProgress"; state.startedAt = new Date().toISOString(); broadcast();
        return json(response, 200, { threadId: thread.id, turnId: state.activeTurnId });
      }
      if (request.method === "POST" && url.pathname === "/api/turn/steer") {
        const body = await readJson(request); if (!state.activeThreadId || !state.activeTurnId) return json(response, 409, { error: "No active turn" });
        if (!body.prompt?.trim()) return json(response, 400, { error: "Correction cannot be empty" });
        await rpc("turn/steer", { threadId: state.activeThreadId, expectedTurnId: state.activeTurnId, input: [{ type: "text", text: body.prompt.trim() }] }); return json(response, 200, { ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/turn/interrupt") {
        if (!state.activeThreadId || !state.activeTurnId) return json(response, 409, { error: "No active turn" });
        await rpc("turn/interrupt", { threadId: state.activeThreadId, turnId: state.activeTurnId }); return json(response, 200, { ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/approval") {
        const body = await readJson(request); const approval = state.approvals.find((item) => item.id === body.id); if (!approval) return json(response, 404, { error: "Approval is no longer pending" });
        if (!["accept", "decline"].includes(body.decision)) return json(response, 400, { error: "Invalid approval decision" });
        send({ id: approval.id, result: { decision: body.decision } }); state.approvals = state.approvals.filter((item) => item.id !== body.id); broadcast(); return json(response, 200, { ok: true });
      }
      if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
      return json(response, 404, { error: "Not found" });
    } catch (error) { state.error = error.message; broadcast(); return json(response, 500, { error: error.message }); }
  });

  return {
    state,
    server,
    async start() {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
      await refreshWorkspace();
      startCodex().catch((error) => { state.error = error.message; state.codexConnected = false; broadcast(); });
      workspaceTimer = setInterval(refreshWorkspace, 1500); workspaceTimer.unref();
      heartbeatTimer = setInterval(() => { for (const client of clients) client.write(": heartbeat\n\n"); }, 15000); heartbeatTimer.unref();
      return server.address();
    },
    async stop() {
      clearInterval(workspaceTimer); clearInterval(heartbeatTimer); codex?.kill("SIGTERM");
      for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error("Server shutting down")); }
      pending.clear(); for (const client of clients) client.end(); clients.clear();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
