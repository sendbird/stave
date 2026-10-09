/**
 * Stave actions: the pull request stages an agent run performs itself, without a
 * model turn. Open draft PR, Watch checks and Ready for review.
 *
 * Used by: `electron/host-service/supervision/agent-run-host.ts`, which hands
 * `performAction` to the agent run runtime. The runtime calls it on every tick
 * while an action stage runs and no turn is active, so each call picks up
 * from the current remote and local state rather than from memory:
 *
 * - `action-started` is written, keyed by stage attempt, before any remote
 *   call. A later call, including one after a restart, reads remote state
 *   first: an existing pull request is adopted, a ready one is not marked
 *   again, and `gh pr create` itself refuses a duplicate.
 * - Open draft PR commits what was left and pushes unpushed commits before it
 *   adopts or opens the pull request, and refuses the base branch before it
 *   commits anything. Ready for review pushes the workspace's HEAD first when
 *   the pull request lacks it.
 * - Watch checks asks the runtime for a repair turn when checks fail. The
 *   runtime counts the turn; after it ends normally, the next call commits and
 *   pushes the fix and watches the new head. A repair turn that was stopped,
 *   failed or interrupted pushes nothing and marks the stage stuck; one that
 *   never started is not a repair.
 * - Missing GitHub authentication, a protected branch or a rejected push fail
 *   the action with Stave's own sentence, which blocks the stage.
 */
import {
  buildAgentRunActionKey,
  buildAgentRunTurnOutcomeKey,
  currentStageRecord,
  workflowStageAt,
  type ActionResult,
  type AgentRunAggregate,
  type AgentRunEvent,
} from "../../../src/lib/agent-runs/domain";
import {
  CHECKS_POLL_INTERVAL_MS,
  decideWatchChecks,
  observeChecks,
  summarizeChecksObservation,
  type PullRequestCheck,
  type WatchedPullRequest,
} from "../../../src/lib/agent-runs/checks";
import type { ActionOutcome } from "../../../src/lib/agent-runs/policy";
import {
  buildAgentRunCommitMessage,
  buildAgentRunPullRequestDraft,
  CHECKS_REPAIR_COMMIT_MESSAGE,
} from "../../../src/lib/agent-runs/pull-request-draft";
import type { StaveAction } from "../../../src/lib/workflows/schema";
import { classifyProviderTurnStopReason } from "../../../src/lib/providers/turn-status";
import type { AgentRunStore } from "../../persistence/agent-run-store";
import type { PersistedTurnStreamEvent } from "../../persistence/turn-event-payload";

export type ScmStep<T = true> = { ok: true; value: T } | { ok: false; detail: string };

export interface AgentRunPullRequest extends WatchedPullRequest {
  isDraft: boolean;
}

/** The source-control operations the actions need, one call each. */
export interface AgentRunScmPort {
  currentBranch: (cwd: string) => Promise<string | null>;
  headSha: (cwd: string) => Promise<string | null>;
  hasUncommittedChanges: (cwd: string) => Promise<boolean>;
  commitAll: (cwd: string, message: string) => Promise<ScmStep>;
  /** True when HEAD has commits its upstream lacks, or has no upstream. */
  hasUnpushedCommits: (cwd: string) => Promise<boolean>;
  push: (cwd: string, branch: string) => Promise<ScmStep>;
  /** The branch's pull request in any state, or null when it has none. */
  readPullRequest: (cwd: string) => Promise<ScmStep<AgentRunPullRequest | null>>;
  createDraftPullRequest: (
    cwd: string,
    draft: { title: string; body: string },
  ) => Promise<ScmStep<{ url: string; created: boolean }>>;
  markReady: (cwd: string) => Promise<ScmStep>;
  readChecks: (cwd: string, prNumber: number) => Promise<ScmStep<PullRequestCheck[]>>;
  /** The branch a new pull request targets, such as `main`. */
  readBaseBranch: (cwd: string) => Promise<string>;
  /** The base branch and `git log --oneline <base>..HEAD`. */
  readCommitLog: (cwd: string) => Promise<{ baseBranch: string; log: string }>;
}

