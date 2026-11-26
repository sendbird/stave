/**
 * Automatic cleanup of workspaces Stave created for delegated children
 * (`stave_delegate_task` with a `new-worktree` workspace).
 *
 * A child workspace is archived automatically, through the ordinary archive
 * action (`workspace-cleanup-runtime.ts`), only when every rule holds:
 * - its delegation is final: `completed`, or `cancelled` by the parent. A
 *   `failed` or `interrupted` delegation can be retried in the same
 *   workspace, and a pending, running or waiting one is still working;
 * - every answer it produced has been carried by a parent turn
 *   (`delegated_answer_deliveries`);
 * - no other delegated workspace still nests under it;
 * - its worktree has no uncommitted or untracked files that Git does not
 *   ignore;
 * - its HEAD and branch have no commit that is unreachable from the parent
 *   workspace's HEAD and from the default branch;
 * - the user did not restore it from Clean up workspaces after an archive;
 *   a restored child stays until the user archives it again;
 * - the archive's own blockers allow it (current workspace, running turn,
 *   open terminal, pending attention, ownership and the rest).
 * The rules are checked again inside the archive, while the workspace's
 * execution is stopped. Archiving keeps the branch, so no commit is deleted;
 * the archive can be restored from Clean up workspaces. A workspace failing
 * any rule is never removed automatically: Clean up workspaces lists it with
 * the reasons (`annotate`).
 *
 * The optional inactivity, maximum and merged-PR policies never archive a
 * child the delegation still holds (`held`): one still working, retryable,
 * with an answer the parent has not received, or with children of its own,
 * even after its parent workspace was archived; nor a child the user
 * restored.
 *
 * Used by: `workspace-cleanup-runtime.ts`, wired in `electron/host-service.ts`.
 */
import { existsSync } from "node:fs";
import { worktreeStatusHasMeaningfulChanges } from "../../src/lib/workspace-archive-status";
import type { DelegatedWorkspaceLink } from "../../src/lib/workspace-delegation-tree";
import type { WorkspaceCleanupResult, WorkspaceCleanupRow } from "../../src/lib/workspace-cleanup-contract";

export type DelegatedChildGit = (cwd: string, args: string[]) => Promise<{ ok: boolean; stdout: string }>;

/** Why a delegated child's workspace stays; each has a `cleanupCenter.reasons.<code>` string. */
export type DelegatedChildKeepReason =
  | "subagentActive"
  | "subagentRetryable"
  | "subagentResultPending"
  | "subagentHasNested"
  | "subagentChangedFiles"
  | "subagentUniqueCommits"
  | "subagentRestored"
  | "subagentChecksUnavailable";

export interface DelegatedChildCleanupInput {
  phase: DelegatedWorkspaceLink["phase"];
  answerOwed: boolean;
  hasNestedChildren: boolean;
  /** Restored by the user from Clean up workspaces since its last archive. */
  restoredByUser: boolean;
  childPath: string;
  childBranch: string;
  /** The parent workspace's checkout; null when it cannot be found. */
  parentPath: string | null;
  defaultBranch: string;
}

export interface DelegatedChildCleanupDecision {
  eligible: boolean;
  kept: DelegatedChildKeepReason[];
}

const ACTIVE = new Set<DelegatedWorkspaceLink["phase"]>(["pending", "running", "waiting"]);
const RETRYABLE = new Set<DelegatedWorkspaceLink["phase"]>(["failed", "interrupted"]);
const SHA = /^[0-9a-f]{40,64}$/i;

async function resolveCommit(git: DelegatedChildGit, cwd: string, ref: string) {
  const result = await git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  const sha = result.stdout.trim();
  return result.ok && SHA.test(sha) ? sha : null;
}

/**
 * Commits reachable from the child's HEAD or branch and from neither the
 * parent workspace's HEAD nor the default branch (local, else `origin/`).
 * Null when a needed ref cannot be read or there is nothing to compare with.
 */
