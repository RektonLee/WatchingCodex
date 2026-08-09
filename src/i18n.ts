export type Language = "en" | "zh";

export const copy = {
  en: {
    subtitle: "Local Codex control room", starting: "Starting", running: "Running", completed: "Completed", interrupted: "Interrupted", failed: "Failed", idle: "Ready", offline: "Offline",
    stop: "Stop", workspace: "Workspace", codexConnected: "Codex connected", codexOffline: "Codex offline", bridgeOffline: "Local bridge is not connected", bridgeHint: "Start WatchingCodex from the terminal, then refresh this page.",
    mission: "Mission", goalPlan: "Goal & plan", planEmpty: "Codex's live plan will appear here after you start a task.", done: "Done", working: "In progress", waiting: "Waiting",
    newTask: "Start a task", taskPlaceholder: "e.g. Trace the login flow and fix the failing tests", createThread: "Create a new thread", resume: "Resume stopped thread", launch: "Launch & watch",
    liveTrace: "Live trace", live: "Live", activityEmpty: "Commands, tool calls, file edits, and verification results will stream here.",
    files: "Changes", board: "Board", signals: "Signals", noFiles: "The workspace is clean.", selectFile: "Select a file to inspect its diff.", noBoard: "No board.md found. That's okay — live events are the source of truth.", noSignals: "No drift signals detected.",
    approval: "Needs your approval", commandApproval: "Codex wants to run a command", fileApproval: "Codex wants to change files", deny: "Deny", allow: "Allow",
    steerPlaceholder: "Seeing drift? Add a correction without waiting for the turn to finish…", steer: "Steer now", taskSent: "Task started", steerSent: "Correction added to the active turn", stopSent: "Interrupt requested", allowed: "Approved", denied: "Denied",
    taskRequired: "Describe the task first", steerRequired: "Write a correction first", changes: "changed files", context: "context", reconnect: "Reconnecting…", error: "Runtime notice"
  },
  zh: {
    subtitle: "本地 Codex 任务控制台", starting: "正在启动", running: "运行中", completed: "已完成", interrupted: "已停止", failed: "失败", idle: "待命", offline: "未连接",
    stop: "停止", workspace: "工作区", codexConnected: "Codex 已连接", codexOffline: "Codex 未连接", bridgeOffline: "本地桥未连接", bridgeHint: "请从终端启动 WatchingCodex，然后刷新页面。",
    mission: "任务", goalPlan: "目标与计划", planEmpty: "启动任务后，Codex 的实时计划会出现在这里。", done: "已完成", working: "正在处理", waiting: "等待中",
    newTask: "开始新任务", taskPlaceholder: "例如：梳理登录流程并修复失败的测试", createThread: "创建新会话", resume: "继续已停止会话", launch: "启动并监控",
    liveTrace: "实时活动", live: "实时", activityEmpty: "命令、工具调用、文件修改和验证结果会持续出现在这里。",
    files: "文件变化", board: "Board", signals: "偏航信号", noFiles: "工作区没有文件变化。", selectFile: "选择文件后查看变化内容。", noBoard: "没有找到 board.md。没关系，实时事件才是监控的事实来源。", noSignals: "暂未发现偏航信号。",
    approval: "需要你的确认", commandApproval: "Codex 请求执行命令", fileApproval: "Codex 请求修改文件", deny: "拒绝", allow: "允许",
    steerPlaceholder: "发现跑偏？不用等这一轮结束，直接追加纠偏要求…", steer: "立即纠偏", taskSent: "任务已经启动", steerSent: "纠偏要求已追加到当前任务", stopSent: "已请求停止", allowed: "已允许", denied: "已拒绝",
    taskRequired: "先写下要 Codex 做什么", steerRequired: "先写下纠偏要求", changes: "个文件变化", context: "上下文", reconnect: "正在重连…", error: "运行提示"
  }
} as const;
