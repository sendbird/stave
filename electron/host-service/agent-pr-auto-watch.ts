import { z } from "zod";
import { AUTO_PULL_REQUEST_WATCH_EVENTS, DEFAULT_PULL_REQUEST_WATCH_PROMPT } from "../../src/lib/supervision/pull-request-watch";
import type { WakeUpRuntime } from "./wake-up-runtime";
import type { TaskSupervisionSnapshot } from "./local-mcp-runtime";
import { fetchGitHubPrStatus, SCM_READ_TIMEOUT_MS, type ScmCommandRunner } from "./scm-runtime";
import { runCommandArgs } from "../main/utils/command";

export interface AutoWatchCandidate { workspaceId: string; taskId: string; turnId: string; startedAt: string }
interface Context { cwd: string; enabled: boolean; managed: boolean; snapshot: TaskSupervisionSnapshot }
interface Dependencies {
  wakeUps: Pick<WakeUpRuntime, "list" | "create">;
  context: (candidate: AutoWatchCandidate) => Promise<Context | null>;
  owned: (args: { workspaceId: string; taskId: string; number: number; url: string }) => boolean;
  run?: ScmCommandRunner;
  now?: () => number;
  onError?: (error: unknown) => void;
}
const CreatedSchema = z.object({ createdAt: z.string().datetime() }).strict();
const DELAYS = [0, 15_000, 30_000, 60_000];
const LIFETIME = 5 * 60_000;

/** Only completed turns enter this bounded queue; idle workspaces never poll. */
export function createAgentPrAutoWatch(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const run: ScmCommandRunner = args => (deps.run ?? runCommandArgs)({ ...args, timeoutMs: SCM_READ_TIMEOUT_MS });
  const pending = new Map<string, { candidate: AutoWatchCandidate; attempts: number; next: number; expires: number }>();
  const seen = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<void> | null = null;
  let stopped = false;
  async function poll() {
    for (const [key, entry] of pending) {
      if (stopped) return;
      if (now() >= entry.expires || entry.attempts >= DELAYS.length) { pending.delete(key); continue; }
      if (entry.next > now()) continue;
      const c = entry.candidate;
      const context = await deps.context(c);
      if (!context || !context.enabled || context.managed || !context.snapshot.exists || context.snapshot.archived) { pending.delete(key); continue; }
      const s = context.snapshot;
      if (s.providerId !== "claude-code" && s.providerId !== "codex") { pending.delete(key); continue; }
      // A turn or decision always wins; waiting does not spend a network attempt.
      if (s.activeTurnId || s.pendingApprovalCount || s.pendingUserInputCount) continue;
      const listed = await deps.wakeUps.list({ workspaceId: c.workspaceId });
      if (listed.wakeUps.some(w => w.taskId === c.taskId || w.state !== "stopped" && w.trigger.kind === "pull_request")) { pending.delete(key); continue; }
      entry.attempts++;
      entry.next = now() + (DELAYS[entry.attempts] ?? LIFETIME);
      const status = await fetchGitHubPrStatus({ cwd: context.cwd, runCommand: run });
      if (!status.ok || !status.pr || status.pr.state !== "OPEN") continue;
      const pr = status.pr;
      const allWatches = await deps.wakeUps.list();
      if (allWatches.wakeUps.some(row => row.state !== "stopped" && row.trigger.kind === "pull_request" && row.pullRequestWatch?.pullRequest?.url === pr.url)) { pending.delete(key); continue; }
      if (deps.owned({ ...c, number: pr.number, url: pr.url })) { pending.delete(key); continue; }
      const created = await run({ command: "gh", commandArgs: ["pr", "view", String(pr.number), "--json", "createdAt"], cwd: context.cwd });
      if (!created.ok) continue;
      let date: string;
      try { date = CreatedSchema.parse(JSON.parse(created.stdout)).createdAt; } catch { continue; }
      // Do not adopt an older PR simply because somebody chatted on its branch.
      if (Date.parse(date) < Math.floor(Date.parse(c.startedAt) / 1_000) * 1_000) { pending.delete(key); continue; }
      // Re-read after I/O: settings, decisions and ownership can change during gh.
      const fresh = await deps.context(c);
      if (!fresh || !fresh.enabled || fresh.managed || !fresh.snapshot.exists || fresh.snapshot.archived || deps.owned({ ...c, number: pr.number, url: pr.url })) { pending.delete(key); continue; }
      if (fresh.snapshot.activeTurnId || fresh.snapshot.pendingApprovalCount || fresh.snapshot.pendingUserInputCount) continue;
      const branch = await run({ command: "git", commandArgs: ["branch", "--show-current"], cwd: fresh.cwd });
      if (fresh.cwd !== context.cwd || !branch.ok || branch.stdout.trim() !== pr.headRefName) { pending.delete(key); continue; }
      if (stopped) return;
      await deps.wakeUps.create({ workspaceId: c.workspaceId, taskId: c.taskId,
        prompt: DEFAULT_PULL_REQUEST_WATCH_PROMPT, trigger: { kind: "pull_request", events: [...AUTO_PULL_REQUEST_WATCH_EVENTS] },
        maxOccurrences: null, expiresAt: null }, { number: pr.number, url: pr.url, title: pr.title });
      pending.delete(key);
    }
    if (!pending.size && timer) { clearInterval(timer); timer = null; }
  }
  function tick() {
    if (!running) running = poll().catch(error => deps.onError?.(error)).finally(() => { running = null; });
    return running;
  }
  return {
    notify(candidate: AutoWatchCandidate) {
      if (stopped || seen.has(candidate.turnId) || !Number.isFinite(Date.parse(candidate.startedAt))) return;
      seen.add(candidate.turnId);
      if (seen.size > 2_000) seen.delete(seen.values().next().value!);
      // Keep the earliest turn's boundary when several completions coalesce.
      const key = `${candidate.workspaceId}:${candidate.taskId}`;
      if (!pending.has(key) && pending.size < 100) pending.set(key, { candidate, attempts: 0, next: now(), expires: now() + LIFETIME });
      if (!timer) { timer = setInterval(() => void tick(), 1_000); timer.unref?.(); }
      void tick();
    },
    tick,
    stop() { stopped = true; pending.clear(); if (timer) clearInterval(timer); timer = null; },
    pendingCount: () => pending.size,
  };
}
