export const TOOLING_STATUS_IDS = [
  "shell",
  "git",
  "gh",
  "claude",
  "codex",
] as const;

export type ToolingStatusId = (typeof TOOLING_STATUS_IDS)[number];

export type ToolingStatusState = "ready" | "warning" | "error" | "unknown";

export type ToolingAuthState =
  | "authenticated"
  | "unauthenticated"
  | "not-required"
  | "unknown";

export type WorkspaceSyncState =
  | "synced"
  | "behind"
  | "ahead"
  | "diverged"
  | "dirty"
  | "missing-origin"
  | "missing-origin-main"
  | "not-git"
  | "unknown";

export interface ToolingStatusEntry {
  id: ToolingStatusId;
  label: string;
  state: ToolingStatusState;
  available: boolean;
  summary: string;
  detail: string;
  version: string | null;
  executablePath: string | null;
  authState: ToolingAuthState;
  authDetail: string | null;
}

export interface WorkspaceSyncStatus {
  cwd: string | null;
  rootPath: string | null;
  branch: string | null;
  trackingBranch: string | null;
  originUrl: string | null;
  ahead: number | null;
  behind: number | null;
  dirty: boolean;
  dirtyFileCount: number;
  state: WorkspaceSyncState;
  summary: string;
  detail: string;
  hasOriginRemote: boolean;
  hasOriginMain: boolean;
  /** The detected default branch ref, e.g. "origin/main" or "origin/master". Null if not found. */
  baseBranch: string | null;
  canFastForwardOriginMain: boolean;
  recommendedCommand: string | null;
}

export interface ToolingStatusSnapshot {
  checkedAt: string;
  workspace: WorkspaceSyncStatus;
  tools: ToolingStatusEntry[];
}

export interface ToolingStatusRequest {
  cwd?: string;
  claudeBinaryPath?: string;
  codexBinaryPath?: string;
}

export interface SyncOriginMainRequest {
  cwd?: string;
}

export interface SyncOriginMainResult {
  ok: boolean;
  summary: string;
  detail: string;
  workspace: WorkspaceSyncStatus;
}
