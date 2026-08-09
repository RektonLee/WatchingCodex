export function compact(value, limit = 1200) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function describeItem(item = {}) {
  const type = item.type || "activity";
  if (type === "commandExecution") return { title: item.status === "completed" ? "Command completed" : "Running command", detail: compact(item.command || item.aggregatedOutput) };
  if (type === "fileChange") return { title: item.status === "completed" ? "Files changed" : "Changing files", detail: compact((item.changes || []).map((change) => `${change.kind || "M"} ${change.path}`).join("\n")) };
  if (type === "reasoning") return { title: "Reasoning summary", detail: compact(item.summary || item.content) };
  if (type === "agentMessage") return { title: "Codex update", detail: compact(item.text) };
  if (type === "userMessage") return { title: "Instruction received", detail: compact(item.content) };
  if (type === "mcpToolCall" || type === "dynamicToolCall") return { title: `Tool call · ${item.tool || item.server || "MCP"}`, detail: compact(item.arguments || item.result) };
  if (type === "webSearch") return { title: "Searching the web", detail: compact(item.query || item.action) };
  if (type === "collabToolCall") return { title: "Coordinating agent work", detail: compact(item.prompt || item.tool) };
  return { title: type, detail: compact(item) };
}

export function normalizePlan(plan = []) {
  return plan.map((item) => ({
    step: item.step,
    status: item.status === "in_progress" || item.status === "inProgress" ? "inProgress" : item.status,
  }));
}

export function parsePorcelainStatus(output = "") {
  const tokens = output.split("\0").filter(Boolean);
  const entries = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) continue;
    const state = token.slice(0, 2).trim() || "M";
    const filePath = token.slice(3);
    entries.push({ path: filePath, state });
    if (/[RC]/.test(state)) index += 1;
  }
  return entries;
}

export function parseNumstat(output = "") {
  return output.split("\n").filter(Boolean).map((line) => {
    const [added, removed, ...parts] = line.split("\t");
    return { path: parts.join("\t"), added: Number(added) || 0, removed: Number(removed) || 0 };
  });
}

export function mergeFileChanges(statusEntries = [], stats = []) {
  const statusMap = new Map(statusEntries.map((entry) => [entry.path, entry.state]));
  const files = stats.map((entry) => ({ ...entry, state: statusMap.get(entry.path) || "M" }));
  for (const entry of statusEntries) {
    if (!files.some((file) => file.path === entry.path)) files.push({ ...entry, added: 0, removed: 0 });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function buildRiskSignals(files = [], activity = [], turnStatus = "idle", lastActivityAt = null) {
  const signals = [];
  const deleted = files.filter((file) => file.state.includes("D"));
  const removedLines = files.reduce((sum, file) => sum + file.removed, 0);
  const manifests = files.filter((file) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|Cargo\.toml)$/.test(file.path));
  const failedCommands = activity.filter((item) => item.type === "commandExecution" && item.status === "failed");

  if (files.length > 20) signals.push({ id: "wide-scope", level: "warning", title: "Wide change scope", detail: `${files.length} files are currently modified. Confirm that the task really needs this reach.` });
  if (deleted.length) signals.push({ id: "deletions", level: "danger", title: "Files deleted", detail: `${deleted.length} file${deleted.length === 1 ? "" : "s"} marked for deletion: ${deleted.slice(0, 3).map((file) => file.path).join(", ")}` });
  if (removedLines > 250) signals.push({ id: "large-removal", level: "warning", title: "Large removal", detail: `${removedLines} lines removed across the current workspace diff.` });
  if (manifests.length) signals.push({ id: "dependencies", level: "info", title: "Dependency surface changed", detail: manifests.map((file) => file.path).join(", ") });
  if (failedCommands.length >= 2) signals.push({ id: "repeated-failures", level: "warning", title: "Repeated command failures", detail: `${failedCommands.length} command executions failed during this turn.` });
  if (turnStatus === "inProgress" && lastActivityAt && Date.now() - new Date(lastActivityAt).getTime() > 5 * 60 * 1000) signals.push({ id: "quiet-turn", level: "warning", title: "No visible progress", detail: "The active turn has produced no new visible activity for more than five minutes." });
  return signals;
}
