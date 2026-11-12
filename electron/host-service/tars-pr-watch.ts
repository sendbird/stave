import { parseTarsPrChecks, tarsPrWatchEpisode, TarsPrReviewInputSchema } from "../../src/lib/tars/pr-checks";
import { parseTarsDecisionId } from "../../src/lib/tars/decisions";
import type { TarsPublication } from "../../src/lib/tars/publication";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { TarsConversationStore } from "../persistence/tars-conversation-store";
import type { TarsStore } from "../persistence/tars-store";
import type { TarsPublishPorts } from "./tars-publish";

// One minute catches ordinary CI quickly; backoff limits API traffic for longer jobs.
export const TARS_PR_POLL_MS = [60_000, 120_000, 240_000, 300_000] as const;
// Three hours bounds unattended reads, including across restarts; another head does not reset it.
export const TARS_PR_WATCH_MS = 3 * 60 * 60_000;
const FIELDS = "state,isDraft,headRefName,headRefOid,statusCheckRollup";
class TerminalWatchError extends Error {}

type Ports = Pick<TarsPublishPorts, "run" | "resolveWorkspace" | "now" | "onError"> & {
  responsibilities: Pick<TarsStore, "get" | "patch" | "snapshot">;
  conversations: Pick<TarsConversationStore, "getAnswer" | "get" | "getReceipt">;
};

