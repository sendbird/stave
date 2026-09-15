import { loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { buildTerminalSessionSlotKey } from "@/lib/terminal/types";
import { worktreeStatusHasMeaningfulChanges } from "@/lib/workspace-archive-status";
import { workspaceCleanupRecommendation, workspaceCleanupBlocker, parseWorkspaceDiskBytes, worktreeListContainsPath } from "@/lib/workspace-cleanup";
import { useAppStore } from "@/store/app.store";
import { getLinkedWorktreePathSetForProject, waitForPendingWorkspaceArchiveCleanups } from "@/store/workspace-archive-cleanup";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";

export interface CleanupWorkspaceRow {
  id: string;
  name: string;
  path: string;
  branch: string;
  lastActive: string | null;
  linked: boolean;
  blocker: string | null;
  checked: boolean;
  bytes: number | null;
  sizeError?: string;
  result?: string;
  recommendation?: string | null;
  remoteStatus?: string;
}

export function cleanupWorkspaceRows(): CleanupWorkspaceRow[] {
  const state = useAppStore.getState();
  const linkedPaths = getLinkedWorktreePathSetForProject({ projectPath: state.projectPath, recentProjects: state.recentProjects });
  return state.workspaces.map((w) => ({
    id: w.id, name: w.name, path: state.workspacePathById[w.id] ?? "",
    branch: state.workspaceBranchById[w.id] ?? "",
    lastActive: state.workspaceLastActiveAtById[w.id] ?? null,
    linked: linkedPaths.has(normalizeComparablePath(state.workspacePathById[w.id])),
    blocker: workspaceCleanupBlocker(state, state.projectPath ?? "", w.id, state.workspacePathById[w.id] ?? ""),
    checked: false, bytes: null,
  }));
}

export async function inspectCleanupWorkspace(projectPath: string, row: CleanupWorkspaceRow): Promise<CleanupWorkspaceRow> {
  const blocker = workspaceCleanupBlocker(useAppStore.getState(), projectPath, row.id, row.path);
  if (blocker) return { ...row, checked: true, blocker };
  try {
    const runner = window.api?.terminal?.runCommand;
    if (!runner || !window.api?.scripts?.getStatus || !window.api?.terminal?.getSlotState) throw new Error("Workspace checks unavailable");
    const [status, scripts, shell, upstream] = await Promise.all([
      runner({ cwd: row.path, command: "git status --porcelain --untracked-files=all" }),
      window.api.scripts.getStatus({ workspaceId: row.id }),
      loadWorkspaceShell({ workspaceId: row.id }),
      runner({ cwd: row.path, command: "git rev-list --count @{upstream}..HEAD" }),
    ]);
    if (!status.ok || !scripts.ok || !shell) throw new Error("Could not verify workspace state");
    let reason: string | null = worktreeStatusHasMeaningfulChanges(status.stdout) ? "Changed files" : null;
    const unpushed = upstream.ok && /^\d+$/.test(upstream.stdout.trim()) ? Number(upstream.stdout.trim()) : null;
    if (unpushed !== null && unpushed > 0) reason = "Unpushed commits";
    if (scripts.statuses.some((s) => s.running)) reason = "Script running";
    const slots = [
      ...(shell.terminalTabs ?? []).map((tab) => buildTerminalSessionSlotKey({ surface: "terminal", workspaceId: row.id, tabId: tab.id })),
      ...(shell.cliSessionTabs ?? []).map((tab) => buildTerminalSessionSlotKey({ surface: "cli", workspaceId: row.id, tabId: tab.id })),
    ];
    for (const slotKey of slots) {
      const slot = await window.api.terminal.getSlotState({ slotKey });
      if (slot.state === "running" || slot.state === "background") reason = "Terminal session open";
    }
    const timestamps = [row.lastActive, ...shell.tasks.map((task) => task.updatedAt)].filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!)));
    timestamps.sort((a, b) => Date.parse(b) - Date.parse(a));
    const pr = useAppStore.getState().workspacePrInfoById[row.id];
    const lastActive = timestamps[0] ?? null;
    return { ...row, checked: true, lastActive,
      remoteStatus: unpushed === null ? "Upstream comparison unavailable; branch will be kept" : `${unpushed} unpushed commits (local tracking ref)`,
      recommendation: workspaceCleanupRecommendation({ lastActive, prState: pr?.pr?.state, prCheckedAt: pr?.lastFetched, unpushed, now: Date.now() }),
      blocker: workspaceCleanupBlocker(useAppStore.getState(), projectPath, row.id, row.path) ?? reason };
  } catch (error) {
    return { ...row, checked: true, blocker: error instanceof Error ? error.message : "Check failed" };
  }
}

export async function scanCleanupWorkspaceSize(row: CleanupWorkspaceRow): Promise<CleanupWorkspaceRow> {
  try {
    const result = await window.api?.terminal?.runCommand?.({ cwd: row.path, command: "du -sk ." });
    const bytes = result?.ok ? parseWorkspaceDiskBytes(result.stdout) : null;
    return { ...row, bytes, sizeError: bytes === null ? "Scan unavailable" : undefined };
  } catch {
    return { ...row, bytes: null, sizeError: "Scan failed" };
  }
}

export async function cleanWorkspace(projectPath: string, row: CleanupWorkspaceRow): Promise<CleanupWorkspaceRow> {
  const current = await inspectCleanupWorkspace(projectPath, row);
  if (current.blocker) return current;
  // Re-check synchronously after all asynchronous inspection, before dispatch.
  const state = useAppStore.getState();
  const blocker = workspaceCleanupBlocker(state, projectPath, row.id, row.path);
  if (blocker) return { ...current, blocker };
  await state.closeWorkspace({ workspaceId: row.id, deleteBranch: false, onlyIfInactive: true });
  await waitForPendingWorkspaceArchiveCleanups();
  const archived = !useAppStore.getState().workspaces.some((w) => w.id === row.id);
  if (!archived) return { ...current, blocker: "Workspace was not archived" };
  const listed = await window.api?.terminal?.runCommand?.({ cwd: projectPath, command: "git worktree list --porcelain -z" });
  const result = row.linked ? "Archived · external files kept" : !listed?.ok ? "Archived · disk removal unverified" : worktreeListContainsPath(listed.stdout, row.path) ? "Archived · worktree kept" : "Worktree removed · branch kept";
  return { ...current, result };
}
