import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import { resolvePathBaseName } from "@/lib/path-utils";

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
  backend: "ghostty";
  cwd: string;
  createdAt: number;
}

export type CliSessionContextMode = "workspace" | "active-task";

export interface WorkspaceCliSessionTab {
  id: string;
  title: string;
  provider: Exclude<ProviderId, "stave">;
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
  | { kind: "cli-session"; cliSessionTabId: string };

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
  providerId: Exclude<ProviderId, "stave">;
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

export function getTerminalTabDefaultTitle(args: {
  cwd: string;
  linkedTaskTitle?: string | null;
}) {
  const linkedTaskTitle = args.linkedTaskTitle?.trim();
  if (linkedTaskTitle) {
    return linkedTaskTitle;
  }

  return resolvePathBaseName({ path: args.cwd, fallback: "Terminal" });
}

export function getCliSessionProviderLabel(
  providerId: Exclude<ProviderId, "stave">,
) {
  return providerId === "claude-code" ? "Claude" : "Codex";
}

export function getCliSessionContextLabel(contextMode: CliSessionContextMode) {
  return contextMode === "active-task" ? "Active Task" : "Workspace";
}

export function getCliSessionTabDefaultTitle(args: {
  providerId: Exclude<ProviderId, "stave">;
  contextMode: CliSessionContextMode;
  linkedTaskTitle?: string | null;
}) {
  const providerLabel = getCliSessionProviderLabel(args.providerId);
  const linkedTaskTitle = args.linkedTaskTitle?.trim();
  if (args.contextMode === "active-task" && linkedTaskTitle) {
    return `${providerLabel}: ${linkedTaskTitle}`;
  }
  return `${providerLabel} ${getCliSessionContextLabel(args.contextMode)}`;
}

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
