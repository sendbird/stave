import { archiveSensitiveFilesPath, saveArchiveSensitiveFiles, restoreArchiveSensitiveFiles, deleteArchiveSensitiveFiles } from "./workspace-archive-sensitive-files";
import { hasWorkspaceArchiveLeftover } from "./workspace-archive-leftovers";
import { saveWorkspaceChanges, clearSavedWorkspaceChanges, applySavedWorkspaceChanges, assertWorkspaceArchiveFilesSafe, deleteSavedWorkspaceChanges, discardPartialSavedWorkspaceChanges, listWorkspaceArchiveIgnoredFiles } from "./workspace-archive-snapshot";
import { existsSync, realpathSync } from "node:fs";
import { workspaceRunningCleanupBlockers } from "./workspace-cleanup-running";
import { createWorkspaceDiskUsage, readWorkspaceDiskUsage, workspaceDiskFolders, type WorkspaceDiskUsage } from "./workspace-disk-usage";
import { createSubAgentWorktrees } from "./subagent-worktrees";
import { createDelegatedWorkspaceCleanup } from "./delegated-workspace-cleanup";
import { lstat, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SqliteStore } from "../persistence/sqlite-store";
import { runWorkspaceLifecycleGit, removeWorkspaceLifecycleWorktree, fetchGitHubPrStatus } from "./scm-runtime";
import { listWorkspaceShelfLinks, removeWorkspaceShelfLinks, restoreWorkspaceShelfLinks } from "./workspace-linked-shelf";
import { runWorkspacePreparation } from "./workspace-preparation";
import { workspaceExecutionGate } from "../shared/workspace-execution-gate";
import { getScriptStatuses } from "../main/workspace-scripts";
import { isTarsTrayPinned } from "../../src/lib/tars/clearing";
import { isNotificationPendingAttention } from "../../src/lib/notifications/notification.types";
import { worktreeStatusHasMeaningfulChanges } from "../../src/lib/workspace-archive-status";
import { DEFAULT_WORKSPACE_CLEANUP_POLICY, WorkspaceCleanupStateSchema, WorkspaceCleanupPolicySchema, WorkspaceCleanupActArgsSchema, SubAgentWorktreeRemoveArgsSchema, subAgentWorktreeDiskId, type SubAgentWorktreeRemoveArgs, type WorkspaceCleanupActArgs, type WorkspaceCleanupPolicy, type WorkspaceCleanupResult, type WorkspaceCleanupRow } from "../../src/lib/workspace-cleanup-contract";

const DAY = 86400_000;
const canonical = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };

export function responsibilityCleanupBlocker(responsibilities: Array<{ executionWorkspaceId: string | null; state: string; publication?: { state: string; watch?: unknown; checks?: unknown } }>, workspaceId: string): string | null {
  for (const work of responsibilities.filter(work => work.executionWorkspaceId === workspaceId)) {
    if (!["completed", "cancelled"].includes(work.state)) return "responsibilityRunning";
    // An opened publication is a draft until the host has verified it merged/closed.
    if (work.publication && work.publication.state !== "opened") return "publicationPending";
  }
  return null;
}

