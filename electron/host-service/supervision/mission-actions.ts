/**
 * Stave actions: the pull request stages a mission performs itself, without a
 * model turn. Open draft PR, Watch checks and Ready for review.
 *
 * Used by: `electron/host-service/supervision/mission-host.ts`, which hands
 * `performAction` to the mission runtime. The runtime calls it on every tick
 * while an action stage runs and no turn is active, so each call picks up
 * from the current remote and local state rather than from memory:
 *
 * - `action-started` is written, keyed by stage attempt, before any remote
 *   call. A later call, including one after a restart, reads remote state
 *   first: an existing pull request is adopted, a ready one is not marked
 *   again, and `gh pr create` itself refuses a duplicate.
 * - Watch checks asks the runtime for a repair turn when checks fail. The
 *   runtime counts the turn; after it ends, the next call commits and pushes
 *   the fix and watches the new head.
 * - Missing GitHub authentication, a protected branch or a rejected push fail
 *   the action with Stave's own sentence, which blocks the stage.
 */
import {
  buildMissionActionKey,
  currentStageRecord,
  playbookStageAt,
  type ActionResult,
  type MissionAggregate,
  type MissionEvent,
} from "../../../src/lib/missions/domain";
import {
  CHECKS_POLL_INTERVAL_MS,
  decideWatchChecks,
  observeChecks,
  summarizeChecksObservation,
  type PullRequestCheck,
  type WatchedPullRequest,
} from "../../../src/lib/missions/checks";
import type { ActionOutcome } from "../../../src/lib/missions/policy";
import {
  buildMissionCommitMessage,
  buildMissionPullRequestDraft,
  CHECKS_REPAIR_COMMIT_MESSAGE,
} from "../../../src/lib/missions/pull-request-draft";
import type { StaveAction } from "../../../src/lib/playbooks/schema";
import type { MissionStore } from "../../persistence/mission-store";

export type ScmStep<T = true> = { ok: true; value: T } | { ok: false; detail: string };

export interface MissionPullRequest extends WatchedPullRequest {
  isDraft: boolean;
}

/** The source-control operations the actions need, one call each. */
export interface MissionScmPort {
  currentBranch: (cwd: string) => Promise<string | null>;
  headSha: (cwd: string) => Promise<string | null>;
  hasUncommittedChanges: (cwd: string) => Promise<boolean>;
  commitAll: (cwd: string, message: string) => Promise<ScmStep>;
  /** True when HEAD has commits its upstream lacks, or has no upstream. */
  hasUnpushedCommits: (cwd: string) => Promise<boolean>;
  push: (cwd: string, branch: string) => Promise<ScmStep>;
  /** The branch's pull request in any state, or null when it has none. */
  readPullRequest: (cwd: string) => Promise<ScmStep<MissionPullRequest | null>>;
  createDraftPullRequest: (
    cwd: string,
    draft: { title: string; body: string },
  ) => Promise<ScmStep<{ url: string; created: boolean }>>;
  markReady: (cwd: string) => Promise<ScmStep>;
  readChecks: (cwd: string, prNumber: number) => Promise<ScmStep<PullRequestCheck[]>>;
  /** The base branch and `git log --oneline <base>..HEAD`. */
  readCommitLog: (cwd: string) => Promise<{ baseBranch: string; log: string }>;
}

type ActionStore = Pick<MissionStore, "recordEvent" | "listEventsByKind">;

/** A finished run of a workspace script, as the Run script action reads it. */
export type MissionScriptRun =
  | { ok: true; exitCode: number; output: string }
  | { ok: false; detail: string; exitCode?: number | null; output?: string };

/** How long a mission waits for a script before it fails the stage. */
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