/** How a turn that is no longer running ended. */
export type AgentRunTurnEnding = "completed" | "stopped" | "failed";

type ActionStore = Pick<AgentRunStore, "recordEvent" | "listEventsByKind">;

/** A finished run of a workspace script, as the Run script action reads it. */
export type AgentRunScriptRun =
  | { ok: true; exitCode: number; output: string; verification?: import("../../../src/lib/agent-runs/verification-contract").ScriptVerification }
  | { ok: false; detail: string; exitCode?: number | null; output?: string };

/** How long an agent run waits for a script before it fails the stage. */
const SCRIPT_TIMEOUT_MS = 30 * 60_000;

/** The last https address a script printed, such as a preview deployment's. */
export function lastPrintedUrl(output: string): string | undefined {
  const matches = output.match(/https:\/\/[^\s"'<>`)\]]+/g);
  return matches?.at(-1)?.replace(/[.,;:]+$/, "");
}

/** A few failed reads in a row are an outage worth stopping for. */
const MAX_CONSECUTIVE_READ_FAILURES = 3;
/** How long a pushed repair may take to become the pull request's head. */
const PUSHED_HEAD_WAIT_MS = 10 * 60_000;
/**
 * How long a stage waits for the pull request to show the workspace's HEAD
 * when it did not push a repair itself. A push is applied in seconds; a head
 * that still differs after this means the branches differ.
 */
const LOCAL_HEAD_WAIT_MS = 2 * 60_000;

const UNFINISHED_REPAIR: Record<Exclude<AgentRunTurnEnding, "completed"> | "interrupted", string> = {
  interrupted:
    "Stave stopped while the checks repair turn ran, so it did not push that repair. Check the workspace, then retry the stage.",
  stopped:
    "The checks repair turn was stopped before it finished, so Stave did not push it. Check the workspace, then retry the stage.",
  failed: "The checks repair turn failed, so Stave did not push it. Check the workspace, then retry the stage.",
};

function shortSha(sha: string) {
  return sha.slice(0, 7);
}

/**
 * How a turn ended, from its persisted events. A turn closed without a `done`
 * event was stopped or taken over before it finished.
 */
export function classifyAgentRunTurnEnding(events: readonly PersistedTurnStreamEvent[]): AgentRunTurnEnding {
  return observeAgentRunTurnEnding(events) ?? "stopped";
}

/** Unlike the supervision fallback, an observation needs a persisted terminal event. */
export function observeAgentRunTurnEnding(events: readonly PersistedTurnStreamEvent[]): AgentRunTurnEnding | null {
  const done = [...events].reverse().find((entry) => entry.event?.type === "done")?.event;
  if (done?.type !== "done") return null;
  switch (classifyProviderTurnStopReason(done.stop_reason)) {
    case "completed":
      return "completed";
    case "cancelled":
      return "stopped";
    case "failed":
      return "failed";
  }
}

function failed(detail: string): ActionOutcome {
  return { status: "failed", detail };
}

function succeeded(result: ActionResult): ActionOutcome {
  return { status: "succeeded", result };
}

function pullRequestNumber(url: string): number | null {
  const match = /\/pull\/(\d+)(?:[/?#]|$)/.exec(url);
  return match ? Number(match[1]) : null;
}

export function createAgentRunActionExecutor(deps: {
  store: ActionStore;
  scm: AgentRunScmPort;
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  /** Runs an action from the workspace's scripts and resolves when it ends. */
  runScript?: (args: { workspaceId: string; scriptId: string; signal?: AbortSignal }) => Promise<AgentRunScriptRun>;
  /**
   * How a turn that is no longer running ended. Absent: every repair turn
   * that started and was not interrupted counts as completed.
   */
  readTurnEnding?: (turnId: string) => AgentRunTurnEnding;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const { scm, store } = deps;
  /** Per stage attempt, so a watch polls GitHub once a minute, not every tick. */
  const lastPollAt = new Map<string, number>();
  const lastObservation = new Map<string, string>();
  const readFailures = new Map<string, number>();
  /** Scripts this process started, per stage attempt, and their outcomes once they end. */
  const scriptRuns = new Set<string>();
  const scriptOutcomes = new Map<string, ActionOutcome>();

  /**
   * Starts the script once, reports it in progress on every tick while it
   * runs, then hands over its outcome. A run a previous process started is
   * never replayed: its result is unknown, so the stage fails and says so.
   */
  function runWorkspaceScript(args: {
    aggregate: AgentRunAggregate;
    scriptId: string;
    actionKey: string;
    firstCall: boolean;
    signal?: AbortSignal;
  }): ActionOutcome {
    const { actionKey, scriptId } = args;
    const finished = scriptOutcomes.get(actionKey);
    if (finished) {
      scriptOutcomes.delete(actionKey);
      return finished;
    }
    if (scriptRuns.has(actionKey)) return { status: "in-progress" };
    if (!args.firstCall) {
      return failed(`Stave stopped while “${scriptId}” ran, so its result is unknown. Check the workspace, then retry the stage.`);
    }
    const run = deps.runScript;
    if (!run) return failed("This version of Stave cannot run workspace scripts from a run.");
    scriptRuns.add(actionKey);
    const timeoutController = new AbortController();
    const signal = args.signal ? AbortSignal.any([args.signal, timeoutController.signal]) : timeoutController.signal;
    let timeoutHandle: ReturnType<typeof setTimeout>;
    const timeout = new Promise<AgentRunScriptRun>((resolve) =>
      (timeoutHandle = setTimeout(
        () => { timeoutController.abort(); resolve({ ok: false, detail: `“${scriptId}” was stopped after 30 minutes.` }); },
        SCRIPT_TIMEOUT_MS,
      )).unref?.(),
    );
    void Promise.race([run({ workspaceId: args.aggregate.agentRun.workspaceId, scriptId, signal }), timeout])
      .catch((error: unknown): AgentRunScriptRun => ({
        ok: false,
        detail: error instanceof Error && error.message ? error.message : `“${scriptId}” could not run.`,
      }))
      .then((result) => {
        clearTimeout(timeoutHandle);
        scriptRuns.delete(actionKey);
        if (args.signal?.aborted) return;
        const output = ("output" in result ? result.output : undefined) ?? "";
        const tail = output.trim().slice(-300);
        scriptOutcomes.set(
          actionKey,
          result.ok && result.exitCode === 0
            ? succeeded({
                type: "run-script",
                scriptId,
                exitCode: 0,
                ...(result.verification ? { verification: result.verification } : {}),
                ...(lastPrintedUrl(output) ? { url: lastPrintedUrl(output)! } : {}),
                outputTail: output.slice(-2_000),
              })
            : failed(
                result.ok
                  ? `“${scriptId}” exited with ${result.exitCode}.${tail ? ` ${tail}` : ""}`
                  : `${result.detail}${tail ? ` ${tail}` : ""}`,
              ),
        );
      });
    return { status: "in-progress" };
  }

  async function openDraftPr(cwd: string, aggregate: AgentRunAggregate): Promise<ActionOutcome> {
    const branch = await scm.currentBranch(cwd);
    if (!branch) {
      return failed("The workspace is not on a branch, so Stave cannot open a pull request from it.");
    }
    // Refused before anything is committed or pushed.
    if (branch === (await scm.readBaseBranch(cwd))) {
      return failed(
        `The workspace is on ${branch}, the base branch, so Stave will not commit or push to it. Move the work to a feature branch, then retry this stage.`,
      );
    }
    const existing = await scm.readPullRequest(cwd);
    if (!existing.ok) return failed(existing.detail);
    const open = existing.value?.state === "OPEN" ? existing.value : null;
    // What was left is committed and pushed even when the branch already has
    // a pull request: after "Ask for changes" the rerun's work belongs in it.
    if (await scm.hasUncommittedChanges(cwd)) {
      const committed = await scm.commitAll(cwd, buildAgentRunCommitMessage(aggregate));
      if (!committed.ok) return failed(`Stave could not commit the remaining changes: ${committed.detail}`);
    }
    if (!open || (await scm.hasUnpushedCommits(cwd))) {
      const pushed = await scm.push(cwd, branch);
      if (!pushed.ok) return failed(pushed.detail);
    }
    if (open) {
      return succeeded({ type: "open-draft-pr", prUrl: open.url, prNumber: open.number, created: false });
    }
    const { baseBranch, log } = await scm.readCommitLog(cwd);
    const created = await scm.createDraftPullRequest(
      cwd,
      buildAgentRunPullRequestDraft({ aggregate, baseBranch, headBranch: branch, commitLog: log }),
    );
    if (!created.ok) return failed(created.detail);
    const prNumber = pullRequestNumber(created.value.url);
    if (!prNumber) return failed("GitHub did not return the pull request's address.");
    return succeeded({
      type: "open-draft-pr",
      prUrl: created.value.url,
      prNumber,
      created: created.value.created,
    });
  }

  async function markPrReady(cwd: string, startedAt: Date): Promise<ActionOutcome> {
    const current = await scm.readPullRequest(cwd);
    if (!current.ok) return failed(current.detail);
    const pr = current.value;
    if (!pr || pr.state !== "OPEN") {
      return failed("This workspace has no open pull request to mark ready for review.");
    }
    // Reviewers are notified about the workspace's HEAD, not an older push.
    const head = await scm.headSha(cwd);
    if (head && pr.headRefOid && pr.headRefOid !== head) {
      if (await scm.hasUnpushedCommits(cwd)) {
        const branch = await scm.currentBranch(cwd);
        if (!branch) return failed("The workspace is not on a branch, so Stave cannot push it.");
        const pushed = await scm.push(cwd, branch);
        if (!pushed.ok) return failed(pushed.detail);
        return { status: "in-progress" };
      }
      // A push GitHub has not applied to the pull request yet.
      if (now().getTime() - startedAt.getTime() < LOCAL_HEAD_WAIT_MS) return { status: "in-progress" };
      return failed(
        `The pull request's head is ${shortSha(pr.headRefOid)}, not this workspace's ${shortSha(head)}. Push or pull so they match, then retry this stage.`,
      );
    }
    if (!pr.isDraft) return succeeded({ type: "mark-pr-ready", prUrl: pr.url });
    const ready = await scm.markReady(cwd);
    if (!ready.ok) return failed(ready.detail);
    return succeeded({ type: "mark-pr-ready", prUrl: pr.url });
  }

  function eventsOfAttempt(
    events: readonly AgentRunEvent[],
    stageId: string,
    attempt: number,
  ) {
    return events.filter(
      (event) => event.detail.stageId === stageId && event.detail.attempt === attempt,
    );
  }

  /** Why a repair turn's fix must not be pushed, or null when the turn finished. */
  function unfinishedRepair(
    started: AgentRunEvent,
    events: readonly AgentRunEvent[],
  ): keyof typeof UNFINISHED_REPAIR | null {
    const turnKey = started.idempotencyKey!;
    const byKey = (outcome: "linked" | "interrupted") =>
      events.find((event) => event.idempotencyKey === buildAgentRunTurnOutcomeKey(turnKey, outcome));
    if (byKey("interrupted")) return "interrupted";
    const turnId = byKey("linked")?.detail.turnId;
    // Started but never linked: Stave stopped in the middle of starting it.
    if (typeof turnId !== "string") return "interrupted";
    const ending = deps.readTurnEnding?.(turnId) ?? "completed";
    return ending === "completed" ? null : ending;
  }

  /** When this stage attempt's action first ran. */
  function actionStartedAt(agentRunId: string, actionKey: string): Date {
    const started = store
      .listEventsByKind(agentRunId, ["action-started"])
      .find((event) => event.idempotencyKey === actionKey);
    return started ? new Date(started.createdAt) : now();
  }

  /** A read that fails now and then is waited out; a run of failures stops the watch. */
  function readFailure(key: string, detail: string): ActionOutcome {
    const count = (readFailures.get(key) ?? 0) + 1;
    readFailures.set(key, count);
    return count >= MAX_CONSECUTIVE_READ_FAILURES
      ? failed(`Stave could not read the pull request's checks: ${detail}`)
      : { status: "in-progress" };
  }

  async function watchChecks(args: {
    cwd: string;
    aggregate: AgentRunAggregate;
    action: Extract<StaveAction, { type: "watch-checks" }>;
    actionKey: string;
  }): Promise<ActionOutcome> {
    const { cwd, aggregate, action, actionKey } = args;
    const { agentRun } = aggregate;
    const record = currentStageRecord(aggregate);
    const events = eventsOfAttempt(
      store.listEventsByKind(agentRun.id, [
        "action-started",
        "turn-started",
        "turn-linked",
        "turn-failed",
        "turn-interrupted",
        "action-finished",
      ]),
      record.stageId,
      record.attempt,
    );
    const keys = new Set(events.map((event) => event.idempotencyKey));
    // A repair turn that never started is not a repair.
    const repairs = events.filter(
      (event) =>
        event.kind === "turn-started" &&
        event.detail.reason === "repair-checks" &&
        event.idempotencyKey &&
        !keys.has(buildAgentRunTurnOutcomeKey(event.idempotencyKey, "failed")),
    );
    const repairsUsed = repairs.length;
    const pushes = events.filter(
      (event) => event.kind === "action-finished" && event.detail.step === "repair-pushed",
    );

    // The runtime starts no action while a turn runs, so a repair turn that
    // has no push recorded yet has ended: send its fix before watching again,
    // but only when the turn finished. Otherwise the tree holds half a repair,
    // or the user's own edits.
    if (repairsUsed > pushes.length) {
      const unfinished = unfinishedRepair(repairs.at(-1)!, events);
      if (unfinished) return { status: "stuck", detail: UNFINISHED_REPAIR[unfinished] };
      const branch = await scm.currentBranch(cwd);
      if (!branch) return failed("The workspace is not on a branch, so Stave cannot push the repair.");
      if (await scm.hasUncommittedChanges(cwd)) {
        const committed = await scm.commitAll(cwd, CHECKS_REPAIR_COMMIT_MESSAGE);
        if (!committed.ok) return failed(`Stave could not commit the repair: ${committed.detail}`);
      }
      if (await scm.hasUnpushedCommits(cwd)) {
        const pushed = await scm.push(cwd, branch);
        if (!pushed.ok) return failed(pushed.detail);
      }
      store.recordEvent(
        agentRun.id,
        {
          kind: "action-finished",
          idempotencyKey: `${actionKey}:repair:${repairsUsed}:pushed`,
          detail: {
            stageId: record.stageId,
            attempt: record.attempt,
            step: "repair-pushed",
            repair: repairsUsed,
            headSha: await scm.headSha(cwd),
          },
        },
        now(),
      );
      lastPollAt.delete(actionKey);
      return { status: "in-progress" };
    }

    const at = now();
    const previousPoll = lastPollAt.get(actionKey);
    if (previousPoll !== undefined && at.getTime() - previousPoll < CHECKS_POLL_INTERVAL_MS) {
      return { status: "in-progress" };
    }
    lastPollAt.set(actionKey, at.getTime());

    const started = events.find((event) => event.idempotencyKey === actionKey);
    const latestPush = pushes.at(-1);
    const watchStartedAt = new Date(latestPush?.createdAt ?? started?.createdAt ?? at.toISOString());

    const current = await scm.readPullRequest(cwd);
    if (!current.ok) return readFailure(actionKey, current.detail);
    const pr = current.value;
    // GitHub can take a moment to move the pull request to a push, the
    // repair's or the one Open draft PR just made; checks read before then
    // belong to the head before it.
    const expectedHead =
      typeof latestPush?.detail.headSha === "string"
        ? latestPush.detail.headSha
        : (await scm.hasUnpushedCommits(cwd))
          ? null
          : await scm.headSha(cwd);
    const headWaitMs = latestPush ? PUSHED_HEAD_WAIT_MS : LOCAL_HEAD_WAIT_MS;
    if (
      pr?.state === "OPEN" &&
      expectedHead &&
      pr.headRefOid &&
      pr.headRefOid !== expectedHead
    ) {
      if (at.getTime() - watchStartedAt.getTime() < headWaitMs) return { status: "in-progress" };
      return failed(`The pull request's head is ${shortSha(pr.headRefOid)}, not the expected ${shortSha(expectedHead)}. Push or pull so they match, then retry this stage.`);
    }
    let checks: PullRequestCheck[] = [];
    if (pr?.state === "OPEN") {
      const read = await scm.readChecks(cwd, pr.number);
      if (!read.ok) return readFailure(actionKey, read.detail);
      checks = read.value;
    }
    readFailures.delete(actionKey);

    const observation = observeChecks({ pr, checks });
    const summary = summarizeChecksObservation({ observation, pr, checks });
    const signature = JSON.stringify(summary);
    if (lastObservation.get(actionKey) !== signature) {
      lastObservation.set(actionKey, signature);
      store.recordEvent(
        agentRun.id,
        {
          kind: "checks-observed",
          idempotencyKey: null,
          detail: { stageId: record.stageId, attempt: record.attempt, ...summary },
        },
        at,
      );
    }
    return decideWatchChecks({
      observation,
      pr,
      now: at,
      watchStartedAt,
      timeoutMinutes: action.timeoutMinutes,
      repairsUsed,
      repairAttempts: action.repairAttempts,
    });
  }

  async function run(
    cwd: string,
    aggregate: AgentRunAggregate,
    action: StaveAction,
    actionKey: string,
    firstCall: boolean,
    signal?: AbortSignal,
  ): Promise<ActionOutcome> {
    switch (action.type) {
      case "open-draft-pr":
        return openDraftPr(cwd, aggregate);
      case "watch-checks":
        return watchChecks({ cwd, aggregate, action, actionKey });
      case "mark-pr-ready":
        return markPrReady(cwd, actionStartedAt(aggregate.agentRun.id, actionKey));
      case "run-script":
        return runWorkspaceScript({ aggregate, scriptId: action.scriptId, actionKey, firstCall, signal });
    }
  }

  return async function performAction(args: {
    aggregate: AgentRunAggregate;
    signal?: AbortSignal;
  }): Promise<ActionOutcome> {
    const { aggregate } = args;
    if (args.signal?.aborted) return failed("The action was cancelled.");
    const { agentRun } = aggregate;
    const stage = workflowStageAt(agentRun, agentRun.currentStageIndex);
    if (stage.kind !== "action") return failed("This stage is not a Stave action.");
    const record = currentStageRecord(aggregate);
    const actionKey = buildAgentRunActionKey({
      agentRunId: agentRun.id,
      stageId: record.stageId,
      attempt: record.attempt,
    });
    const firstCall = store.recordEvent(
      agentRun.id,
      {
        kind: "action-started",
        idempotencyKey: actionKey,
        detail: { stageId: record.stageId, attempt: record.attempt, type: stage.action.type },
      },
      now(),
    );
    const cwd = await deps.resolveWorkspacePath(agentRun.workspaceId);
    if (!cwd) return failed("The workspace folder could not be found.");
    if (args.signal?.aborted) return failed("The action was cancelled.");
    const outcome = await run(cwd, aggregate, stage.action, actionKey, firstCall, args.signal);
    if (outcome.status === "succeeded" || outcome.status === "failed" || outcome.status === "stuck") {
      store.recordEvent(
        agentRun.id,
        {
          kind: "action-finished",
          idempotencyKey: `${actionKey}:finished`,
          detail: {
            stageId: record.stageId,
            attempt: record.attempt,
            step: "finished",
            status: outcome.status,
            ...(outcome.status === "succeeded"
              ? { result: outcome.result }
              : { detail: outcome.detail.slice(0, 500) }),
          },
        },
        now(),
      );
      lastPollAt.delete(actionKey);
      lastObservation.delete(actionKey);
      readFailures.delete(actionKey);
    }
    return outcome;
  };
}