export async function countDelegatedChildUniqueCommits(git: DelegatedChildGit, input: Pick<DelegatedChildCleanupInput, "childPath" | "childBranch" | "parentPath" | "defaultBranch">): Promise<number | null> {
  const head = await resolveCommit(git, input.childPath, "HEAD");
  if (!head) return null;
  const tips = [head];
  if (input.childBranch) {
    const branch = await resolveCommit(git, input.childPath, `refs/heads/${input.childBranch}`);
    if (!branch) return null;
    if (branch !== head) tips.push(branch);
  }
  const reachable: string[] = [];
  if (input.parentPath && existsSync(input.parentPath)) {
    const parentHead = await resolveCommit(git, input.parentPath, "HEAD");
    if (parentHead) reachable.push(parentHead);
  }
  if (input.defaultBranch) {
    const base = await resolveCommit(git, input.childPath, `refs/heads/${input.defaultBranch}`)
      ?? await resolveCommit(git, input.childPath, `refs/remotes/origin/${input.defaultBranch}`);
    if (base) reachable.push(base);
  }
  if (reachable.length === 0) return null;
  const count = await git(input.childPath, ["rev-list", "--count", ...tips, "--not", ...reachable]);
  const value = Number(count.stdout.trim());
  return count.ok && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Applies the rules above; Git is read only when the delegation itself allows cleanup. */
export async function evaluateDelegatedChildCleanup(git: DelegatedChildGit, input: DelegatedChildCleanupInput): Promise<DelegatedChildCleanupDecision> {
  if (ACTIVE.has(input.phase)) return { eligible: false, kept: ["subagentActive"] };
  if (RETRYABLE.has(input.phase)) return { eligible: false, kept: ["subagentRetryable"] };
  const kept: DelegatedChildKeepReason[] = [];
  if (input.answerOwed) kept.push("subagentResultPending");
  if (input.hasNestedChildren) kept.push("subagentHasNested");
  if (input.restoredByUser) kept.push("subagentRestored");
  if (!input.childPath || !existsSync(input.childPath)) {
    kept.push("subagentChecksUnavailable");
    return { eligible: false, kept };
  }
  const status = await git(input.childPath, ["status", "--porcelain", "--untracked-files=all"]);
  if (!status.ok) kept.push("subagentChecksUnavailable");
  else if (worktreeStatusHasMeaningfulChanges(status.stdout)) kept.push("subagentChangedFiles");
  const unique = await countDelegatedChildUniqueCommits(git, input);
  if (unique === null) kept.push("subagentChecksUnavailable");
  else if (unique > 0) kept.push("subagentUniqueCommits");
  const reasons = [...new Set(kept)];
  return { eligible: reasons.length === 0, kept: reasons };
}

export interface DelegatedCleanupStore {
  loadRepositoryRegistry(): Array<{
    repositoryPath: string;
    defaultBranch: string;
    workspaces: Array<{ id: string; name: string }>;
    workspaceBranchById: Record<string, string>;
    workspacePathById: Record<string, string>;
  }>;
  delegatedAnswers: {
    listWorkspaceLinks(options?: { includeArchivedParents?: boolean }): DelegatedWorkspaceLink[];
    hasOwedAnswer(runId: string): boolean;
  };
}

interface DelegatedChildCandidate {
  link: DelegatedWorkspaceLink;
  repositoryPath: string;
  parentName: string;
  input: DelegatedChildCleanupInput;
}

export function createDelegatedWorkspaceCleanup(ports: {
  store: () => DelegatedCleanupStore;
  git: DelegatedChildGit;
  /** The archive's own blockers for one workspace (`list` with a target). */
  blockers: (target: { id: string; repositoryPath: string }) => Promise<string[] | null>;
  /** The ordinary archive, run automatically; `verify` is called again with the workspace's execution stopped. */
  archive: (target: { workspaceId: string; repositoryPath: string }, verify: () => Promise<string | null>) => Promise<WorkspaceCleanupResult>;
  /** An automatic action on this workspace failed recently; do not retry it yet. */
  recentlyFailed: (repositoryPath: string, workspaceId: string) => boolean;
  /** The user restored this workspace from Clean up workspaces since it was last archived. */
  restoredByUser?: (repositoryPath: string, workspaceId: string) => boolean;
  delayMs?: number;
}) {
  function candidates(): DelegatedChildCandidate[] {
    const store = ports.store();
    const links = store.delegatedAnswers.listWorkspaceLinks();
    const nestedParents = new Set(links.map((link) => link.parentWorkspaceId));
    const result: DelegatedChildCandidate[] = [];
    const seen = new Set<string>();
    for (const repository of store.loadRepositoryRegistry()) {
      const names = new Map(repository.workspaces.map((workspace) => [workspace.id, workspace.name]));
      for (const link of links) {
        // The oldest link wins, as in the sidebar (`buildDelegatedWorkspaceTree`).
        if (seen.has(link.childWorkspaceId) || !names.has(link.childWorkspaceId) || !names.has(link.parentWorkspaceId)) continue;
        seen.add(link.childWorkspaceId);
        result.push({
          link,
          repositoryPath: repository.repositoryPath,
          parentName: names.get(link.parentWorkspaceId) ?? "",
          input: {
            phase: link.phase,
            answerOwed: store.delegatedAnswers.hasOwedAnswer(link.runId),
            hasNestedChildren: nestedParents.has(link.childWorkspaceId),
            restoredByUser: ports.restoredByUser?.(repository.repositoryPath, link.childWorkspaceId) ?? false,
            childPath: repository.workspacePathById[link.childWorkspaceId] ?? "",
            childBranch: repository.workspaceBranchById[link.childWorkspaceId] ?? "",
            parentPath: repository.workspacePathById[link.parentWorkspaceId] ?? null,
            defaultBranch: repository.defaultBranch,
          },
        });
      }
    }
    return result;
  }

  /** Marks the cleanup rows that are delegated children with their parent and what keeps them. */
  async function annotate(rows: WorkspaceCleanupRow[]): Promise<WorkspaceCleanupRow[]> {
    let found: DelegatedChildCandidate[];
    try { found = candidates(); } catch { return rows; }
    if (found.length === 0) return rows;
    const byKey = new Map(found.map((candidate) => [`${candidate.repositoryPath}\n${candidate.link.childWorkspaceId}`, candidate]));
    return Promise.all(rows.map(async (row) => {
      const candidate = !row.archived && !row.branchOnly ? byKey.get(`${row.repositoryPath}\n${row.id}`) : undefined;
      if (!candidate) return row;
      const decision = await evaluateDelegatedChildCleanup(ports.git, candidate.input)
        .catch((): DelegatedChildCleanupDecision => ({ eligible: false, kept: ["subagentChecksUnavailable"] }));
      return { ...row, subagent: { parentWorkspaceId: candidate.link.parentWorkspaceId, parentName: candidate.parentName, kept: decision.kept } };
    }));
  }

  /** The same rules for one child, read fresh; a reason code when it no longer qualifies. */
  async function recheck(childWorkspaceId: string, repositoryPath: string): Promise<string | null> {
    const candidate = candidates().find((item) => item.link.childWorkspaceId === childWorkspaceId && item.repositoryPath === repositoryPath);
    if (!candidate) return "ownershipChanged";
    const decision = await evaluateDelegatedChildCleanup(ports.git, candidate.input);
    return decision.eligible ? null : decision.kept.join(",");
  }

  /**
   * What keeps a delegated child from the optional cleanup policies, read
   * fresh; null for a workspace no delegation holds. Unlike the sweep, a
   * child whose parent workspace is archived still counts: archiving the
   * parent first must not release it. Git state is left to the archive's own
   * blockers there.
   */
  function held(workspaceId: string, repositoryPath: string): string | null {
    const store = ports.store();
    const links = store.delegatedAnswers.listWorkspaceLinks({ includeArchivedParents: true });
    // The oldest link names the child, as in `candidates`.
    const link = links.find((item) => item.childWorkspaceId === workspaceId);
    if (!link) return null;
    const reasons: DelegatedChildKeepReason[] = [];
    if (ACTIVE.has(link.phase)) reasons.push("subagentActive");
    if (RETRYABLE.has(link.phase)) reasons.push("subagentRetryable");
    if (store.delegatedAnswers.hasOwedAnswer(link.runId)) reasons.push("subagentResultPending");
    if (links.some((item) => item.parentWorkspaceId === workspaceId)) reasons.push("subagentHasNested");
    if (ports.restoredByUser?.(repositoryPath, workspaceId)) reasons.push("subagentRestored");
    return reasons.length ? reasons.join(",") : null;
  }

  let sweeping: Promise<WorkspaceCleanupResult[]> | null = null;
  let again = false;
  /** Archives every child that meets the rules; one sweep at a time, and one more if asked meanwhile. */
  function sweep(): Promise<WorkspaceCleanupResult[]> {
    if (sweeping) { again = true; return sweeping; }
    const run = async () => {
      const results: WorkspaceCleanupResult[] = [];
      for (const candidate of candidates()) {
        const { childWorkspaceId } = candidate.link;
        if (ports.recentlyFailed(candidate.repositoryPath, childWorkspaceId)) continue;
        const decision = await evaluateDelegatedChildCleanup(ports.git, candidate.input).catch(() => null);
        if (!decision?.eligible) continue;
        // `unpushedCommits` is replaced by the reachability rule; every other blocker keeps it for later.
        const blockers = await ports.blockers({ id: childWorkspaceId, repositoryPath: candidate.repositoryPath }).catch(() => null);
        if (!blockers || blockers.some((blocker) => blocker !== "unpushedCommits")) continue;
        results.push(await ports.archive(
          { workspaceId: childWorkspaceId, repositoryPath: candidate.repositoryPath },
          () => recheck(childWorkspaceId, candidate.repositoryPath),
        ));
      }
      return results;
    };
    sweeping = run().catch((error) => {
      console.warn("[workspace-cleanup] delegated child sweep failed", String(error));
      return [];
    }).finally(() => {
      sweeping = null;
      if (again) { again = false; schedule(); }
    });
    return sweeping;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Coalesces triggers (a delegation changed, a parent turn carried answers) into one sweep shortly after. */
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; void sweep(); }, ports.delayMs ?? 3_000);
    timer.unref?.();
  }

  return { annotate, sweep, schedule, recheck, held };
}
