import { useEffect, useMemo, useState } from "react";
import { copy, type Language } from "./i18n";
import type { Approval, Snapshot } from "./types";

const emptyState: Snapshot = {
  bridgeConnected: false,
  codexConnected: false,
  workspace: "Connecting…",
  version: "0.1.0",
  activeThreadId: null,
  activeTurnId: null,
  turnStatus: "offline",
  startedAt: null,
  plan: [],
  activity: [],
  files: [],
  diff: "",
  board: "",
  threads: [],
  approvals: [],
  riskSignals: [],
  error: null,
};

function elapsed(since: string | null, now: number) {
  if (!since || !now) return "00:00";
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function activityGlyph(type: string) {
  return ({ commandExecution: ">_", fileChange: "±", reasoning: "·", agentMessage: "A", userMessage: "U", mcpToolCall: "◇", dynamicToolCall: "◇", webSearch: "⌕", collabToolCall: "↗" } as Record<string, string>)[type] || "·";
}

function diffForFile(diff: string, selectedFile: string | null) {
  if (!selectedFile) return diff;
  const markers = [`diff --git a/${selectedFile} b/${selectedFile}`, `diff --git "a/${selectedFile}" "b/${selectedFile}"`];
  const start = markers.map((marker) => diff.indexOf(marker)).find((index) => index >= 0) ?? -1;
  if (start < 0) return diff;
  const next = diff.indexOf("\ndiff --git ", start + 12);
  return diff.slice(start, next < 0 ? undefined : next);
}

async function post(path: string, body: object = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function App() {
  const [state, setState] = useState<Snapshot>(emptyState);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("watching-codex-language") as Language) || (navigator.language.startsWith("zh") ? "zh" : "en"));
  const [now, setNow] = useState(0);
  const [task, setTask] = useState("");
  const [steerText, setSteerText] = useState("");
  const [selectedThread, setSelectedThread] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"diff" | "board" | "signals">("diff");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const t = copy[language];

  useEffect(() => {
    let source: EventSource | undefined;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const connect = async () => {
      try {
        const response = await fetch("/api/status");
        if (response.ok) setState(await response.json());
      } catch {
        setState((current) => ({ ...current, bridgeConnected: false }));
      }
      if (stopped) return;
      source = new EventSource("/events");
      source.addEventListener("snapshot", (event) => setState(JSON.parse((event as MessageEvent).data)));
      source.onerror = () => {
        source?.close();
        setState((current) => ({ ...current, bridgeConnected: false }));
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    };

    connect();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      source?.close();
      window.clearTimeout(reconnectTimer);
      window.clearInterval(clock);
    };
  }, []);

  const effectiveSelectedFile = selectedFile && state.files.some((file) => file.path === selectedFile) ? selectedFile : state.files[0]?.path || null;
  const visibleDiff = useMemo(() => diffForFile(state.diff, effectiveSelectedFile), [state.diff, effectiveSelectedFile]);
  const contextUsed = state.tokenUsage?.totalTokens && state.tokenUsage?.modelContextWindow
    ? Math.min(100, Math.round((state.tokenUsage.totalTokens / state.tokenUsage.modelContextWindow) * 100))
    : 0;
  const statusText = ({ starting: t.starting, inProgress: t.running, completed: t.completed, interrupted: t.interrupted, failed: t.failed, idle: t.idle, offline: t.offline } as Record<string, string>)[state.turnStatus] || state.turnStatus;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
      setNotice(success);
      window.setTimeout(() => setNotice(""), 3500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const startTask = () => run(async () => {
    if (!task.trim()) throw new Error(t.taskRequired);
    await post("/api/task/start", { prompt: task.trim(), threadId: selectedThread || undefined });
    setTask("");
  }, t.taskSent);

  const steer = () => run(async () => {
    if (!steerText.trim()) throw new Error(t.steerRequired);
    await post("/api/turn/steer", { prompt: steerText.trim() });
    setSteerText("");
  }, t.steerSent);

  const interrupt = () => run(() => post("/api/turn/interrupt"), t.stopSent);
  const decide = (approval: Approval, decision: "accept" | "decline") => run(() => post("/api/approval", { id: approval.id, decision }), decision === "accept" ? t.allowed : t.denied);
  const toggleLanguage = () => {
    const next = language === "en" ? "zh" : "en";
    setLanguage(next);
    localStorage.setItem("watching-codex-language", next);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>WatchingCodex</strong><span>{t.subtitle}</span></div>
        </div>
        <div className="run-summary" aria-live="polite">
          <span className={`live-dot ${state.turnStatus === "inProgress" ? "active" : ""}`} />
          <strong>{statusText}</strong><span className="divider" />
          <span>{elapsed(state.startedAt, now)}</span><span className="divider" />
          <span>{state.files.length} {t.changes}</span>
          {contextUsed > 0 && <><span className="divider" /><span>{t.context} {contextUsed}%</span></>}
        </div>
        <div className="top-actions">
          <button className="language-button" onClick={toggleLanguage}>{language === "en" ? "中文" : "EN"}</button>
          <button className="stop-button" disabled={!state.activeTurnId || busy} onClick={interrupt}><span aria-hidden="true">■</span> {t.stop}</button>
        </div>
      </header>

      {!state.bridgeConnected && <div className="offline-banner"><strong>{t.bridgeOffline}</strong><span>{t.bridgeHint}</span></div>}
      {state.error && <div className="runtime-banner"><strong>{t.error}</strong><span>{state.error}</span></div>}

      <section className="workspace-bar">
        <span>{t.workspace}</span><strong title={state.workspace}>{state.workspace.split(/[\\/]/).pop()}</strong>
        <span className="workspace-path">{state.workspace}</span>
        <span className={`connection ${state.codexConnected ? "ok" : ""}`}>{state.codexConnected ? t.codexConnected : t.codexOffline}</span>
        <span className="version">v{state.version}</span>
      </section>

      <div className="dashboard-grid">
        <aside className="left-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">{t.mission}</span><h2>{t.goalPlan}</h2></div><span className="count">{state.plan.length}</span></div>
          <div className="plan-scroll">
            {state.plan.length ? <ol className="plan-list">{state.plan.map((item, index) => (
              <li key={`${item.step}-${index}`} className={item.status}>
                <span className="step-state">{item.status === "completed" ? "✓" : item.status === "inProgress" ? "●" : String(index + 1)}</span>
                <div><strong>{item.step}</strong><small>{item.status === "completed" ? t.done : item.status === "inProgress" ? t.working : t.waiting}</small></div>
              </li>
            ))}</ol> : <Empty icon="◎" text={t.planEmpty} />}
          </div>
          <div className="new-task">
            <label htmlFor="new-task">{t.newTask}</label>
            <textarea id="new-task" value={task} onChange={(event) => setTask(event.target.value)} placeholder={t.taskPlaceholder} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") startTask(); }} />
            {state.threads.length > 0 && <select value={selectedThread} onChange={(event) => setSelectedThread(event.target.value)} aria-label={t.createThread}>
              <option value="">{t.createThread}</option>
              {state.threads.slice(0, 12).map((thread) => <option key={thread.id} value={thread.id}>{t.resume} · {thread.name || thread.preview?.slice(0, 42) || `${thread.id.slice(0, 10)}…`}</option>)}
            </select>}
            <button disabled={busy || !state.codexConnected} onClick={startTask}>{t.launch}<span aria-hidden="true">→</span></button>
          </div>
        </aside>

        <section className="center-panel panel">
          <div className="panel-heading"><div><span className="eyebrow">TRACE</span><h2>{t.liveTrace}</h2></div><span className="pulse-label"><i />{t.live}</span></div>
          <div className="activity-feed">
            {state.activity.length ? state.activity.slice().reverse().map((item) => (
              <article className={`activity-card ${item.status || ""}`} key={item.id}>
                <span className={`activity-icon ${item.type}`}>{activityGlyph(item.type)}</span>
                <div className="activity-copy"><div><strong>{item.title}</strong><time>{new Date(item.at).toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time></div>{item.detail && <pre>{item.detail}</pre>}</div>
              </article>
            )) : <Empty icon="↳" text={t.activityEmpty} tall />}
          </div>
        </section>

        <aside className="right-panel panel">
          <div className="tabs" role="tablist" aria-label="Inspector">
            <button role="tab" aria-selected={activeTab === "diff"} className={activeTab === "diff" ? "active" : ""} onClick={() => setActiveTab("diff")}>{t.files}<span>{state.files.length}</span></button>
            <button role="tab" aria-selected={activeTab === "signals"} className={activeTab === "signals" ? "active" : ""} onClick={() => setActiveTab("signals")}>{t.signals}{state.riskSignals.length > 0 && <span className="risk-count">{state.riskSignals.length}</span>}</button>
            <button role="tab" aria-selected={activeTab === "board"} className={activeTab === "board" ? "active" : ""} onClick={() => setActiveTab("board")}>{t.board}</button>
          </div>

          {activeTab === "diff" && <>
            <div className="file-list">
              {state.files.map((file) => <button key={file.path} className={effectiveSelectedFile === file.path ? "active" : ""} onClick={() => setSelectedFile(file.path)}><span className={`file-state state-${file.state[0]}`}>{file.state}</span><span title={file.path}>{file.path}</span><small><b>+{file.added}</b><i>-{file.removed}</i></small></button>)}
              {!state.files.length && <Empty icon="◇" text={t.noFiles} compact />}
            </div>
            <div className="diff-view" aria-label="Code diff">
              {visibleDiff ? visibleDiff.split("\n").map((line, index) => <code key={index} className={line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "remove" : line.startsWith("@@") ? "hunk" : line.startsWith("diff --git") ? "file-header" : ""}>{line || " "}</code>) : <p>{state.files.length ? t.selectFile : t.noFiles}</p>}
            </div>
          </>}

          {activeTab === "signals" && <div className="signals-view">{state.riskSignals.length ? state.riskSignals.map((signal) => <article key={signal.id} className={signal.level}><span>{signal.level === "danger" ? "!" : signal.level === "warning" ? "△" : "i"}</span><div><strong>{signal.title}</strong><p>{signal.detail}</p></div></article>) : <Empty icon="✓" text={t.noSignals} tall />}</div>}
          {activeTab === "board" && <div className="board-view">{state.board ? <pre>{state.board}</pre> : <Empty icon="▤" text={t.noBoard} tall />}</div>}
        </aside>
      </div>

      {state.approvals.length > 0 && <section className="approval-tray" aria-live="assertive">
        <header><span>!</span><strong>{t.approval}</strong></header>
        {state.approvals.map((approval) => <div className="approval-item" key={approval.id}>
          <span>{approval.method.includes("commandExecution") ? t.commandApproval : t.fileApproval}</span>
          <code>{String(approval.params.command || approval.params.reason || approval.params.grantRoot || "Review the requested action")}</code>
          <div><button onClick={() => decide(approval, "decline")}>{t.deny}</button><button className="accept" onClick={() => decide(approval, "accept")}>{t.allow}</button></div>
        </div>)}
      </section>}

      <footer className="intervention-bar">
        <div className="steer-field"><span className="steer-icon" aria-hidden="true">↳</span><textarea value={steerText} onChange={(event) => setSteerText(event.target.value)} placeholder={t.steerPlaceholder} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") steer(); }} /></div>
        <button disabled={!state.activeTurnId || busy} onClick={steer}>{t.steer}<kbd>⌘↵</kbd></button>
        {notice && <span className="notice" role="status">{notice}</span>}
      </footer>
    </main>
  );
}

function Empty({ icon, text, tall = false, compact = false }: { icon: string; text: string; tall?: boolean; compact?: boolean }) {
  return <div className={`empty-state ${tall ? "tall" : ""} ${compact ? "compact" : ""}`}><span>{icon}</span><p>{text}</p></div>;
}

export default App;
