import type {
  ManagedExecutionProviderId,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";

export type SessionSlotState = "idle" | "running" | "background" | "exited";

export interface SessionSlotStateInfo {
  state: SessionSlotState;
  sessionId?: string;
  exitCode?: number;
  signal?: number;
}

export interface WorkspaceTerminalTab {
  id: string;
  title: string;
  linkedTaskId: string | null;
  backend: "xterm";
  cwd: string;
  createdAt: number;
}

export type CliSessionContextMode = "workspace" | "active-task";

export interface WorkspaceCliSessionTab {
  accountProfileId?: string;
  id: string;
  title: string;
  provider: ManagedExecutionProviderId;
  contextMode: CliSessionContextMode;
  nativeSessionId?: string;
  linkedTaskId: string | null;
  linkedTaskTitle: string | null;
  handoffSummary: string;
  cwd: string;
  createdAt: number;
  lastKnownSlotState?: SessionSlotState;
  lastExit?: { exitCode: number; signal?: number; at: string };
}

export type WorkspaceActiveSurface =
  | { kind: "task"; taskId: string }
  | { kind: "cli-session"; cliSessionTabId: string }
  | { kind: "compare-run"; compareRunId: string }
  | { kind: "lens"; lensSessionId: string }
  | { kind: "terminal"; terminalTabId: string }
  | { kind: "editor"; editorTabId: string };

export interface TerminalCreateSessionArgs {
  workspaceId: string;
  workspacePath: string;
  taskId: string | null;
  taskTitle: string | null;
  terminalTabId: string;
  cwd: string;
  shell?: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
}

export interface CliSessionCreateSessionArgs {
  workspaceId: string;
  workspacePath: string;
  cliSessionTabId: string;
  providerId: ProviderId;
  contextMode: CliSessionContextMode;
  nativeSessionId?: string;
  taskId: string | null;
  taskTitle: string | null;
  cwd: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
  runtimeOptions?: ProviderRuntimeOptions;
}

export function getCliSessionProviderLabel(
  providerId: ManagedExecutionProviderId,
) {
  return providerId === "claude-code" ? "Claude" : "Codex";
}

// Translated tab labels and default titles live in `terminal-tab-labels.ts`:
// this module is also bundled into the Electron host service.

export function getWorkspaceTerminalTabKey(args: {
  workspaceId: string;
  terminalTabId: string;
}) {
  return `${args.workspaceId}:${args.terminalTabId}`;
}

export function getWorkspaceCliSessionTabKey(args: {
  workspaceId: string;
  cliSessionTabId: string;
}) {
  return `${args.workspaceId}:${args.cliSessionTabId}`;
}

export function buildTerminalSessionSlotKey(args: {
  surface: "terminal" | "cli";
  workspaceId: string;
  tabId: string;
}) {
  return `${args.surface}:${args.workspaceId}:${args.tabId}`;
}
