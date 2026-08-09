# Architecture

WatchingCodex is deliberately small: one local Node.js process, one Codex App Server child process, and one compiled browser UI.

## Runtime

```text
Browser (127.0.0.1)
  ├── GET /api/status       snapshot/reconnect
  ├── GET /events           server-sent event stream
  └── POST /api/*           task, steer, interrupt, approval
            │
            ▼
Node bridge
  ├── codex app-server      JSONL over stdio
  ├── git status/diff       workspace evidence
  ├── board.md              optional intent artifact
  └── dist/                 compiled React application
```

## Event mapping

| App Server event | UI surface |
| --- | --- |
| `turn/started`, `turn/completed` | Global task status and elapsed time |
| `turn/plan/updated` | Goal and plan column |
| `item/started`, `item/completed` | Live activity cards |
| Item delta events | Streaming card details and command output |
| `turn/diff/updated` | Turn-level diff inspector |
| Approval requests | Inline approval tray |
| `thread/tokenUsage/updated` | Context usage indicator |
| `error` | Runtime notice |

Controls map back to `turn/start`, `turn/steer`, `turn/interrupt`, and the response side of App Server approval requests.

## State and reconnection

The bridge keeps the latest reduced state in memory. Every meaningful Codex or workspace event broadcasts a complete snapshot over SSE. Complete snapshots make browser reconnection simple and prevent the frontend from having to replay or perfectly order every low-level delta.

Durable event replay is intentionally not implemented yet. It is listed on the roadmap and should use a bounded local store rather than sending project data to a hosted service.

## Trust boundaries

- The bridge binds to loopback only.
- The browser receives normalized event data, never Codex credentials.
- Mutating HTTP routes validate their `Origin` header.
- The App Server remains responsible for sandbox and approval policy.
- Workspace paths come from the CLI invocation; the browser cannot switch the server to an arbitrary filesystem root.
- Static path resolution is constrained to the compiled `dist` directory.

## Why SSE?

The browser needs a one-way stream for frequent state updates and ordinary HTTP for a small number of controls. SSE provides reconnection behavior, works through the same origin, and avoids exposing the App Server's experimental WebSocket transport directly to the browser.