export function createMissionActionExecutor(deps: {
  store: ActionStore;
  scm: MissionScmPort;
  resolveWorkspacePath: (workspaceId: string) => Promise<string | null>;
  /** Runs an action from the workspace's scripts and resolves when it ends. */
  runScript?: (args: { workspaceId: string; scriptId: string }) => Promise<MissionScriptRun>;
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
    aggregate: MissionAggregate;
    scriptId: string;
    actionKey: string;
    firstCall: boolean;
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
    if (!run) return failed("This version of Stave cannot run workspace scripts from a mission.");
    scriptRuns.add(actionKey);
    const timeout = new Promise<MissionScriptRun>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, detail: `“${scriptId}” did not finish in 30 minutes. It may still be running in Scripts.` }),
        SCRIPT_TIMEOUT_MS,
      ).unref?.(),
    );
    void Promise.race([run({ workspaceId: args.aggregate.mission.workspaceId, scriptId }), timeout])
      .catch((error: unknown): MissionScriptRun => ({
        ok: false,
        detail: error instanceof Error && error.message ? error.message : `“${scriptId}” could not run.`,
      }))
      .then((result) => {
        scriptRuns.delete(actionKey);
        const output = ("output" in result ? result.output : undefined) ?? "";
        const tail = output.trim().slice(-300);
        scriptOutcomes.set(
          actionKey,
          result.ok && result.exitCode === 0
            ? succeeded({
                type: "run-script",
                scriptId,
                exitCode: 0,
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

  async function openDraftPr(cwd: string, aggregate: MissionAggregate): Promise<ActionOutcome> {
    const branch = await scm.currentBranch(cwd);
    if (!branch) {
      return failed("The workspace is not on a branch, so Stave cannot open a pull request from it.");
    }
    const existing = await scm.readPullRequest(cwd);
    if (!existing.ok) return failed(existing.detail);
    if (existing.value?.state === "OPEN") {
      return succeeded({
        type: "open-draft-pr",
        prUrl: existing.value.url,
        prNumber: existing.value.number,
        created: false,
      });
    }
    if (await scm.hasUncommittedChanges(cwd)) {
      const committed = await scm.commitAll(cwd, buildMissionCommitMessage(aggregate));
      if (!committed.ok) return failed(`Stave could not commit the remaining changes: ${committed.detail}`);
    }
    const pushed = await scm.push(cwd, branch);
    if (!pushed.ok) return failed(pushed.detail);
    const { baseBranch, log } = await scm.readCommitLog(cwd);
    const created = await scm.createDraftPullRequest(
      cwd,
      buildMissionPullRequestDraft({ aggregate, baseBranch, headBranch: branch, commitLog: log }),
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

  async function markPrReady(cwd: string): Promise<ActionOutcome> {
    const current = await scm.readPullRequest(cwd);
    if (!current.ok) return failed(current.detail);
    const pr = current.value;
    if (!pr || pr.state !== "OPEN") {
      return failed("This workspace has no open pull request to mark ready for review.");
    }
    if (!pr.isDraft) return succeeded({ type: "mark-pr-ready", prUrl: pr.url });
    const ready = await scm.markReady(cwd);
    if (!ready.ok) return failed(ready.detail);
    return succeeded({ type: "mark-pr-ready", prUrl: pr.url });
  }

  function eventsOfAttempt(
    events: readonly MissionEvent[],
    stageId: string,
    attempt: number,
  ) {
    return events.filter(
      (event) => event.detail.stageId === stageId && event.detail.attempt === attempt,
    );
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
    aggregate: MissionAggregate;
    action: Extract<StaveAction, { type: "watch-checks" }>;
    actionKey: string;
  }): Promise<ActionOutcome> {
    const { cwd, aggregate, action, actionKey } = args;
    const { mission } = aggregate;
    const record = currentStageRecord(aggregate);
    const events = eventsOfAttempt(
      store.listEventsByKind(mission.id, ["action-started", "turn-started", "action-finished"]),
      record.stageId,
      record.attempt,
    );
    const repairsUsed = events.filter(
      (event) => event.kind === "turn-started" && event.detail.reason === "repair-checks",
    ).length;
    const pushes = events.filter(
      (event) => event.kind === "action-finished" && event.detail.step === "repair-pushed",
    );

    // The runtime starts no action while a turn runs, so a repair turn that
    // has no push recorded yet has ended: send its fix before watching again.
    if (repairsUsed > pushes.length) {
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
        mission.id,
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
    // GitHub can take a moment to move the pull request to the pushed repair;
    // checks read before then belong to the head that failed.
    const expectedHead = typeof latestPush?.detail.headSha === "string" ? latestPush.detail.headSha : null;
    if (
      pr?.state === "OPEN" &&
      expectedHead &&
      pr.headRefOid &&
      pr.headRefOid !== expectedHead &&
      at.getTime() - watchStartedAt.getTime() < PUSHED_HEAD_WAIT_MS
    ) {
      return { status: "in-progress" };
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
        mission.id,
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
    aggregate: MissionAggregate,
    action: StaveAction,
    actionKey: string,
    firstCall: boolean,
  ): Promise<ActionOutcome> {
    switch (action.type) {
      case "open-draft-pr":
        return openDraftPr(cwd, aggregate);
      case "watch-checks":
        return watchChecks({ cwd, aggregate, action, actionKey });
      case "mark-pr-ready":
        return markPrReady(cwd);
      case "run-script":
        return runWorkspaceScript({ aggregate, scriptId: action.scriptId, actionKey, firstCall });
    }
  }

  return async function performAction(args: {
    aggregate: MissionAggregate;
  }): Promise<ActionOutcome> {
    const { aggregate } = args;
    const { mission } = aggregate;
    const stage = playbookStageAt(mission, mission.currentStageIndex);
    if (stage.kind !== "action") return failed("This stage is not a Stave action.");
    const record = currentStageRecord(aggregate);
    const actionKey = buildMissionActionKey({
      missionId: mission.id,
      stageId: record.stageId,
      attempt: record.attempt,
    });
    const firstCall = store.recordEvent(
      mission.id,
      {
        kind: "action-started",
        idempotencyKey: actionKey,
        detail: { stageId: record.stageId, attempt: record.attempt, type: stage.action.type },
      },
      now(),
    );
    const cwd = await deps.resolveWorkspacePath(mission.workspaceId);
    if (!cwd) return failed("The workspace folder could not be found.");
    const outcome = await run(cwd, aggregate, stage.action, actionKey, firstCall);
    if (outcome.status === "succeeded" || outcome.status === "failed" || outcome.status === "stuck") {
      store.recordEvent(
        mission.id,
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