/** Only read commands are reachable from the timer. Ready is a separate, saved-answer path. */
export function createTarsPrWatcher(ports: Ports) {
  const now = ports.now ?? (() => new Date().toISOString());
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<void> | null = null;
  let stopped = false;
  const confirming = new Map<string, Promise<void>>();
  async function read(row: TarsResponsibility) {
    const workspace = await ports.resolveWorkspace(row);
    if (!workspace || !row.publication?.number) throw new Error("The published workspace is unavailable.");
    const result = await ports.run("gh", ["pr", "view", String(row.publication.number), "--json", FIELDS], workspace.path);
    if (!result.ok) {
      if (/rate limit|secondary rate|temporarily unavailable/i.test(`${result.stderr} ${result.stdout}`)) throw new Error("GitHub reads are temporarily limited.");
      if (/ENOENT|command not found|not logged in|gh auth login|authentication|HTTP 40[134]|could not resolve to a PullRequest/i.test(`${result.stderr} ${result.stdout}`))
        throw new TerminalWatchError("GitHub CLI or pull request access needs attention.");
      throw new Error("GitHub checks are temporarily unavailable.");
    }
    return { ...parseTarsPrChecks(JSON.parse(result.stdout), now()), cwd: workspace.path };
  }
  function save(row: TarsResponsibility, publication: TarsPublication) {
    const current = ports.responsibilities.get(row.id);
    // A publish or continuation that raced this read wins; never overwrite it with an old response.
    if (!current || current.revision !== row.revision) return;
    ports.responsibilities.patch(row.id, current.revision, { publication, ...(publication.watch?.stopped === "merged" && row.completionGoal === "merge" && row.state === "resultReady" && row.resultVerifiedRunId === row.agentRunId && publication.agentRunId === row.agentRunId ? { state: "completed" as const } : {}) }, now());
  }
  async function poll() {
    for (const row of ports.responsibilities.snapshot().responsibilities) {
      if (stopped) break;
      const publication = row.publication;
      if (publication?.state !== "opened" || !publication.number || !publication.commit) continue;
      const at = now();
      const watch = publication.watch ?? { startedAt: at, nextAt: at, polls: 0, stopped: null, fixRounds: 0 };
      if (watch.stopped) {
        if (["expired", "unavailable"].includes(watch.stopped) && !watch.noticeAt)
          save(row, { ...publication, checks: { state: "unavailable", failing: [], checkedAt: at, headSha: publication.commit }, watch: { ...watch, noticeAt: at } });
        continue;
      }
      if (Date.parse(watch.nextAt) > Date.parse(at)) continue;
      if (Date.parse(at) - Date.parse(watch.startedAt) >= TARS_PR_WATCH_MS) {
        save(row, { ...publication, checks: { state: "unavailable", failing: [], checkedAt: at, headSha: publication.commit }, watch: { ...watch, stopped: "expired", noticeAt: at } }); continue;
      }
      try {
        const live = await read(row);
        const delay = TARS_PR_POLL_MS[Math.min(watch.polls, TARS_PR_POLL_MS.length - 1)]!;
        save(row, { ...publication, checks: live.checks, watch: { ...watch, polls: watch.polls + 1,
          nextAt: new Date(Date.parse(at) + delay).toISOString(),
          stopped: live.merged ? "merged" : live.closed || live.branch !== publication.branch ? "closed" : null } });
      } catch (error) {
        const terminal = error instanceof TerminalWatchError;
        const delay = TARS_PR_POLL_MS[Math.min(watch.polls, TARS_PR_POLL_MS.length - 1)]!;
        save(row, { ...publication, checks: { state: "unavailable", failing: [], checkedAt: at, headSha: publication.commit },
          watch: { ...watch, polls: watch.polls + 1, nextAt: new Date(Date.parse(at) + delay).toISOString(), stopped: terminal ? "unavailable" : null, ...(terminal ? { noticeAt: at } : {}) } });
      }
    }
  }
  function tick(): Promise<void> {
    if (!running) running = poll().catch((error) => ports.onError?.(error)).finally(() => { running = null; });
    return running;
  }
  async function confirm(raw: unknown) {
    const { decisionId } = TarsPrReviewInputSchema.parse(raw);
    const answer = ports.conversations.getAnswer(decisionId);
    const ref = parseTarsDecisionId(decisionId);
    if (!answer || answer.status !== "pending" || answer.source === "tars" || answer.source === "words"
      || answer.effect.kind !== "prReview" || ref?.kind !== "ask") throw new Error("An explicit saved review decision is required.");
    const message = ports.conversations.get(ref.messageId);
    const action = ports.conversations.getReceipt(ref.messageId, ref.actionIndex)?.action;
    const effect = answer.effect;
    const option = action?.kind === "ask" ? action.options[answer.optionIndex]?.effect : null;
    if (message?.origin?.kind !== "followUp" || !["ciPassed", "ciUnavailable"].includes(message.origin.reason) || option?.kind !== "prReview"
      || JSON.stringify(option) !== JSON.stringify(effect)) throw new Error("The review option does not match its notice.");
    const row = ports.responsibilities.get(effect.responsibilityId);
    const publication = row?.publication;
    if (effect.choice === "watch") {
      if (publication?.watch?.rearmedBy === decisionId) return;
      if (!row || publication?.state !== "opened" || publication.commit !== effect.headSha || !publication.watch
        || message.origin.eventKey !== `ciUnavailable:${row.id}:${tarsPrWatchEpisode(effect.headSha, publication.watch.startedAt)}`
        || !["expired", "unavailable"].includes(publication.watch.stopped ?? "")) throw new Error("The stopped watch changed. Refresh before continuing.");
      save(row, { ...publication, watch: { ...publication.watch, startedAt: now(), nextAt: now(), polls: 0, stopped: null, rearmedBy: decisionId } });
      return;
    }
    if (message.origin.reason !== "ciPassed") throw new Error("A passing-check notice is required.");
    if (publication?.watch?.reviewHead === effect.headSha && publication.watch.reviewChoice === effect.choice) return;
    if (!row || publication?.state !== "opened" || publication.commit !== effect.headSha
      || publication.checks?.headSha !== effect.headSha || (publication.checks.state !== "passed" && !(effect.choice === "ready" && publication.watch?.stopped === "expired")) || !publication.watch
      || ["closed", "merged"].includes(publication.watch.stopped ?? "") || row.executionPending || row.agentRunId !== publication.agentRunId
      || (row.state !== "completed" && row.state !== "resultReady")) throw new Error("The published head changed. Refresh its checks.");
    if (effect.choice === "ready") {
      const live = await read(row);
      if (live.closed || live.branch !== publication.branch || live.checks.headSha !== effect.headSha || live.checks.state !== "passed")
        throw new Error("The pull request is no longer ready for review.");
      const current = ports.responsibilities.get(row.id);
      if (current?.revision !== row.revision) throw new Error("The work changed while confirming review.");
      if (live.draft) {
        const result = await ports.run("gh", ["pr", "ready", String(publication.number)], live.cwd);
        if (!result.ok) throw new Error("The pull request could not be marked ready for review.");
      }
    }
    // A lost acknowledgement is safe to retry: live isDraft=false skips the write.
    const current = ports.responsibilities.get(row.id);
    if (current?.publication?.commit === effect.headSha) ports.responsibilities.patch(row.id, current.revision,
      { publication: { ...current.publication, watch: { ...current.publication.watch!, reviewHead: effect.headSha, reviewChoice: effect.choice } } }, now());
  }
  return {
    tick,
    start() { if (timer) return; stopped = false; void tick(); timer = setInterval(() => { void tick(); }, 5_000); timer.unref?.(); },
    stop() { stopped = true; if (timer) clearInterval(timer); timer = null; },
    confirm(raw: unknown) {
      const { decisionId } = TarsPrReviewInputSchema.parse(raw);
      const prior = confirming.get(decisionId);
      if (prior) return prior;
      const promise = confirm(raw).finally(() => confirming.delete(decisionId));
      confirming.set(decisionId, promise); return promise;
    },
  };
}
