import { AUTO_PULL_REQUEST_WATCH_EVENTS, DEFAULT_PULL_REQUEST_WATCH_PROMPT } from "../../src/lib/supervision/pull-request-watch";
import type { StackPr } from "../../src/lib/pull-request-stack";
import type { PullRequestAutoWatchHint } from "../../src/lib/supervision/wake-up-bridge";
import type { WakeUpRuntime } from "./wake-up-runtime";
import type { TaskSupervisionSnapshot } from "./local-mcp-runtime";
import type { ScmCommandRunner } from "./scm-runtime";
import type { TurnPullRequestEvidence } from "./turn-pr-evidence";
import { readCurrentBranch, readRepositoryInfo, readRepositoryPullRequests, readViewer } from "./pull-request-repo-cache";

export interface AutoWatchCandidate { workspaceId: string; taskId: string; turnId: string; startedAt: string; completedAt?: string | null }
/** Why Stave did not watch a PR an agent opened, shown in the tasks concerned. */
export type AutoWatchHint = PullRequestAutoWatchHint;
interface Context { cwd: string; enabled: boolean; managed: boolean; snapshot: TaskSupervisionSnapshot }
interface Dependencies {
  wakeUps: Pick<WakeUpRuntime, "list" | "create">;
  context: (candidate: AutoWatchCandidate) => Promise<Context | null>;
  owned: (args: { workspaceId: string; taskId: string; number: number; url: string }) => boolean;
  evidence: Pick<TurnPullRequestEvidence, "has" | "creators">;
  run?: ScmCommandRunner;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onError?: (error: unknown) => void;
  onHint?: (hint: AutoWatchHint) => void;
}
/** Network attempts after a turn: right away, then backed off. */
const ATTEMPT_DELAYS = [0, 15_000, 45_000, 120_000];
/** Rechecks while the task is busy cost no network read. */
const DEFER_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000];
const LIFETIME = 5 * 60_000;
const MAX_HINTS = 50;

/**
 * Discovers the PR an agent opened during a task turn and adds the default
 * watch. A turn enters only when it ran a PR-creating command or reported a
 * PR link; idle workspaces and ordinary turns never cause a read. Reads share
 * the repository's cached PR list (`pull-request-repo-cache.ts`).
 */
