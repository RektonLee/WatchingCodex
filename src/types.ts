export type PlanStatus = "pending" | "inProgress" | "completed";

export type Step = { step: string; status: PlanStatus };
export type Activity = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  status?: string;
  at: string;
};
export type ChangedFile = { path: string; added: number; removed: number; state: string };
export type Thread = { id: string; name?: string | null; preview?: string; updatedAt?: number };
export type Approval = { id: number; method: string; params: Record<string, unknown> };
export type RiskSignal = { id: string; level: "info" | "warning" | "danger"; title: string; detail: string };

export type Snapshot = {
  bridgeConnected: boolean;
  codexConnected: boolean;
  workspace: string;
  version: string;
  activeThreadId: string | null;
  activeTurnId: string | null;
  turnStatus: string;
  startedAt: string | null;
  plan: Step[];
  activity: Activity[];
  files: ChangedFile[];
  diff: string;
  board: string;
  threads: Thread[];
  approvals: Approval[];
  riskSignals: RiskSignal[];
  tokenUsage?: { totalTokens?: number; modelContextWindow?: number };
  error?: string | null;
};