export function createWorkspaceCleanupRuntime(ports: {
  store: () => SqliteStore;
  hasTerminals: (workspaceId: string) => boolean;
  git?: typeof runWorkspaceLifecycleGit;
  pr?: typeof fetchGitHubPrStatus;
  now?: () => number;
  diskUsage?: WorkspaceDiskUsage;
  changed?: (event: { workspaceId: string; repositoryPath: string; stage?: "preparing" | "prepared" | "preparationFailed"; command?: string }) => void;
}) {
  workspaceExecutionGate.setArchiveReader(() => ports.store().listArchivedWorkspacesPersistence()
    .map(record => ({ workspaceId: record.workspaceId, workspacePath: record.path })));
  workspaceExecutionGate.setDeletionReader(() => ports.store().listDeletedWorkspaceIds());
  workspaceExecutionGate.setArchiveVersionReader(() => ports.store().workspaceArchiveDataVersion());
  const git = ports.git ?? runWorkspaceLifecycleGit;
  const pr = ports.pr ?? fetchGitHubPrStatus;
  const now = ports.now ?? Date.now;
  const disk = ports.diskUsage ?? createWorkspaceDiskUsage();
  const subAgents = createSubAgentWorktrees({ store: ports.store, git, now });
  const delegated = createDelegatedWorkspaceCleanup({
    store: ports.store, git,
    blockers: async (target) => (await list(false, false, target)).rows.find(row => row.id === target.id)?.blockers ?? null,
    archive: (target, verify) => act({ action: "archive", ...target }, true, verify),
    recentlyFailed: (repositoryPath, workspaceId) => saved().automaticFailureAt?.[failureKey(repositoryPath, workspaceId)] !== undefined,
    restoredByUser: (repositoryPath, workspaceId) => saved().userRestoredAt?.[failureKey(repositoryPath, workspaceId)] !== undefined,
  });
  const mergedAtByWorkspace = new Map<string, number>();
  const prSavedTips = new Set<string>();
  let running = false;
  let actionChain = Promise.resolve();
  let lastGoodState = { policy: DEFAULT_WORKSPACE_CLEANUP_POLICY, recent: [], lastRun: 0 } as import("zod").infer<typeof WorkspaceCleanupStateSchema>;
  let stateReadable = true;
  const failureKey = (repositoryPath: string, workspaceId: string) => JSON.stringify([repositoryPath, workspaceId]);
  function deferSavedChangesDeletion(repositoryPath: string, ref: string) {
    console.warn("[workspace-cleanup] saved changes ref could not be deleted after restore; retrying once", { ref });
    const timer = setTimeout(() => {
      void deleteSavedWorkspaceChanges(repositoryPath, ref).catch(() => console.warn("[workspace-cleanup] saved changes ref was left in place", { ref }));
    }, 60_000);
    timer.unref();
  }
  function saved() {
    try {
      const raw = ports.store().readWorkspaceCleanupState();
      const parsed = WorkspaceCleanupStateSchema.safeParse(raw);
      stateReadable = raw === null || parsed.success;
      if (parsed.success) lastGoodState = parsed.data;
    } catch { stateReadable = false; }
    const state = structuredClone(lastGoodState);
    const failures = { ...state.automaticFailureAt };
    // Seed earlier persisted failures before their display rows can be evicted.
    for (const result of state.recent) {
      if (result.automatic && !result.ok) {
        const key = failureKey(result.repositoryPath, result.workspaceId);
        failures[key] = Math.max(failures[key] ?? 0, Date.parse(result.at));
      }
    }
    state.automaticFailureAt = Object.fromEntries(Object.entries(failures).filter(([, at]) => Number.isFinite(at) && now() - at < DAY));
    return state;
  }
  function remember(result: WorkspaceCleanupResult, repositoryPath: string, automatic: boolean) {
    const state = saved();
    if (automatic && !result.ok) state.automaticFailureAt![failureKey(repositoryPath, result.workspaceId)] = now();
    // A restore the user asked for outlasts the delegated-child sweep until the workspace is archived again.
    if (result.ok && (result.action === "restore" || result.action === "archive")) {
      const restored = { ...state.userRestoredAt };
      if (result.action === "restore" && !automatic) restored[failureKey(repositoryPath, result.workspaceId)] = now();
      else delete restored[failureKey(repositoryPath, result.workspaceId)];
      state.userRestoredAt = restored;
    }
    state.recent = [{ ...result, repositoryPath, at: new Date(now()).toISOString(), automatic }, ...state.recent].slice(0, 200);
    if (stateReadable) ports.store().writeWorkspaceCleanupState(state);
  }
  function configure(policy: WorkspaceCleanupPolicy) {
    const state = saved();
    if (!stateReadable) throw new Error("cleanupStateUnavailable");
    state.policy = WorkspaceCleanupPolicySchema.parse(policy);
    if (stateReadable) ports.store().writeWorkspaceCleanupState(state);
    return state.policy;
  }
  function hostBlockers(row: WorkspaceCleanupRow, action?: WorkspaceCleanupActArgs["action"]) {
    const store = ports.store();
    const repository = store.loadRepositoryRegistry().find(repo => canonical(repo.repositoryPath) === canonical(row.repositoryPath));
    const reasons: string[] = [];
    if (!repository) return ["ownershipChanged"];
    const selectedPath = store.loadActiveRepositoryPath();
    const selectedRepository = selectedPath === undefined || (typeof selectedPath === "string" && canonical(selectedPath) === canonical(repository.repositoryPath));
    if (row.path && canonical(row.path) === canonical(row.repositoryPath)) reasons.push("defaultWorkspace");
    if (selectedRepository && row.path && repository.activeWorkspaceId !== row.id && canonical(repository.workspacePathById[repository.activeWorkspaceId] ?? "") === canonical(row.path)) reasons.push("currentWorkspace");
    if (!row.archived && !row.branchOnly) {
      if (!repository.workspaces.some(workspace => workspace.id === row.id) || canonical(repository.workspacePathById[row.id] ?? "") !== canonical(row.path)) reasons.push("ownershipChanged");
      if (repository.workspaceDefaultById[row.id] || canonical(row.path) === canonical(row.repositoryPath)) reasons.push("defaultWorkspace");
      if (selectedRepository && repository.activeWorkspaceId === row.id) reasons.push("currentWorkspace");
    }
    if ((row.archived || action === "delete" || action === "removeWorktree" || action === "deleteBranch") && (store.listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id)?.creationOptions?.linkedWorktree || repository.linkedWorkspacePaths?.some(path => canonical(path) === canonical(row.path)))) reasons.push("externalWorktree");
    if (row.keptWorktree && existsSync(row.path) && (action === "delete" || action === "removeWorktree")) reasons.push("keptWorktree");
    if (!row.branchOnly && workspaceExecutionGate.isBusy({ workspaceId: row.id, workspacePath: row.path })) reasons.push("runningTurn");
    if (!row.branchOnly) reasons.push(...workspaceRunningCleanupBlockers(store, row.id));
    if (ports.hasTerminals(row.id)) reasons.push("terminalOpen");
    if (getScriptStatuses({ workspaceId: row.id }).some(script => script.running)) reasons.push("scriptRunning");
    if (store.agentRuns.listActiveAgentRuns().some(run => run.workspaceId === row.id)) reasons.push("runningRun");
    if (store.listNotifications().some(notification => notification.workspaceId === row.id && isNotificationPendingAttention(notification))) reasons.push("attention");
    const responsibilities = store.tars.snapshot().responsibilities;
    const pendingPublish = new Set(store.listWorkspaceCleanupPendingPublications());
    if (responsibilities.some(work => work.executionWorkspaceId === row.id && isTarsTrayPinned(work, pendingPublish))) reasons.push("publicationPending");
    const responsibility = responsibilityCleanupBlocker(responsibilities, row.id);
    if (responsibility) reasons.push(responsibility);
    return reasons;
  }
  /**
   * A squash-merged PR whose head branch was deleted leaves no remote-tracking
   * ref after a pruning fetch, so `--not --remotes` counts every pushed commit.
   * GitHub keeps the PR head, which is enough when the local tip is that head
   * or one of its ancestors. Confirmed tips are remembered; a moved tip re-checks.
   */
  async function savedByPullRequest(repositoryPath: string, branch: string, branchRef: string) {
    const tip = await git(repositoryPath, ["rev-parse", "--verify", "--quiet", `${branchRef}^{commit}`]);
    if (!tip.ok) return false;
    const key = JSON.stringify([canonical(repositoryPath), branch, tip.stdout.trim()]);
    if (prSavedTips.has(key)) return true;
    const status = await pr({ cwd: repositoryPath, target: branch });
    const head = status.ok ? status.pr?.headRefOid?.trim() : undefined;
    if (!head || !/^[0-9a-f]{40,64}$/i.test(head)) return false;
    const saved = head.toLowerCase() === tip.stdout.trim().toLowerCase()
      || (await git(repositoryPath, ["merge-base", "--is-ancestor", tip.stdout.trim(), head])).ok;
    if (saved) prSavedTips.add(key);
    return saved;
  }
  /** A linked worktree's own record under `<common>/worktrees/<id>`; the main checkout has no `gitdir`. */
  const worktreeRecordIntact = (adminDir: string) => existsSync(join(adminDir, "HEAD")) && existsSync(join(adminDir, "gitdir"));
  async function inspect(row: WorkspaceCleanupRow, scanDisk = false, checkPr = false, action?: WorkspaceCleanupActArgs["action"]): Promise<WorkspaceCleanupRow> {
    if (row.leftoverFiles) return { ...row, blockers: ["worktreeLeftoverFiles"] };
    const blockers = hostBlockers(row, action);
    const reasons: string[] = [...row.reasons];
    let branchDeletable = false;
    const repository = ports.store().loadRepositoryRegistry().find(repo => repo.repositoryPath === row.repositoryPath);
    const linked = Boolean(repository?.linkedWorkspacePaths?.some(path => canonical(path) === canonical(row.path)) ||
      ports.store().listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id)?.creationOptions?.linkedWorktree);
    const branchRef = `refs/heads/${row.branch}`;
    const exists = !linked && row.branch && (await git(row.repositoryPath, ["show-ref", "--verify", "--quiet", branchRef])).ok;
    if (exists) {
      const base = repository?.defaultBranch || "main";
      const merged = await git(row.repositoryPath, ["merge-base", "--is-ancestor", branchRef, `refs/heads/${base}`]);
      const unpushed = await git(row.repositoryPath, ["rev-list", "--count", branchRef, "--not", "--remotes"]);
      const onRemote = unpushed.ok && unpushed.stdout.trim() === "0";
      // A PR head keeps the commits, but `git branch -d` still refuses a squash-merged branch.
      const pushed = onRemote || (unpushed.ok && !row.branchOnly && await savedByPullRequest(row.repositoryPath, row.branch, branchRef));
      branchDeletable = merged.ok || onRemote;
      if (merged.ok) reasons.push("branchMerged");
      if (!pushed) blockers.push("unpushedCommits");
    }
    if (!row.branchOnly && existsSync(row.path)) {
      const head = await git(row.path, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
      if (!head.ok || head.stdout.trim() !== row.branch) blockers.push("ownershipChanged");
      if (!linked) {
        const [common, repositoryCommon] = await Promise.all([git(row.path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), git(row.repositoryPath, ["rev-parse", "--path-format=absolute", "--git-common-dir"])]);
        if (!common.ok || !repositoryCommon.ok || canonical(common.stdout.trim()) !== canonical(repositoryCommon.stdout.trim())) blockers.push("ownershipChanged");
      }
      const status = await git(row.path, ["status", "--porcelain", "--untracked-files=all"]);
      if (!status.ok) blockers.push("checksUnavailable");
      else if (!row.keptWorktree && worktreeStatusHasMeaningfulChanges(status.stdout)) blockers.push("changedFiles");
    }
    const inactiveDays = row.lastActive ? Math.floor((now() - Date.parse(row.lastActive)) / DAY) : 0;
    if (inactiveDays > 0) reasons.push(`inactive:${inactiveDays}`);
    const responsibilities = ports.store().tars.snapshot().responsibilities.filter(work => work.executionWorkspaceId === row.id);
    if (responsibilities.length && !responsibilityCleanupBlocker(responsibilities, row.id)) reasons.push("responsibilityEnded");
    // Publishing work is protected until the host reads the current PR state.
    if (checkPr || responsibilities.some(work => work.publication?.state === "opened")) {
      const status = await pr({ cwd: linked ? row.path : row.repositoryPath, target: row.branch });
      mergedAtByWorkspace.delete(row.id);
      if (status.ok && status.pr?.state === "MERGED") {
        reasons.push("prMerged");
        const mergedAt = Date.parse(status.pr.mergedAt ?? "");
        if (Number.isFinite(mergedAt) && mergedAt <= now()) mergedAtByWorkspace.set(row.id, mergedAt);
      }
      if (responsibilities.some(work => work.publication?.state === "opened") && (!status.ok || !status.pr || !["MERGED", "CLOSED"].includes(status.pr.state))) blockers.push("publicationPending");
    }
    let bytes: number | null = null;
    // An explicit scan measures again; folders are measured one at a time with a time limit each.
    if (scanDisk && row.path && existsSync(row.path)) bytes = (await disk.read(row.id, row.path, 0)).bytes;
    return { ...row, canSaveChanges: !linked && !row.archived && !row.branchOnly && blockers.includes("changedFiles") && blockers.every(blocker => blocker === "changedFiles" || blocker === "unpushedCommits"), blockers: [...new Set(blockers)], reasons, bytes, branchDeletable };
  }
  async function list(scanDisk = false, checkPr = false, target?: { id: string; repositoryPath: string }) {
    const store = ports.store();
    const rows: WorkspaceCleanupRow[] = [];
    const state = saved();
    for (const repository of store.loadRepositoryRegistry()) {
      if (target && repository.repositoryPath !== target.repositoryPath) continue;
      const owned = new Set(Object.values(repository.workspaceBranchById));
      const base = { repositoryPath: repository.repositoryPath, repositoryName: repository.repositoryName, blockers: [], reasons: [], bytes: null, branchDeletable: false };
      for (const workspace of repository.workspaces) rows.push({ ...base, id: workspace.id, name: workspace.name, path: repository.workspacePathById[workspace.id] ?? "", branch: repository.workspaceBranchById[workspace.id] ?? "", archived: false, readOnly: false, branchOnly: false, archivedAt: null, lastActive: repository.workspaceLastActiveAtById?.[workspace.id] ?? workspace.updatedAt });
      for (const archive of store.listArchivedWorkspacesPersistence({ repositoryPath: repository.repositoryPath })) {
        owned.add(archive.branch);
        rows.push({ ...base, id: archive.workspaceId, name: archive.name, path: archive.path, branch: archive.branch, archived: true, leftoverFiles: hasWorkspaceArchiveLeftover(archive, state.recent), savedChanges: Boolean(archive.savedChangesRef), keptWorktree: Boolean(archive.creationOptions?.keepWorktree && existsSync(archive.path)), readOnly: archive.readOnly, branchOnly: false, archivedAt: archive.archivedAt, lastActive: archive.archivedAt });
      }
      const [branches, mergedBranches] = await Promise.all([
        git(repository.repositoryPath, ["for-each-ref", "--format=%(refname:short)%09%(upstream:track)", "refs/heads"]),
        git(repository.repositoryPath, ["for-each-ref", `--merged=refs/heads/${repository.defaultBranch}`, "--format=%(refname:short)", "refs/heads"]),
      ]);
      const mergedNames = new Set(mergedBranches.ok ? mergedBranches.stdout.trim().split("\n") : []);
      if (branches.ok) for (const line of branches.stdout.trim().split("\n")) {
        const [branch, tracking] = line.split("\t");
        if (!branch || branch === repository.defaultBranch || owned.has(branch)) continue;
        if (!mergedNames.has(branch) && tracking !== "[gone]") continue;
        rows.push({ ...base, id: `branch:${branch}`, name: branch, path: "", branch, reasons: tracking === "[gone]" ? ["remoteBranchGone"] : [], archived: false, readOnly: false, branchOnly: true, archivedAt: null, lastActive: null });
      }
    }
    const candidates = target ? rows.filter(row => row.id === target.id) : rows;
    const inspected = new Array<WorkspaceCleanupRow>(candidates.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const index = cursor++;
        const row = candidates[index]!;
        const activity = [row.lastActive, ...store.listWorkspaceTasks({ workspaceId: row.id }).map(task => task.updatedAt)]
          .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!))).sort((a, b) => Date.parse(b) - Date.parse(a));
        try { inspected[index] = await inspect({ ...row, lastActive: row.archived ? row.lastActive : activity[0] ?? null }, scanDisk, checkPr); }
        catch { inspected[index] = { ...row, blockers: ["checksUnavailable"] }; }
      }
    }));
    return { rows: inspected, policy: state.policy, recent: state.recent };
  }
  /**
   * `verify`, for an automatic archive only, replaces the `unpushedCommits`
   * blocker with the caller's own rule and runs again once the workspace's
   * execution is stopped (`delegated-workspace-cleanup.ts`); a non-null result
   * refuses the archive with that reason. `guard` runs at the same point
   * without replacing any blocker; a non-null result refuses the action.
   */
  async function perform(input: WorkspaceCleanupActArgs, automatic = false, verify?: () => Promise<string | null>, guard?: () => Promise<string | null>): Promise<WorkspaceCleanupResult> {
    const args = WorkspaceCleanupActArgsSchema.parse(input);
    const verified = automatic && args.action === "archive" && verify !== undefined;
    let result: WorkspaceCleanupResult = { ok: false, workspaceId: args.workspaceId, action: args.action, reason: null };
    let registryChanged = false;
    let leftoverFiles = false;
    let enteredGate = false;
    let wasSuspended = false;
    try {
      const row = (await list(false, false, { id: args.workspaceId, repositoryPath: args.repositoryPath })).rows.find(row => row.id === args.workspaceId && row.repositoryPath === args.repositoryPath);
      if (!row) throw new Error("ownershipChanged");
      if (args.archivedOnly && !row.archived) throw new Error("notArchived");
      result.workspaceName = row.name;
      if (row.leftoverFiles) throw new Error("worktreeLeftoverFiles");
      const sensitiveFilesPath = () => archiveSensitiveFilesPath(ports.store().appDataPath, row.id);
      if (args.action === "restore") {
        if (!row.archived) throw new Error("notArchived");
        const archive = ports.store().listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id);
        const options = archive?.creationOptions;
        const savedRef = archive?.savedChangesRef;
        if (savedRef && existsSync(row.path)) throw new Error("savedChangesRestoreFilesExist");
        const linked = Boolean(options?.linkedWorktree);
        const externalHead = linked && existsSync(row.path) ? await git(row.path, ["symbolic-ref", "--quiet", "--short", "HEAD"]) : null;
        let branchExists = linked
          ? externalHead?.ok && externalHead.stdout.trim() === row.branch
          : row.branch && (await git(row.repositoryPath, ["show-ref", "--verify", "--quiet", `refs/heads/${row.branch}`])).ok;
        if (existsSync(row.path)) {
          const current = await inspect(row);
          const preparation = ports.store().listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id)?.creationOptions;
          // A failed preparation may leave generated files. The branch/common-dir
          // checks still prove ownership before an explicit retry runs its command.
          const blocking = current.blockers.filter(reason => reason !== "unpushedCommits" && reason !== "externalWorktree" &&
            !(reason === "changedFiles" && preparation?.initCommand && !preparation.linkedWorktree));
          if (blocking.length) throw new Error(blocking.join(","));
          if (!branchExists) throw new Error("restorePathOccupied");
        }
        if (savedRef && branchExists) {
          const head = await git(row.repositoryPath, ["rev-parse", `refs/heads/${row.branch}`]);
          const original = await git(row.repositoryPath, ["rev-parse", `${savedRef}^1`]);
          if (!head.ok || !original.ok) throw new Error("savedChangesRestoreGitFailed");
          if (head.stdout.trim() !== original.stdout.trim()) throw new Error("savedChangesRestoreBranchMoved");
        }
        // A saved restore removes only what it created, so the archive and its ref stay retryable.
        let createdBranch: string | null = null;
        let createdWorktree = false;
        let sensitiveRestore: Awaited<ReturnType<typeof restoreArchiveSensitiveFiles>> | undefined;
        const discardCreated = async () => {
          if (createdWorktree) {
            await discardPartialSavedWorkspaceChanges(row.path, savedRef!);
            const removed = ports.git ? await git(row.repositoryPath, ["worktree", "remove", "--", row.path]) : await removeWorkspaceLifecycleWorktree(row.repositoryPath, row.path);
            if (!removed.ok) throw new Error("savedChangesRestorePartial");
          }
          // Compare-and-delete keeps a branch that moved after this restore created it.
          if (createdBranch) await git(row.repositoryPath, ["update-ref", "-d", `refs/heads/${row.branch}`, createdBranch]);
        };
        if (savedRef && !branchExists) {
          const recreated = await git(row.repositoryPath, ["branch", "--", row.branch, `${savedRef}^1`]);
          if (!recreated.ok) throw new Error("savedChangesRestoreGitFailed");
          const head = await git(row.repositoryPath, ["rev-parse", "--verify", `refs/heads/${row.branch}`]);
          createdBranch = head.ok ? head.stdout.trim() : null;
          branchExists = true;
        }
        try {
          if (!linked && branchExists && !existsSync(row.path)) {
            const added = await git(row.repositoryPath, ["worktree", "add", "--", row.path, row.branch]);
            if (!added.ok) throw new Error("worktreeRestoreFailed");
            createdWorktree = Boolean(savedRef);
          }
          if (branchExists) {
            if (savedRef) await applySavedWorkspaceChanges(row.path, savedRef);
            if (!linked && !options?.keepWorktree) {
              sensitiveRestore = await restoreArchiveSensitiveFiles(row.path, sensitiveFilesPath())
                .catch(() => ({ conflict: false, failed: true }));
            }
            if (options?.linkedWorktree) await restoreWorkspaceShelfLinks(row.repositoryPath, row.path, options.linkedSymlinkNames ?? []);
            if (!row.keptWorktree && !options?.linkedWorktree && options?.useRootNodeModulesSymlink) {
              try { await lstat(join(row.path, "node_modules")); }
              catch { try { await symlink(join(row.repositoryPath, "node_modules"), join(row.path, "node_modules")); } catch { throw new Error("dependencyLinkFailed"); } }
            }
            if (!row.keptWorktree && !savedRef && !options?.linkedWorktree && options?.initCommand) {
              ports.changed?.({ workspaceId: row.id, repositoryPath: row.repositoryPath, stage: "preparing", command: options.initCommand });
              try { await runWorkspacePreparation({ command: options.initCommand, cwd: row.path }); }
              catch { ports.changed?.({ workspaceId: row.id, repositoryPath: row.repositoryPath, stage: "preparationFailed", command: options.initCommand }); throw new Error("workspacePreparationFailed"); }
              ports.changed?.({ workspaceId: row.id, repositoryPath: row.repositoryPath, stage: "prepared", command: options.initCommand });
            }
          }
        } catch (error) {
          // A partial checkout that cannot be proven snapshot-only is kept and reported instead.
          if (savedRef) await discardCreated();
          throw error;
        }
        ports.store().restoreWorkspacePersistence({ workspaceId: row.id, readOnly: !branchExists });
        try {
          // The restore is durable now; a leftover ref only costs disk space.
          if (savedRef && branchExists) await deleteSavedWorkspaceChanges(row.repositoryPath, savedRef).catch(() => deferSavedChangesDeletion(row.repositoryPath, savedRef));
        } finally {
          if (branchExists) workspaceExecutionGate.resume(row.id);
          else await workspaceExecutionGate.stop({ workspaceId: row.id, workspacePath: row.path }, async () => {});
        }
        let reason = sensitiveRestore?.conflict ? "sensitiveFilesRestoreConflict" : null;
        if (sensitiveRestore?.failed) reason = reason ? reason + ",sensitiveFilesRestoreFailed" : "sensitiveFilesRestoreFailed";
        if (sensitiveRestore && !reason) {
          await deleteArchiveSensitiveFiles(sensitiveFilesPath()).catch(() => { reason = "sensitiveFilesCleanupFailed"; });
        }
        result = { ...result, ok: true, readOnly: !branchExists, reason };
      } else {
        if (args.action === "removeWorktree" && !row.archived) throw new Error("notArchived");
        if (args.action === "archive" && (row.archived || row.branchOnly)) throw new Error("notActiveWorkspace");
        const preserveLocalWork = args.action === "archive" && args.preserveLocalWork === true && !automatic && !args.deleteBranch && !args.forceDeleteBranch;
        const keepWorktree = args.keepWorktree === true;
        if (keepWorktree && (!preserveLocalWork || args.saveChanges)) throw new Error("notActiveWorkspace");
        const willSave = (current: WorkspaceCleanupRow) => args.action === "archive" && args.saveChanges === true && current.canSaveChanges === true;
        if (args.saveChanges && !willSave(row) && !preserveLocalWork) throw new Error("savedChangesUnavailable");
        const remainingBlockers = (current: WorkspaceCleanupRow, blockers: string[]) => blockers.filter(blocker =>
          !(blocker === "unpushedCommits" && (preserveLocalWork || verified || (args.forceDeleteBranch && args.action === "delete"))) &&
          !(blocker === "changedFiles" && (keepWorktree || willSave(current))));
        const blockers = remainingBlockers(row, [...new Set([...row.blockers, ...hostBlockers(row, args.action)])]);
        if (blockers.length) throw new Error(blockers.join(","));
        if (args.action === "deleteBranch" && !row.branchOnly) throw new Error("branchHasWorkspace");
        if (args.action === "deleteBranch" || args.deleteBranch) {
          if (!row.branchDeletable && !args.forceDeleteBranch) throw new Error("unmergedBranch");
          if (args.forceDeleteBranch && args.action !== "delete") throw new Error("forceRequiresPermanentDelete");
        }
        const apply = async () => {
          const fresh = await inspect(row, false, false, args.action);
          if (!preserveLocalWork && willSave(row) && !willSave(fresh)) throw new Error("savedChangesUnavailable");
          const freshBlockers = remainingBlockers(fresh, fresh.blockers);
          if (freshBlockers.length) throw new Error(freshBlockers.join(","));
          const refused = verified ? await verify!() : guard ? await guard() : null;
          if (refused) throw new Error(refused);
          const repository = ports.store().loadRepositoryRegistry().find(repo => repo.repositoryPath === row.repositoryPath)!;
          const linked = repository.linkedWorkspacePaths?.some(path => canonical(path) === canonical(row.path)) || ports.store().listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id)?.creationOptions?.linkedWorktree;
          const linkedSymlinkNames = linked ? await listWorkspaceShelfLinks(row.repositoryPath, row.path) : [];
          const createArchive = (args.action === "archive" || args.action === "delete") && !row.archived;
          // An automatic archive has no one to confirm a loss, so it also refuses
          // changes Git hides from status and an unfinished merge or rebase.
          const checkArchiveFiles = (preserveLocalWork || (automatic && args.action === "archive")) && !keepWorktree && !linked && existsSync(row.path);
          if (checkArchiveFiles) await assertWorkspaceArchiveFilesSafe(row.path);
          // Persist recoverable ownership before removing its checkout. A failed
          // write must never leave active history pointing at a missing path.
          const saved = willSave(fresh) ? await saveWorkspaceChanges(row.path) : undefined;
          const savedRef = saved?.ref;
          let archive = ports.store().listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id);
          try {
            if (createArchive) {
              const original = ports.store().readWorkspaceCreationOptions({ workspaceId: row.id });
              let dependencyLink = false;
              try { dependencyLink = (await lstat(join(row.path, "node_modules"))).isSymbolicLink(); } catch { /* No dependency link. */ }
              try { archive = ports.store().archiveWorkspacePersistence({ workspaceId: row.id, repositoryPath: row.repositoryPath, path: row.path, branch: row.branch, name: row.name, savedChangesRef: savedRef,
                creationOptions: { ...(original ?? { useRootNodeModulesSymlink: dependencyLink, initCommand: repository.newWorkspaceInitCommand }), linkedWorktree: Boolean(linked), ...(linked ? { linkedSymlinkNames } : {}), ...(keepWorktree ? { keepWorktree: true } : {}) } }); }
              catch (error) {
                if (savedRef) await deleteSavedWorkspaceChanges(row.repositoryPath, savedRef);
                throw error;
              }
              workspaceExecutionGate.invalidateArchives();
              registryChanged = true;
            }
            let savedStateCleared = false;
            // Set only once Git is about to remove this checkout and its own record was found.
            let removedRecord: string | null = null;
            try {
              const removeCheckout = !keepWorktree && !linked && !row.branchOnly && existsSync(row.path);
              if (removeCheckout && args.action !== "delete") {
                try {
                  const skipped = await saveArchiveSensitiveFiles(row.path, sensitiveFilesPath(), await listWorkspaceArchiveIgnoredFiles(row.path));
                  if (skipped) result.sensitiveFilesSkipped = skipped;
                } catch (error) {
                  throw new Error(error instanceof Error && error.message === "sensitiveFilesBackupConflict"
                    ? "sensitiveFilesBackupConflict" : "sensitiveFilesBackupFailed");
                }
              }
              if (saved) await clearSavedWorkspaceChanges(row.path, saved, () => { savedStateCleared = true; });
              if (linked && args.action === "archive") await removeWorkspaceShelfLinks(row.repositoryPath, row.path, linkedSymlinkNames);
              if (removeCheckout) {
                if (checkArchiveFiles) await assertWorkspaceArchiveFilesSafe(row.path);
                const adminDir = await git(row.path, ["rev-parse", "--absolute-git-dir"]);
                removedRecord = adminDir.ok && worktreeRecordIntact(adminDir.stdout.trim()) ? adminDir.stdout.trim() : null;
                const removed = ports.git ? await git(row.repositoryPath, ["worktree", "remove", "--", row.path]) : await removeWorkspaceLifecycleWorktree(row.repositoryPath, row.path);
                if (!removed.ok) throw new Error("worktreeRemoveFailed");
              }
            } catch (error) {
              // A failed removal can still delete Git's record of this checkout and leave
              // only files Git could not delete (for example a read-only ignored cache).
              // That folder is no longer a checkout, so the removal stands and the
              // leftover is reported. Every other failure rolls back as before.
              const leftover = error instanceof Error && error.message === "worktreeRemoveFailed" &&
                removedRecord !== null && existsSync(row.path) && !worktreeRecordIntact(removedRecord);
              if (!leftover) {
                // Git kept the checkout; return the workspace to its active registry.
                // If rollback also fails, the durable archive still protects history.
                if (createArchive && existsSync(row.path)) {
                  try {
                    if (savedRef && savedStateCleared) await applySavedWorkspaceChanges(row.path, savedRef);
                    if (linked) await restoreWorkspaceShelfLinks(row.repositoryPath, row.path, linkedSymlinkNames);
                    ports.store().restoreWorkspacePersistence({ workspaceId: row.id });
                    if (savedRef) await deleteSavedWorkspaceChanges(row.repositoryPath, savedRef);
                  } catch { /* Keep the archive recoverable. */ }
                }
                throw error;
              }
              leftoverFiles = true;
              if (archive) {
                const stat = await lstat(row.path).catch(() => null);
                if (stat?.isDirectory()) ports.store().workspaceArchives.recordLeftover(archive, { dev: stat.dev, ino: stat.ino });
              }
            }
          } finally { await saved?.dispose(); }
          // A partial removal leaves an archive the user can restore or delete after moving the folder.
          if (leftoverFiles && args.action === "delete") return;
          if (args.action === "deleteBranch" || args.deleteBranch) {
            const deleted = await git(row.repositoryPath, ["branch", args.forceDeleteBranch ? "-D" : "-d", "--", row.branch]);
            if (!deleted.ok) throw new Error("branchDeleteFailed");
          }
          if (args.action === "delete") {
            const ref = ports.store().listArchivedWorkspacesPersistence().find(record => record.workspaceId === row.id)?.savedChangesRef;
            await deleteArchiveSensitiveFiles(sensitiveFilesPath()).catch(() => { throw new Error("sensitiveFilesCleanupFailed"); });
            if (ref) await deleteSavedWorkspaceChanges(row.repositoryPath, ref);
            ports.store().permanentDeleteWorkspace({ workspaceId: row.id });
            delete result.sensitiveFilesSkipped;
          }
        };
        if (row.branchOnly) await apply();
        else {
          wasSuspended = workspaceExecutionGate.snapshot().some(state => state.workspaceId === row.id);
          enteredGate = true;
          await workspaceExecutionGate.stop({ workspaceId: row.id, workspacePath: row.path }, apply);
        }
        // The archive remains valid even when some files are left behind.
        result = { ...result, ok: !(leftoverFiles && args.action === "delete"), reason: leftoverFiles ? "worktreeLeftoverFiles" : null };
      }
    } catch (error) {
      delete result.sensitiveFilesSkipped;
      result.reason = error instanceof Error ? error.message : "cleanupFailed";
    }
    let archiveRemains = false;
    try {
      workspaceExecutionGate.invalidateArchives();
      archiveRemains = ports.store().listArchivedWorkspacesPersistence().some(record => record.workspaceId === args.workspaceId);
      if (!result.ok && enteredGate && !wasSuspended && !archiveRemains) workspaceExecutionGate.resume(args.workspaceId);
    } catch { /* Unknown durable ownership keeps execution stopped. */ }
    try { remember(result, args.repositoryPath, automatic); }
    finally {
      if (result.ok || registryChanged || archiveRemains) ports.changed?.({ workspaceId: args.workspaceId, repositoryPath: args.repositoryPath });
    }
    return result;
  }
  function act(args: WorkspaceCleanupActArgs, automatic = false, verify?: () => Promise<string | null>, guard?: () => Promise<string | null>) {
    const pending = actionChain.then(() => perform(args, automatic, verify, guard));
    actionChain = pending.then(() => {}, () => {});
    return pending;
  }
  async function runNow() {
    if (running) return { results: [] };
    running = true;
    const results: WorkspaceCleanupResult[] = [];
    try {
      const state = saved();
      state.lastRun = now();
      if (stateReadable) ports.store().writeWorkspaceCleanupState(state);
      const { rows } = await list(false, state.policy.merged.enabled);
      const activeByRepo = new Map<string, number>();
      for (const row of rows) if (!row.archived && !row.branchOnly && existsSync(row.path)) activeByRepo.set(row.repositoryPath, (activeByRepo.get(row.repositoryPath) ?? 0) + 1);
      rows.sort((a, b) => (Date.parse(a.lastActive ?? "") || now()) - (Date.parse(b.lastActive ?? "") || now()));
      for (const row of rows) {
        if (row.blockers.length || row.branchOnly) continue;
        if (state.automaticFailureAt?.[failureKey(row.repositoryPath, row.id)] !== undefined) continue;
        const age = row.lastActive ? (now() - Date.parse(row.lastActive)) / DAY : 0;
        const policy = state.policy;
        const mergedAt = mergedAtByWorkspace.get(row.id);
        const mergedDue = policy.merged.enabled && row.reasons.includes("prMerged") && mergedAt !== undefined
          && now() - mergedAt >= policy.merged.value * DAY && Date.parse(row.lastActive ?? "") <= mergedAt;
        const archive = !row.archived && (mergedDue
          || (policy.inactive.enabled && age >= policy.inactive.value)
          || (policy.maximum.enabled && (activeByRepo.get(row.repositoryPath) ?? 0) > policy.maximum.value && age >= 1));
        const remove = row.archived && !row.keptWorktree && policy.archived.enabled && age >= policy.archived.value && existsSync(row.path);
        if (!archive && !remove) continue;
        // A delegated child the delegation still holds is left to its own rules, checked again with execution stopped.
        const held = archive ? () => Promise.resolve(delegated.held(row.id, row.repositoryPath)) : undefined;
        if (held && await held()) continue;
        const result = await act({ action: archive ? "archive" : "removeWorktree", workspaceId: row.id, repositoryPath: row.repositoryPath }, true, undefined, held);
        results.push(result);
        if (result.ok && archive) activeByRepo.set(row.repositoryPath, (activeByRepo.get(row.repositoryPath) ?? 1) - 1);
      }
      return { results };
    } finally { running = false; }
  }
  async function runScheduled() {
    if (now() - saved().lastRun < 3600_000 || !Object.values(saved().policy).some(rule => rule.enabled)) return { results: [] };
    return runNow();
  }
  function start() {
    const timer = setInterval(() => { void runScheduled().catch(() => {}); }, 3600_000);
    timer.unref();
    // Delegated children are cleaned on their own rules, not the optional policy: a sweep
    // shortly after start, every ten minutes, and whenever `delegated.schedule` is asked.
    const first = setTimeout(() => delegated.schedule(), 30_000);
    first.unref();
    const children = setInterval(() => delegated.schedule(), 600_000);
    children.unref();
    return () => { clearInterval(timer); clearTimeout(first); clearInterval(children); };
  }
  /** Worktrees Claude Code sub-agents left (`subagent-worktrees.ts`); `runningAgentWorktrees` comes from Activity in main. */
  const listSubAgentWorktrees = (runningAgentWorktrees: readonly string[] = [], scanDisk = false) => subAgents.list(runningAgentWorktrees, async folder =>
    (scanDisk ? await disk.read(subAgentWorktreeDiskId(folder.path), folder.path, 0) : disk.peek(subAgentWorktreeDiskId(folder.path), folder.path))?.bytes ?? null);
  /** Only the cleanup dialog's confirmation calls this; it shares the action queue so removals never overlap. */
  function removeSubAgentWorktree(args: SubAgentWorktreeRemoveArgs, runningAgentWorktrees: readonly string[] = []) {
    const pending = actionChain.then(() => subAgents.remove(SubAgentWorktreeRemoveArgsSchema.parse(args), runningAgentWorktrees))
      .then(result => { if (result.ok) subAgentFolders = null; return result; });
    actionChain = pending.then(() => {}, () => {});
    return pending;
  }
  // The disk view re-reads every two seconds while measuring; Git lists worktrees at most every 30 seconds for it.
  let subAgentFolders: { at: number; folders: Awaited<ReturnType<typeof subAgents.discover>> } | null = null;
  /** Disk used by workspace folders and sub-agent worktrees; stale folders are measured in the background (`workspace-disk-usage.ts`). */
  const diskUsage = async (refresh = false) => {
    if (refresh || !subAgentFolders || Math.abs(now() - subAgentFolders.at) > 30_000) subAgentFolders = { at: now(), folders: await subAgents.discover().catch(() => []) };
    const leftByAgents = subAgentFolders.folders;
    return readWorkspaceDiskUsage([...workspaceDiskFolders(ports.store()), ...leftByAgents.map(folder => ({ workspaceId: subAgentWorktreeDiskId(folder.path),
      name: folder.name, repositoryPath: folder.repositoryPath, repositoryName: folder.repositoryName, archived: false, subAgentWorktree: true as const, path: folder.path }))], disk, refresh);
  };
  return { list, act, configure, runNow, runScheduled, start, diskUsage, listSubAgentWorktrees, removeSubAgentWorktree,
    /** Marks delegated children in Clean up workspaces with their parent and what keeps them. */
    annotateDelegatedChildren: delegated.annotate,
    /** Sweeps delegated children shortly; triggers coalesce. */
    scheduleDelegatedSweep: delegated.schedule,
    sweepDelegatedChildren: delegated.sweep };
}