export function createAgentPrAutoWatch(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((callback, ms) => { const handle = setTimeout(callback, ms); handle.unref?.(); return handle; });
  const clearTimer = deps.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const pending = new Map<string, { candidate: AutoWatchCandidate; attempts: number; defers: number; next: number; expires: number }>();
  const hints = new Map<string, AutoWatchHint>();
  let timer: unknown = null;
  let running: Promise<void> | null = null;
  let stopped = false;

  function schedule() {
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (stopped || !pending.size) return;
    const due = Math.min(...[...pending.values()].map(entry => entry.next));
    timer = setTimer(() => { timer = null; void tick(); }, Math.max(0, due - now()));
  }

  async function eligiblePullRequest(context: Context, candidate: AutoWatchCandidate): Promise<StackPr | "drop" | null> {
    const repository = await readRepositoryInfo({ cwd: context.cwd, run: deps.run });
    const branch = await readCurrentBranch({ cwd: context.cwd, run: deps.run });
    if (!branch || branch === repository.defaultBranch) return "drop";
    const [viewer, open] = await Promise.all([
      readViewer({ cwd: context.cwd, repository, run: deps.run }),
      readRepositoryPullRequests({ cwd: context.cwd, repository, state: "open", run: deps.run }),
    ]);
    const onBranch = open.filter(pr => pr.headRefName === branch);
    if (!onBranch.length) return null;
    // Only this repository's own branch, opened by the signed-in user.
    const pr = onBranch.find(row => row.sameRepository && row.author.toLowerCase() === viewer.toLowerCase());
    if (!pr) return "drop";
    const created = Date.parse(pr.createdAt);
    const start = Math.floor(Date.parse(candidate.startedAt) / 1_000) * 1_000 - 5_000;
    const end = Date.parse(candidate.completedAt ?? new Date(now()).toISOString()) + 60_000;
    return created >= start && created <= end ? pr : "drop";
  }

  async function poll() {
    for (const [key, entry] of pending) {
      if (stopped) return;
      if (now() >= entry.expires || entry.attempts >= ATTEMPT_DELAYS.length) { pending.delete(key); continue; }
      if (entry.next > now()) continue;
      const c = entry.candidate;
      const context = await deps.context(c);
      if (!context || !context.enabled || context.managed || !context.snapshot.exists || context.snapshot.archived) { pending.delete(key); continue; }
      const s = context.snapshot;
      if (s.providerId !== "claude-code" && s.providerId !== "codex") { pending.delete(key); continue; }
      // A turn or decision always wins; waiting spends a timer, not a read.
      if (s.activeTurnId || s.pendingApprovalCount || s.pendingUserInputCount) {
        entry.next = now() + DEFER_DELAYS[Math.min(entry.defers++, DEFER_DELAYS.length - 1)]!;
        continue;
      }
      const listed = await deps.wakeUps.list({ workspaceId: c.workspaceId });
      if (listed.wakeUps.some(w => w.taskId === c.taskId || w.state !== "stopped" && w.trigger.kind === "pull_request")) { pending.delete(key); continue; }
      entry.attempts++;
      entry.next = now() + (ATTEMPT_DELAYS[entry.attempts] ?? LIFETIME);
      const found = await eligiblePullRequest(context, c);
      if (found === "drop") { pending.delete(key); continue; }
      if (!found) continue;
      const pr = found;
      // The task whose turn opened the PR owns the watch; two candidates own none.
      const creators = [...new Set(deps.evidence.creators({ workspaceId: c.workspaceId, url: pr.url, createdAt: pr.createdAt }).map(row => row.taskId))].sort();
      if (creators.length > 1) {
        const hint: AutoWatchHint = { workspaceId: c.workspaceId, taskIds: creators, pullRequest: { number: pr.number, url: pr.url }, reason: "ambiguous-task" };
        hints.delete(pr.url); hints.set(pr.url, hint);
        if (hints.size > MAX_HINTS) hints.delete(hints.keys().next().value!);
        for (const other of creators) pending.delete(`${c.workspaceId}:${other}`);
        pending.delete(key);
        deps.onHint?.(hint);
        continue;
      }
      if (creators[0] !== c.taskId) { pending.delete(key); continue; }
      const allWatches = await deps.wakeUps.list();
      if (allWatches.wakeUps.some(row => row.state !== "stopped" && row.trigger.kind === "pull_request" && row.pullRequestWatch?.pullRequest?.url === pr.url)) { pending.delete(key); continue; }
      if (deps.owned({ ...c, number: pr.number, url: pr.url })) { pending.delete(key); continue; }
      // Re-read after I/O: settings, decisions and ownership can change during gh.
      const fresh = await deps.context(c);
      if (!fresh || !fresh.enabled || fresh.managed || !fresh.snapshot.exists || fresh.snapshot.archived || fresh.cwd !== context.cwd || deps.owned({ ...c, number: pr.number, url: pr.url })) { pending.delete(key); continue; }
      if (fresh.snapshot.activeTurnId || fresh.snapshot.pendingApprovalCount || fresh.snapshot.pendingUserInputCount) continue;
      if (stopped) return;
      await deps.wakeUps.create({ workspaceId: c.workspaceId, taskId: c.taskId,
        prompt: DEFAULT_PULL_REQUEST_WATCH_PROMPT, trigger: { kind: "pull_request", events: [...AUTO_PULL_REQUEST_WATCH_EVENTS] },
        maxOccurrences: null, expiresAt: null }, { automatic: true, pullRequest: { number: pr.number, url: pr.url, title: pr.title } });
      pending.delete(key);
    }
  }
  function tick() {
    if (!running) {
      running = poll().catch(error => deps.onError?.(error)).finally(() => { running = null; schedule(); });
    }
    return running;
  }
  return {
    notify(candidate: AutoWatchCandidate) {
      if (stopped || !Number.isFinite(Date.parse(candidate.startedAt))) return;
      // Turns that neither ran a PR-creating command nor reported a PR link cost nothing.
      if (!deps.evidence.has(candidate.turnId)) return;
      const key = `${candidate.workspaceId}:${candidate.taskId}`;
      if (pending.has(key) || pending.size >= 100) return;
      pending.set(key, { candidate, attempts: 0, defers: 0, next: now(), expires: now() + LIFETIME });
      void tick();
    },
    tick,
    /** Hints for the workspace, newest last; memory only, like discovery. */
    hints: (workspaceId?: string) => [...hints.values()].filter(hint => !workspaceId || hint.workspaceId === workspaceId),
    stop() { stopped = true; pending.clear(); if (timer !== null) clearTimer(timer); timer = null; },
    pendingCount: () => pending.size,
  };
}
