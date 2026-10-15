import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRunLineView } from "../src/components/agent-runs/AgentRunLine";
import { formatAgentRunReportMarkdown } from "../src/lib/agent-runs/report-markdown";
import {
  createAgentRunRuntime,
  invokeAgentRunRuntime,
  type AgentRunRuntimeDependencies,
  type AgentRunTurnRow,
} from "../electron/host-service/supervision/agent-run-runtime";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import type { AgentRunStageGrant } from "../electron/providers/agent-run-grants";
import { currentStageRecord, EMPTY_STAGE_FACTS, type AgentRunStartInput } from "../src/lib/agent-runs/domain";
import { describeAgentRunStatus } from "../src/lib/agent-runs/agent-run-status";
import { buildAgentRunTurnDividers, describeAgentRunStatusLine } from "../src/lib/agent-runs/agent-run-view";
import { describeAgentRunNotification } from "../src/lib/agent-runs/notifications";
import { agentRunWorkQueueLane } from "../src/lib/agent-runs/lanes";
import { appendConsumedKeys, resolveEventWaitRequest, type AgentRunEventWait } from "../src/lib/agent-runs/event-wait";
import { observeEventWait } from "../src/lib/agent-runs/event-wait-observe";
import type { PullRequestWatchRead, PullRequestWatchSnapshot } from "../src/lib/supervision/pull-request-watch";
import { createWakeUp, decideWakeUpAction, type TaskCompletionSignal } from "../src/lib/supervision/wake-up-policy";
import { WorkflowSchema, type WorkflowStage } from "../src/lib/workflows/schema";

const START = "2026-09-26T10:00:00.000Z";
const MINUTE = 60_000;

const WORK: WorkflowStage = {
  id: "work",
  title: "Work",
  kind: "ai",
  instruction: "Ship the change.",
  doneWhen: "The change is merged.",
};

function startInput(overrides: Partial<AgentRunStartInput> = {}): AgentRunStartInput {
  return {
    workspaceId: "ws-1",
    leadTaskId: "task-1",
    workflow: WorkflowSchema.parse({
      version: 1,
      id: "workflow_wait",
      name: "Shipper",
      purpose: "Ship the change.",
      checkIns: "when-stuck",
      team: "solo",
      stages: [WORK],
      createdAt: START,
      updatedAt: START,
    }),
    assignment: "Open the PR and get its checks green.",
    consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: [] },
    ...overrides,
  };
}

function pullRequest(patch: Partial<PullRequestWatchSnapshot> = {}): PullRequestWatchSnapshot {
  return {
    number: 7,
    url: "https://github.com/acme/app/pull/7",
    title: "feat: export",
    state: "OPEN",
    headRefOid: "abc1234aaaa",
    baseRefName: "main",
    conflicting: false,
    failingChecks: [],
    checksPending: true,
    reviewComments: [],
    ...patch,
  };
}

function createHarness(options: { store?: AgentRunStore; turns?: AgentRunTurnRow[]; turnPrefix?: string; extra?: Partial<AgentRunRuntimeDependencies> } = {}) {
  const store = options.store ?? new AgentRunStore(new Database(":memory:"));
  // Turns per task; `turns` is task-1's, where most tests run.
  const turns: AgentRunTurnRow[] = options.turns ?? [];
  const turnsByTask = new Map<string, AgentRunTurnRow[]>([["task-1", turns]]);
  const turnsOf = (taskId: string) => turnsByTask.get(taskId) ?? turnsByTask.set(taskId, []).get(taskId)!;
  const findTurn = (id: string) => [...turnsByTask.values()].flat().find((row) => row.id === id);
  const turnPrefix = options.turnPrefix ?? "turn";
  const grants = new Map<string, AgentRunStageGrant>();
  const runCalls: Array<Parameters<AgentRunRuntimeDependencies["runSupervisedTurn"]>[0]> = [];
  const prReads: Array<Parameters<NonNullable<AgentRunRuntimeDependencies["readPullRequestWatch"]>>[0]> = [];
  let clock = new Date(START);
  let snapshot: TaskSupervisionSnapshot = {
    workspaceId: "ws-1", taskId: "task-1", repositoryPath: "/tmp/repo", exists: true, archived: false,
    providerId: "claude-code", model: "sonnet", activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0,
  };
  let prRead: PullRequestWatchRead = { ok: true, pullRequest: pullRequest() };
  let completions: TaskCompletionSignal[] = [];
  let counter = 0;
  const advance = (ms = 1_000) => {
    clock = new Date(clock.getTime() + ms);
  };
  const runtime = createAgentRunRuntime({
    store,
    getTaskSupervisionSnapshot: async ({ taskId }) => ({ ...snapshot, taskId }),
    listRecentTurns: ({ taskId }) => turnsOf(taskId).slice(0, 20),
    runSupervisedTurn: async (args) => {
      runCalls.push(args);
      counter += 1;
      const turnId = `${turnPrefix}-${counter}`;
      advance();
      turnsOf(args.taskId).unshift({ id: turnId, createdAt: clock.toISOString(), completedAt: null });
      if (args.agentRunStage) grants.set(`key-${turnId}`, { ...args.agentRunStage, turnId, taskId: args.taskId });
      return { turnId };
    },
    completeInterruptedTurn: (turnId) => {
      const row = findTurn(turnId);
      if (!row || row.completedAt) return false;
      row.completedAt = clock.toISOString();
      return true;
    },
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveAgentRunGrant: (key) => grants.get(key) ?? null,
    resolveWorkspacePath: async () => "/tmp/repo-ws",
    readHeadSha: async () => "abc1234",
    collectStageFacts: async () => EMPTY_STAGE_FACTS,
    readPullRequestWatch: async (args) => {
      prReads.push(args);
      return prRead;
    },
    listCompletedDelegatedRuns: () => completions,
    now: () => clock,
    setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
    clearInterval: () => {},
    ...options.extra,
  });
  return {
    store, turns, grants, runtime, runCalls, prReads,
    advance,
    now: () => clock,
    setPullRequest: (read: PullRequestWatchRead) => { prRead = read; },
    setCompletions: (next: TaskCompletionSignal[]) => { completions = next; },
    setSnapshot: (patch: Partial<TaskSupervisionSnapshot>) => { snapshot = { ...snapshot, ...patch }; },
    endTurn: (id: string) => {
      advance();
      findTurn(id)!.completedAt = clock.toISOString();
      grants.delete(`key-${id}`);
    },
    userTurn: (id: string) => {
      advance();
      turns.unshift({ id, createdAt: clock.toISOString(), completedAt: null });
    },
    /** One tick, then the pull request reads it started and the ticks they asked for. */
    tick: async () => {
      await runtime.requestTick();
      await runtime.whenIdle();
    },
    aggregate: (id: string) => store.getAggregate(id)!,
    detail: (id: string) => runtime.get({ agentRunId: id }),
    eventKinds: (id: string) => store.listRecentEvents(id, 500).map((event) => event.kind),
  };
}

type Harness = ReturnType<typeof createHarness>;

/** Starts a run, asks to wait from its first turn, and ends that turn. */
async function waitingRun(harness: Harness, request: Record<string, unknown>) {
  const detail = await harness.runtime.startAgentRun(startInput());
  await harness.tick();
  expect(harness.runCalls).toHaveLength(1);
  const receipt = await harness.runtime.waitForEvent({ agentRunKey: "key-turn-1", request });
  harness.endTurn("turn-1");
  await harness.tick();
  return { id: detail.agentRun.id, receipt };
}

function inHours(harness: Harness, hours: number) {
  return new Date(harness.now().getTime() + hours * 60 * MINUTE).toISOString();
}

describe("event waits: request rules and reads (pure)", () => {
  const now = new Date(START);
  const base = { id: "w1", now, stageId: "work", attempt: 1, turnId: "t1", since: now };

  test("expiry defaults to 24 hours, is capped at 7 days, and a bad request is refused", () => {
    const checks = resolveEventWaitRequest({ ...base, input: { kind: "pull_request_checks" } });
    expect(checks.ok && Date.parse(checks.wait.expiresAt) - now.getTime()).toBe(24 * 60 * MINUTE);
    expect(checks.ok && checks.wait.maxWakes).toBe(5);
    const later = resolveEventWaitRequest({ ...base, input: { kind: "time", at: new Date(now.getTime() + 30 * 60 * MINUTE).toISOString() } });
    expect(later.ok && Date.parse(later.wait.expiresAt) - now.getTime()).toBe(31 * 60 * MINUTE);
    for (const input of [
      { kind: "pull_request_checks" as const, expiresAt: new Date(now.getTime() + 8 * 24 * 60 * MINUTE).toISOString() },
      { kind: "time" as const, at: new Date(now.getTime() - MINUTE).toISOString() },
      { kind: "time" as const },
      { kind: "pull_request_review" as const, target: "feature-branch" },
      { kind: "delegated_completion" as const, at: new Date(now.getTime() + MINUTE).toISOString() },
    ]) {
      expect(resolveEventWaitRequest({ ...base, input }).ok).toBe(false);
    }
    // An offset time is stored as UTC.
    const offset = resolveEventWaitRequest({ ...base, input: { kind: "time", at: "2026-09-26T21:00:00+09:00" } });
    expect(offset.ok && offset.wait.at).toBe("2026-09-26T12:00:00.000Z");
  });

  test("one pull request however it is named: a replacement keeps what it delivered and learned", () => {
    const watch = {
      pullRequest: { number: 7, url: "https://github.com/acme/app/pull/7", title: "feat: export" },
      lastCheckedAt: START, lastSeen: null, consecutiveReadFailures: 0, lastReadError: null, pendingSince: null,
    };
    const later = { ...base, now: new Date(Date.parse(START) + 30 * MINUTE), since: new Date(Date.parse(START) + 30 * MINUTE) };
    const replace = (previous: AgentRunEventWait, target?: string) => {
      const next = resolveEventWaitRequest({ ...later, id: "next", input: { kind: "pull_request_checks", ...(target ? { target } : {}) }, previous });
      if (!next.ok) throw new Error(next.message);
      return next.wait;
    };
    const first = resolveEventWaitRequest({ ...base, input: { kind: "pull_request_checks", target: "https://www.github.com/acme/app/pull/7/checks?x=1" } });
    if (!first.ok) throw new Error(first.message);
    // Stored in one spelling per pull request.
    expect(first.wait.target).toBe("https://github.com/acme/app/pull/7");
    const delivered: AgentRunEventWait = { ...first.wait, consumedKeys: ["checks_failed:abc:lint"], watch };
    expect(replace(delivered, "https://github.com/ACME/app/pull/7"))
      .toMatchObject({ consumedKeys: ["checks_failed:abc:lint"], watch, since: START });
    // A bare #7 is the workspace's repository, which a URL wait cannot vouch
    // for: it starts its own watch. Delivered keys stay; they name acme/app#7.
    for (const target of ["#7", "7"]) {
      const bare = replace(delivered, target);
      expect(bare.consumedKeys).toEqual(["checks_failed:abc:lint"]);
      expect(bare.watch).toBeUndefined();
      expect(bare.since).toBe(later.since.toISOString());
    }
    expect(replace(delivered, "#7").target).toBe("7");
    // The branch's pull request, once its watch locked onto #7, is #7 too,
    // and so is a URL naming the repository that watch read.
    const branch: AgentRunEventWait = { ...delivered, target: null };
    expect(replace(branch, "7")).toMatchObject({ watch, since: START });
    expect(replace(branch)).toMatchObject({ watch, since: START });
    expect(replace(branch, "https://github.com/acme/app/pull/7")).toMatchObject({ watch, since: START });
    const bareSeven: AgentRunEventWait = { ...delivered, target: "7" };
    expect(replace(bareSeven, "#7")).toMatchObject({ watch, since: START });
    // Another repository's URL after a wait on the workspace's #7 is another pull request.
    expect(replace(bareSeven, "https://github.com/acme/fork/pull/7").watch).toBeUndefined();
    // And the reverse: the workspace's #7 after another repository's #7.
    const fork: AgentRunEventWait = {
      ...delivered,
      target: "https://github.com/acme/fork/pull/7",
      watch: { ...watch, pullRequest: { ...watch.pullRequest, url: "https://github.com/acme/fork/pull/7" } },
    };
    expect(replace(fork, "#7").watch).toBeUndefined();
    expect(replace(fork, "#7").since).toBe(later.since.toISOString());
    // Another pull request, or #7 of another repository, starts its own watch;
    // delivered keys still never match another pull request's events, so they stay.
    for (const target of ["8", "https://github.com/acme/other/pull/7"]) {
      const other = replace(delivered, target);
      expect(other.consumedKeys).toEqual(["checks_failed:abc:lint"]);
      expect(other.watch).toBeUndefined();
      expect(other.since).toBe(later.since.toISOString());
    }
    // A different kind starts clean.
    const review = resolveEventWaitRequest({ ...later, id: "r", input: { kind: "pull_request_review", target: "7" }, previous: delivered });
    expect(review.ok && review.wait.consumedKeys).toEqual([]);
  });

  test("a delivered key names the pull request read: another pull request with the same head still wakes", () => {
    const resolve = (target?: string, previous?: AgentRunEventWait, kind: "pull_request_checks" | "pull_request_review" = "pull_request_checks") => {
      const next = resolveEventWaitRequest({ ...base, id: `w-${target ?? "branch"}`, input: { kind, ...(target ? { target } : {}) }, previous });
      if (!next.ok) throw new Error(next.message);
      return next.wait;
    };
    const read = (number: number, patch: Partial<PullRequestWatchSnapshot> = {}): PullRequestWatchRead => ({
      ok: true,
      pullRequest: pullRequest({ number, url: `https://github.com/acme/app/pull/${number}`, checksPending: false, ...patch }),
    });
    const observe = (wait: AgentRunEventWait, pullRequestRead: PullRequestWatchRead) =>
      observeEventWait({ wait, now, parentTaskId: "task-1", pullRequestRead });
    const deliver = (wait: AgentRunEventWait, pullRequestRead: PullRequestWatchRead) => {
      const observed = observe(wait, pullRequestRead);
      if (observed.outcome.kind !== "event") throw new Error("expected an event");
      return { ...observed.wait, consumedKeys: appendConsumedKeys(observed.wait.consumedKeys, observed.outcome.wake.keys) };
    };
    const passed = { checksPassed: true } as const;
    const lint = { failingChecks: [{ name: "lint", link: null }] };

    // #7's passing head and failing lint, delivered.
    let seven = deliver(resolve("7"), read(7, passed));
    expect(seven.consumedKeys).toEqual(["pr:github.com/acme/app#7|checks_passed:abc1234aaaa"]);
    seven = deliver(seven, read(7, lint));
    // The same pull request, named by URL, as #7 or as the branch's pull request
    // (resolved by this read): neither event fires again.
    for (const target of ["https://github.com/acme/app/pull/7", "#7", undefined]) {
      const again = resolve(target, seven);
      expect(observe(again, read(7, passed)).outcome).toEqual({ kind: "none" });
      expect(observe(again, read(7, lint)).outcome).toEqual({ kind: "none" });
    }
    // #8 on the same head SHA, or #7 of another repository: both events are new.
    const fork = { url: "https://github.com/acme/fork/pull/7" };
    for (const [target, number, where] of [["8", 8, {}], [undefined, 8, {}], [fork.url, 7, fork]] as const) {
      const next = resolve(target, seven);
      const pass = observe(next, read(number, { ...where, ...passed }));
      expect(pass.outcome).toMatchObject({ kind: "event", wake: { fact: { fact: "checks-passed" } } });
      const fail = observe(next, read(number, { ...where, ...lint }));
      expect(fail.outcome).toMatchObject({ kind: "event", wake: { fact: { fact: "checks-failed", count: 1 } } });
    }

    // Review keys too: an approval delivered on #7 does not silence #8's review of the same id.
    const approval = { reviews: [{ id: "PRR_1", state: "APPROVED" as const, author: "bob", submittedAt: START }] };
    const reviewed = deliver(resolve("7", undefined, "pull_request_review"), read(7, approval));
    expect(observe(resolve("#7", reviewed, "pull_request_review"), read(7, approval)).outcome).toEqual({ kind: "none" });
    expect(observe(resolve("8", reviewed, "pull_request_review"), read(8, approval)).outcome)
      .toMatchObject({ kind: "event", wake: { fact: { fact: "review-approved", pullRequestNumber: 8 } } });
  });

  test("untargeted delegated work counts only from the wait's start and keeps waiting after a wake", () => {
    const wait = resolveEventWaitRequest({ ...base, input: { kind: "delegated_completion" } });
    if (!wait.ok) throw new Error(wait.message);
    const signal = (completedAt: string, runId: string): TaskCompletionSignal => ({
      runId, stepId: `${runId}:turn`, delegatedTaskId: null, providerId: "claude-code", status: "failed", reason: null, completedAt, attempt: 1,
    });
    const before = observeEventWait({ wait: wait.wait, now, parentTaskId: "task-1", completions: [signal("2026-09-26T09:00:00.000Z", "child-task:task-1:a")] });
    expect(before.outcome).toEqual({ kind: "none" });
    const after = observeEventWait({ wait: wait.wait, now, parentTaskId: "task-1", completions: [signal("2026-09-26T10:05:00.000Z", "child-task:task-1:b")] });
    expect(after.outcome).toMatchObject({ kind: "event", wake: { final: false, fact: { fact: "delegated-finished", count: 1 } } });
  });

  test("a pull request that stays unreadable ends the wait", () => {
    const wait = resolveEventWaitRequest({ ...base, input: { kind: "pull_request_checks" } });
    if (!wait.ok) throw new Error(wait.message);
    let current = wait.wait;
    let outcome = observeEventWait({ wait: current, now, parentTaskId: "task-1", pullRequestRead: { ok: false, error: "HTTP 502" } });
    for (let index = 1; index < 8; index += 1) {
      current = outcome.wait;
      outcome = observeEventWait({ wait: current, now, parentTaskId: "task-1", pullRequestRead: { ok: false, error: "HTTP 502" } });
    }
    expect(outcome.outcome.kind).toBe("unreadable");
  });
});

describe("event waits: asking to wait", () => {
  test("only a turn holding a run grant can wait", async () => {
    const harness = createHarness();
    await harness.runtime.startAgentRun(startInput());
    await harness.tick();
    const refused = await invokeAgentRunRuntime(harness.runtime, "wait-for-event", {
      agentRunKey: "not-a-grant", request: { kind: "time", at: inHours(harness, 1) },
    });
    expect(refused).toMatchObject({ ok: false, code: "stale-identity" });
    const invalid = await invokeAgentRunRuntime(harness.runtime, "wait-for-event", {
      agentRunKey: "key-turn-1", request: { kind: "time" },
    });
    expect(invalid).toMatchObject({ ok: false, code: "refused" });
    const accepted = await invokeAgentRunRuntime(harness.runtime, "wait-for-event", {
      agentRunKey: "key-turn-1", request: { kind: "time", at: inHours(harness, 1) },
    });
    expect(accepted).toMatchObject({ ok: true, value: { waitId: expect.any(String) } });
  });

  test("a wait keeps the run running and its unreported turn is neither nudged nor stuck", async () => {
    const harness = createHarness();
    const { id, receipt } = await waitingRun(harness, { kind: "time", at: inHours(harness, 2) });
    // Default expiry: 24 hours, unless the time itself is later.
    expect(Date.parse(receipt.expiresAt) - harness.now().getTime()).toBeGreaterThan(23 * 60 * MINUTE);
    for (let index = 0; index < 3; index += 1) {
      harness.advance(10 * MINUTE);
      await harness.tick();
    }
    const aggregate = harness.aggregate(id);
    expect(aggregate.agentRun.state).toBe("running");
    expect(currentStageRecord(aggregate)).toMatchObject({ status: "running", nudged: false });
    expect(harness.runCalls).toHaveLength(1);
    expect(harness.eventKinds(id)).not.toContain("nudge");
    expect(harness.eventKinds(id)).not.toContain("stage-stuck");
    expect(aggregate.agentRun.turnCount).toBe(1);
    // Shown as running, waiting on the event.
    const status = describeAgentRunStatus(await harness.detail(id));
    expect(status).toMatchObject({ badge: "running", waiting: true, label: "Running", subtitle: "Waiting · Scheduled time" });
    expect(describeAgentRunStatusLine(await harness.detail(id)).detail).toBe(status.reason);
    expect(agentRunWorkQueueLane({ state: "running", pauseReason: null, currentStageStatus: "running", hasOpenPullRequestAwaitingReview: false })).toBe("in-progress");
  });

  test("a new wait replaces the earlier one", async () => {
    const harness = createHarness();
    const { id, receipt } = await waitingRun(harness, { kind: "time", at: inHours(harness, 2) });
    harness.advance(MINUTE);
    // The user replies; the run's next turn asks to wait for something else.
    harness.userTurn("reply-1");
    harness.endTurn("reply-1");
    await harness.tick();
    expect(harness.store.listEventsByKind(id, ["turn-started"]).at(-1)?.detail.reason).toBe("continue-after-user");
    const second = await harness.runtime.waitForEvent({ agentRunKey: "key-turn-2", request: { kind: "pull_request_checks", target: "#7" } });
    expect(second.waitId).not.toBe(receipt.waitId);
    expect(harness.aggregate(id).agentRun.eventWait).toMatchObject({ id: second.waitId, kind: "pull_request_checks", target: "7" });
    expect(harness.store.listEventsByKind(id, ["wait-registered"]).at(-1)?.detail).toMatchObject({ replacedWaitId: receipt.waitId });
  });
});

describe("event waits: what wakes the run", () => {
  test("a pull request check failure wakes the run with the failing checks, once per failure", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", target: "https://github.com/acme/app/pull/7" });
    expect(harness.prReads.at(-1)).toMatchObject({ pullRequestNumber: 7, repository: "github.com/acme/app", events: ["checks_failed"] });
    expect(harness.runCalls).toHaveLength(1); // still pending

    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ checksPending: false, failingChecks: [
      { name: "lint", link: "https://github.com/acme/app/actions/runs/1/job/2" },
      { name: "unit", link: null },
    ] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    const woken = harness.runCalls[1]!;
    expect(woken.prompt).toContain("lint: https://github.com/acme/app/actions/runs/1/job/2");
    expect(woken.prompt).toContain("- unit");
    expect(woken.prompt).toContain("Pull request #7");
    expect(woken.agentRunStage).toMatchObject({ stageId: "work", attempt: 1 });
    expect(woken.retrievedContextParts[0]?.content).toContain("The outside event this run waited for happened");
    const started = harness.store.listEventsByKind(id, ["turn-started"]).at(-1);
    expect(started?.detail.reason).toBe("resume-after-event");
    const aggregate = harness.aggregate(id);
    expect(aggregate.agentRun.turnCount).toBe(2); // the woken turn counts
    expect(aggregate.agentRun.eventWait).toMatchObject({ wakes: 1 });
    expect(harness.store.listEventsByKind(id, ["wait-woke"]).at(-1)?.detail).toMatchObject({
      wake: 1, fact: { fact: "checks-failed", count: 2, pullRequestNumber: 7 },
    });
    expect([...buildAgentRunTurnDividers(await harness.detail(id), () => "10:00").values()]).toContain("Stage 1 · Work — woke on 2 failing checks");

    // The fix turn ends without a report: back to waiting, no nudge.
    harness.endTurn("turn-2");
    await harness.tick();
    harness.advance(3 * MINUTE);
    await harness.tick(); // the same failures on the same head
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.eventKinds(id)).not.toContain("nudge");

    // A new head that fails again is a new event.
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ headRefOid: "def5678bbbb", checksPending: false,
      failingChecks: [{ name: "lint", link: null }] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(3);
    expect(harness.runCalls[2]!.prompt).toContain("(head def5678)");
  });

  test("passing checks wake the run so it can finish the stage", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks" });
    expect(harness.prReads.at(-1)).toMatchObject({ pullRequestNumber: null, repository: null });
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ checksPending: false, checksPassed: true }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("Every check on head abc1234 passed.");
    await harness.runtime.reportStage({ agentRunKey: "key-turn-2", report: { summary: "Checks are green.", evidence: [], decisions: [], artifacts: [] } });
    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.aggregate(id).agentRun.state).toBe("completed");
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
  });

  test("a merged pull request ends the wait as its event", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_review", target: "7" });
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ state: "MERGED" }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("Pull request #7 was merged");
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
  });

  test("new review comments wake the run; comments from before the wait do not", async () => {
    const harness = createHarness();
    const old = { id: "c0", author: "alice", path: "src/a.ts", line: 1, body: "Old note.", url: "https://x/c0", createdAt: "2026-09-25T00:00:00Z" };
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ reviewComments: [old] }) });
    const { id } = await waitingRun(harness, { kind: "pull_request_review" });
    expect(harness.prReads.at(-1)).toMatchObject({ events: ["review_comments"] });
    expect(harness.runCalls).toHaveLength(1);
    const fresh = { id: "c1", author: "bob", path: "src/b.ts", line: 9, body: "Please rename this.", url: "https://x/c1",
      createdAt: new Date(harness.now().getTime() + MINUTE).toISOString() };
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ reviewComments: [old, fresh] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("@bob on src/b.ts:9");
    expect(harness.runCalls[1]!.prompt).toContain("Please rename this.");
    expect(harness.runCalls[1]!.prompt).not.toContain("Old note.");
    expect(harness.store.listEventsByKind(id, ["wait-woke"]).at(-1)?.detail).toMatchObject({ fact: { fact: "review-comments", count: 1 } });
  });

  test("an approval submitted after the wait began wakes the run, even before the first read", async () => {
    const harness = createHarness();
    const at = (minutes: number) => new Date(Date.parse(START) + minutes * MINUTE).toISOString();
    // The first read already shows an approval from after the asking turn began, and one from before it.
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ reviews: [
      { id: "r0", state: "CHANGES_REQUESTED", author: "carol", submittedAt: "2026-09-25T00:00:00Z" },
      { id: "r1", state: "APPROVED", author: "alice", submittedAt: at(0.5) },
    ] }) });
    const { id } = await waitingRun(harness, { kind: "pull_request_review", target: "7" });
    expect(harness.prReads[0]).toMatchObject({ pullRequestNumber: 7, events: ["review_comments"], reviews: true });
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("@alice approved.");
    expect(harness.runCalls[1]!.prompt).not.toContain("@carol");
    expect(harness.store.listEventsByKind(id, ["wait-woke"]).at(-1)?.detail).toMatchObject({ fact: { fact: "review-approved", count: 1 } });
  });

  test("a wait that began on an approval wakes on a change request, then on the next approval", async () => {
    const harness = createHarness();
    const approvedBefore = { id: "r0", state: "APPROVED" as const, author: "alice", submittedAt: "2026-09-25T00:00:00Z" };
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ reviews: [approvedBefore] }) });
    const { id } = await waitingRun(harness, { kind: "pull_request_review" });
    expect(harness.runCalls).toHaveLength(1);

    const changes = { id: "r1", state: "CHANGES_REQUESTED" as const, author: "bob", submittedAt: new Date(harness.now().getTime() + MINUTE).toISOString() };
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ reviews: [approvedBefore, changes] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("@bob requested changes.");
    harness.endTurn("turn-2");
    await harness.tick();

    // The fix lands on a new head and bob approves it.
    const approved = { id: "r2", state: "APPROVED" as const, author: "bob", submittedAt: new Date(harness.now().getTime() + MINUTE).toISOString() };
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ headRefOid: "def5678bbbb", reviews: [approvedBefore, changes, approved] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(3);
    expect(harness.runCalls[2]!.prompt).toContain("@bob approved.");
    expect(harness.runCalls[2]!.prompt).not.toContain("requested changes");
    expect(harness.store.listEventsByKind(id, ["wait-woke"]).map((event) => (event.detail.fact as { fact: string }).fact))
      .toEqual(["review-changes-requested", "review-approved"]);
    // Nothing new: no further wake.
    harness.endTurn("turn-3");
    await harness.tick();
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(3);
  });

  test("a pull request named another way after a wake does not wake the run again on the same failure", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", target: "https://github.com/acme/app/pull/7/checks" });
    expect(harness.aggregate(id).agentRun.eventWait?.target).toBe("https://github.com/acme/app/pull/7");
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ checksPending: false, failingChecks: [{ name: "lint", link: null }] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    // The woken turn waits again, naming the pull request by number.
    await harness.runtime.waitForEvent({ agentRunKey: "key-turn-2", request: { kind: "pull_request_checks", target: "#7" } });
    harness.endTurn("turn-2");
    await harness.tick();
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.aggregate(id).agentRun.eventWait).toMatchObject({ target: "7", consumedKeys: ["pr:github.com/acme/app#7|checks_failed:abc1234aaaa:lint"] });
  });

  test("a pull request of another repository is read in that repository; #7 reads the workspace's", async () => {
    const harness = createHarness();
    await waitingRun(harness, { kind: "pull_request_checks", target: "https://github.com/Other/Lib/pull/7" });
    expect(harness.prReads.at(-1)).toMatchObject({ pullRequestNumber: 7, repository: "github.com/other/lib" });
    const local = createHarness();
    await waitingRun(local, { kind: "pull_request_review", target: "#7" });
    expect(local.prReads.at(-1)).toMatchObject({ pullRequestNumber: 7, repository: null, reviews: true });
  });

  test("a time wait whose expiry is its time still wakes at that time", async () => {
    const harness = createHarness();
    const at = inHours(harness, 1);
    const { id, receipt } = await waitingRun(harness, { kind: "time", at, expiresAt: at });
    expect(receipt.expiresAt).toBe(at);
    harness.advance(61 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("The time you waited for");
    expect(harness.eventKinds(id)).not.toContain("wait-expired");
    expect(harness.aggregate(id).agentRun.state).toBe("running");
  });

  test("a time wait at the 7-day limit gets that expiry by default and still wakes", async () => {
    const harness = createHarness();
    await harness.runtime.startAgentRun(startInput());
    await harness.tick();
    const at = new Date(harness.now().getTime() + 7 * 24 * 60 * MINUTE).toISOString();
    const receipt = await harness.runtime.waitForEvent({ agentRunKey: "key-turn-1", request: { kind: "time", at } });
    expect(receipt.expiresAt).toBe(at);
    harness.endTurn("turn-1");
    await harness.tick();
    harness.advance(7 * 24 * 60 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("The time you waited for");
    expect(harness.runCalls[1]!.prompt).not.toContain("ended without the event");
  });

  test("the time wakes the run once", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "time", at: inHours(harness, 1) });
    harness.advance(59 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
    harness.advance(2 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("The time you waited for");
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
    // Without a new wait, the next unreported turn is nudged as usual.
    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.eventKinds(id)).toContain("nudge");
  });

  test("delegated work finishing wakes the run with the child's result", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "delegated_completion", target: "review" });
    harness.advance(MINUTE);
    harness.setCompletions([{
      runId: "child-task:task-1:review", stepId: "child-task:task-1:review:turn", delegatedTaskId: "task-child-1",
      providerId: "codex", status: "completed", reason: "Found two issues.", completedAt: harness.now().toISOString(), attempt: 1,
    }]);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("- task-child-1 (codex): completed — Found two issues.");
    expect(harness.runCalls[1]!.prompt).toContain("Subagent results");
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
  });

  test("a wait the turn registered outranks a provider failure that ended the turn", async () => {
    const harness = createHarness({ extra: { readTransientFailure: (turnId) => turnId === "turn-1" ? { message: "request timed out" } : null } });
    const { id } = await waitingRun(harness, { kind: "delegated_completion", target: "review" });
    harness.advance(31_000);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
    expect(harness.aggregate(id).agentRun.eventWait?.status).toBe("waiting");
    expect(harness.eventKinds(id)).not.toContain("nudge");
  });

  test("a wait on a delegated task reads as the Agent it runs as, never as its id", async () => {
    const named = "2c21e993-5d2c-4c5b-9a55-0c6a8e1f4b7d";
    const harness = createHarness({ extra: { agentNames: () => ({ reviewer: "Reviewer" }),
      delegatedTargetAgent: ({ target }) => target === named ? "reviewer" : null } });
    const { id } = await waitingRun(harness, { kind: "delegated_completion", target: named });
    expect(harness.aggregate(id).agentRun.eventWait).not.toHaveProperty("targetLabel");
    expect(harness.store.listEventsByKind(id, ["wait-registered"]).at(-1)?.detail.targetLabel).toBe("Reviewer");
    const line = describeAgentRunStatusLine(await harness.detail(id));
    expect(JSON.stringify(line)).toContain("Waiting for Reviewer to finish");
    expect(JSON.stringify(line)).not.toContain("2c21e993");
    const unnamed = createHarness();
    const other = await waitingRun(unnamed, { kind: "delegated_completion", target: "7f0e2a11-1b2c-4d3e-8f4a-5b6c7d8e9f0a" });
    const otherLine = JSON.stringify(describeAgentRunStatusLine(await unnamed.detail(other.id)));
    expect(otherLine).toContain("the delegated task");
    expect(otherLine).not.toContain("7f0e2a11");
  });
});

/** Rejects when the promise is still pending after `ms`: what a call blocked behind a hung read looks like. */
async function settles<T>(promise: Promise<T>, ms = 1_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Starts a run that waits on a pull request, without waiting for its reads. */
async function waitingOnPullRequest(harness: Harness) {
  const detail = await harness.runtime.startAgentRun(startInput());
  await settles(harness.runtime.requestTick());
  await harness.runtime.waitForEvent({ agentRunKey: "key-turn-1", request: { kind: "pull_request_checks" } });
  harness.endTurn("turn-1");
  return detail.agentRun.id;
}

describe("event waits: pull request reads run outside the tick", () => {
  test("a read that never lands holds up neither another run nor Pause and Cancel of its own run", async () => {
    const signals: AbortSignal[] = [];
    const harness = createHarness({ extra: { readPullRequestWatch: (args) => {
      signals.push(args.signal!);
      return new Promise<never>(() => {});
    } } });
    const id = await waitingOnPullRequest(harness);
    const other = await harness.runtime.startAgentRun(startInput({ leadTaskId: "task-2" }));
    // One tick: the first run's read goes out and hangs; the other run still starts its turn.
    await settles(harness.runtime.requestTick());
    expect(signals).toHaveLength(1);
    expect(harness.runCalls.map((call) => call.taskId)).toEqual(["task-1", "task-2"]);
    // The other run waits for a time that comes while the read is still out, and wakes.
    await harness.runtime.waitForEvent({ agentRunKey: "key-turn-2", request: { kind: "time", at: new Date(harness.now().getTime() + 2 * MINUTE).toISOString() } });
    harness.endTurn("turn-2");
    harness.advance(3 * MINUTE);
    await settles(harness.runtime.requestTick());
    expect(harness.runCalls).toHaveLength(3);
    expect(harness.runCalls[2]).toMatchObject({ taskId: "task-2" });
    expect(harness.runCalls[2]!.prompt).toContain("The time you waited for");

    // Pause answers at once and aborts the read.
    await settles(harness.runtime.pause({ agentRunId: id }));
    expect(signals[0]!.aborted).toBe(true);
    expect(harness.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "paused-by-user" });
    // Resume reads again; Cancel aborts that read too.
    await settles(harness.runtime.resume({ agentRunId: id }));
    await settles(harness.runtime.requestTick());
    expect(signals).toHaveLength(2);
    await settles(harness.runtime.cancel({ agentRunId: id }));
    expect(signals[1]!.aborted).toBe(true);
    expect(harness.aggregate(id).agentRun.state).toBe("cancelled");
    expect(harness.aggregate(other.agentRun.id).agentRun.state).toBe("running");
  });

  test("a read that lands after its run paused is never applied", async () => {
    const reads: Array<(read: PullRequestWatchRead) => void> = [];
    const harness = createHarness({ extra: { readPullRequestWatch: () => new Promise((resolve) => { reads.push(resolve); }) } });
    const id = await waitingOnPullRequest(harness);
    await settles(harness.runtime.requestTick());
    expect(reads).toHaveLength(1);
    await settles(harness.runtime.pause({ agentRunId: id }));
    const failing = { ok: true as const, pullRequest: pullRequest({ checksPending: false, failingChecks: [{ name: "lint", link: null }] }) };
    reads[0]!(failing);
    await settles(harness.runtime.resume({ agentRunId: id }));
    await settles(harness.runtime.requestTick());
    // The stale failure did not wake the run or teach the wait anything; a fresh read went out.
    expect(harness.runCalls).toHaveLength(1);
    expect(harness.aggregate(id).agentRun.eventWait?.watch).toBeUndefined();
    expect(reads).toHaveLength(2);
    reads[1]!(failing);
    await settles(harness.runtime.whenIdle());
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("- lint");
  });

  test("a read that never comes back counts as a failed read after five minutes, and Stop aborts the next", async () => {
    const signals: AbortSignal[] = [];
    const harness = createHarness({ extra: { readPullRequestWatch: (args) => {
      signals.push(args.signal!);
      return new Promise<never>(() => {});
    } } });
    const id = await waitingOnPullRequest(harness);
    await settles(harness.runtime.requestTick());
    harness.advance(4 * MINUTE);
    await settles(harness.runtime.requestTick());
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(false);
    harness.advance(2 * MINUTE);
    await settles(harness.runtime.requestTick());
    expect(signals[0]!.aborted).toBe(true);
    expect(harness.aggregate(id).agentRun.eventWait?.watch).toMatchObject({
      consecutiveReadFailures: 1, lastReadError: "The pull request read did not finish within 5 minutes.",
    });
    expect(harness.aggregate(id).agentRun.state).toBe("running");
    // The watch backs off before the next read.
    harness.advance(4 * MINUTE + 1_000);
    await settles(harness.runtime.requestTick());
    expect(signals).toHaveLength(2);
    harness.runtime.stop();
    expect(signals[1]!.aborted).toBe(true);
  });
});

describe("event waits: when the event does not come", () => {
  test("expiry pauses the run as wait-expired once, with one notification", async () => {
    const harness = createHarness();
    const { id, receipt } = await waitingRun(harness, { kind: "pull_request_checks", expiresAt: inHours(harness, 1) });
    harness.advance(61 * MINUTE);
    await harness.tick();
    await harness.tick();
    const aggregate = harness.aggregate(id);
    expect(aggregate.agentRun).toMatchObject({ state: "paused", pauseReason: "wait-expired" });
    expect(aggregate.agentRun.reasonDetail).toContain("did not come");
    expect(aggregate.agentRun.eventWait).toMatchObject({ status: "expired", endReason: "expired" });
    expect(harness.eventKinds(id).filter((kind) => kind === "wait-expired")).toHaveLength(1);
    expect(harness.runCalls).toHaveLength(1);
    const context = { repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null };
    const detail = await harness.detail(id);
    const first = describeAgentRunNotification(detail, context);
    expect(first).toMatchObject({ kind: "agent_run.blocked", dedupeKey: `agent-run:${id}:paused:wait-expired:${receipt.waitId}` });
    expect(describeAgentRunNotification(await harness.detail(id), context)?.dedupeKey).toBe(first?.dedupeKey);
    expect(describeAgentRunStatus(detail)).toMatchObject({ badge: "halted", subtitle: "Wait expired", tone: "warning" });
    expect(agentRunWorkQueueLane({ state: "paused", pauseReason: "wait-expired", currentStageStatus: "running", hasOpenPullRequestAwaitingReview: false })).toBe("action-required");

    // Continue: one turn tells the agent the wait ended, then the wait is gone.
    await harness.runtime.resume({ agentRunId: id });
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("ended without the event: it expired before the event came");
    expect(harness.store.listEventsByKind(id, ["turn-started"]).at(-1)?.detail.reason).toBe("resume-after-wait-expired");
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
  });

  test("an Agent run takes a reply after the expiry as the stage's next turn", async () => {
    const harness = createHarness();
    const detail = await harness.runtime.startAgentRun(startInput({ origin: "agent" }));
    const id = detail.agentRun.id;
    await harness.tick();
    await harness.runtime.waitForEvent({ agentRunKey: "key-turn-1", request: { kind: "pull_request_checks", expiresAt: inHours(harness, 1) } });
    harness.endTurn("turn-1");
    await harness.tick();
    harness.advance(61 * MINUTE);
    await harness.tick();
    expect(harness.aggregate(id).agentRun.pauseReason).toBe("wait-expired");
    harness.userTurn("reply-1");
    const reply = harness.runtime.prepareUserTurn({ taskId: "task-1", turnId: "reply-1" });
    expect(reply?.agentRunStage).toMatchObject({ agentRunId: id, stageId: "work", attempt: 1 });
    expect(reply?.context.content).toContain("ended without the event, and the user's reply continues the run");
    expect(harness.aggregate(id).agentRun).toMatchObject({ state: "running", pauseReason: null });
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
    harness.endTurn("reply-1");
    await harness.tick();
    // The reply was the stage's turn: no extra wait-expired turn follows it.
    expect(harness.store.listEventsByKind(id, ["turn-started"]).map((event) => event.detail.reason)).not.toContain("resume-after-wait-expired");
  });

  test("after its last wake the wait pauses the run instead of waiting on", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", maxWakes: 1 });
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ checksPending: false, failingChecks: [{ name: "lint", link: null }] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    harness.endTurn("turn-2");
    await harness.tick();
    expect(harness.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "wait-expired" });
    expect(harness.aggregate(id).agentRun.reasonDetail).toContain("woke the run once");
    expect(harness.aggregate(id).agentRun.eventWait).toMatchObject({ endReason: "wake-limit" });
  });

  test("a reply after the expiry continues the run with the reply as guidance", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", expiresAt: inHours(harness, 1) });
    harness.advance(61 * MINUTE);
    await harness.tick();
    expect(harness.aggregate(id).agentRun.pauseReason).toBe("wait-expired");
    harness.userTurn("user-1");
    await harness.tick();
    harness.endTurn("user-1");
    await harness.tick();
    expect(harness.aggregate(id).agentRun.state).toBe("running");
    expect(harness.store.listEventsByKind(id, ["turn-started"]).at(-1)?.detail.reason).toBe("continue-after-user");
    expect(harness.aggregate(id).agentRun.eventWait).toBeUndefined();
  });
});

describe("event waits: surfaces and report", () => {
  test("the run line says what it waits for, and a run whose wait ran out offers Continue", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", target: "7", expiresAt: inHours(harness, 1) });
    const waiting = renderToStaticMarkup(createElement(AgentRunLineView, {
      detail: await harness.detail(id), now: harness.now().getTime(), nowPhrase: null, reducedMotion: true,
    }));
    expect(waiting).toContain("Running · Waiting · PR checks");
    expect(waiting).toContain("Waiting for the checks on PR #7 to finish.");
    harness.advance(61 * MINUTE);
    await harness.tick();
    const expired = renderToStaticMarkup(createElement(AgentRunLineView, {
      detail: await harness.detail(id), now: harness.now().getTime(), nowPhrase: null, reducedMotion: true,
      actions: { onResume: () => {} },
    }));
    expect(expired).toContain("Halted · Wait expired");
    expect(expired).toContain("Continue");
  });

  test("the report lists each wait, wake and end", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", target: "7", maxWakes: 1 });
    harness.setPullRequest({ ok: true, pullRequest: pullRequest({ checksPending: false, failingChecks: [{ name: "lint", link: null }] }) });
    harness.advance(3 * MINUTE);
    await harness.tick();
    harness.endTurn("turn-2");
    await harness.tick();
    await harness.runtime.cancel({ agentRunId: id });
    const report = (await harness.detail(id)).report!;
    expect(report.eventWaits?.map((line) => line.text)).toEqual([
      "Started waiting for PR checks on PR #7",
      "Woke on 1 failing check · wake 1 of 1",
      "Stopped waiting for PR checks: the wake limit was reached",
    ]);
    expect(formatAgentRunReportMarkdown(report)).toContain("### Event waits");
  });
});

describe("event waits: pause, restart and the task's wake-ups", () => {
  test("a paused run does not wake; resume re-arms an unexpired wait", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "time", at: inHours(harness, 1) });
    await harness.runtime.pause({ agentRunId: id });
    harness.advance(2 * 60 * MINUTE);
    await harness.tick();
    expect(harness.runCalls).toHaveLength(1);
    expect(harness.aggregate(id).agentRun).toMatchObject({ state: "paused", pauseReason: "paused-by-user" });
    await harness.runtime.resume({ agentRunId: id });
    await harness.tick();
    expect(harness.runCalls).toHaveLength(2);
    expect(harness.runCalls[1]!.prompt).toContain("The time you waited for");
  });

  test("a wait that ran out during a pause ends on resume without pausing again", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "pull_request_checks", expiresAt: inHours(harness, 1) });
    await harness.runtime.takeOver({ agentRunId: id });
    harness.advance(2 * 60 * MINUTE);
    await harness.tick();
    expect(harness.eventKinds(id)).not.toContain("wait-expired");
    await harness.runtime.resume({ agentRunId: id });
    await harness.tick();
    expect(harness.aggregate(id).agentRun.state).toBe("running");
    expect(harness.eventKinds(id).filter((kind) => kind === "wait-expired")).toHaveLength(1);
    expect(harness.store.listEventsByKind(id, ["turn-started"]).at(-1)?.detail.reason).toBe("resume-after-wait-expired");
  });

  test("a restart keeps the wait: it reloads from the store and still wakes", async () => {
    const database = new Database(":memory:");
    const harness = createHarness({ store: new AgentRunStore(database) });
    const { id, receipt } = await waitingRun(harness, { kind: "time", at: inHours(harness, 1) });
    // A fresh store over the same database parses the persisted wait.
    const reloaded = new AgentRunStore(database);
    expect(reloaded.getAggregate(id)?.agentRun.eventWait).toMatchObject({ id: receipt.waitId, kind: "time", status: "waiting" });
    const restarted = createHarness({ store: reloaded, turns: harness.turns, turnPrefix: "after" });
    restarted.advance(harness.now().getTime() - Date.parse(START) + 61 * MINUTE);
    restarted.runtime.start();
    await restarted.tick();
    expect(restarted.runCalls).toHaveLength(1);
    expect(restarted.runCalls[0]!.prompt).toContain("The time you waited for");
    restarted.runtime.stop();
  });

  test("a run saved before waits and account pools existed upgrades with its state, stages, events and turn count", async () => {
    // The tables as the previous release created them: no account_pool_json, no event_wait_json.
    const database = new Database(":memory:");
    database.exec(`
      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY, repository_path TEXT NOT NULL, workspace_id TEXT NOT NULL, lead_task_id TEXT NOT NULL,
        project_id TEXT, workflow_json TEXT NOT NULL, assignment TEXT NOT NULL, consent_json TEXT NOT NULL,
        fingerprint_json TEXT NOT NULL, state TEXT NOT NULL, pause_reason TEXT, stop_reason TEXT, reason_detail TEXT,
        current_stage_index INTEGER NOT NULL, turn_count INTEGER NOT NULL DEFAULT 0, max_turns INTEGER NOT NULL DEFAULT 30,
        expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, origin TEXT, initial_context_json TEXT,
        usage_limit_json TEXT);
      CREATE TABLE agent_run_stages (
        agent_run_id TEXT NOT NULL, stage_id TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL,
        nudged INTEGER NOT NULL DEFAULT 0, block_reason TEXT, detail TEXT, feedback TEXT, started_at TEXT, ended_at TEXT,
        start_head_sha TEXT, report_json TEXT, report_revision INTEGER NOT NULL DEFAULT 0, facts_json TEXT,
        PRIMARY KEY (agent_run_id, stage_id, attempt));
      CREATE TABLE agent_run_events (
        id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL, sequence INTEGER NOT NULL, kind TEXT NOT NULL,
        idempotency_key TEXT UNIQUE, detail_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (agent_run_id, sequence));
    `);
    const started = "2026-09-20T09:00:00.000Z";
    const workflow = startInput().workflow;
    database.prepare(`INSERT INTO agent_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "run-old", "/tmp/repo", "ws-1", "task-1", null, JSON.stringify(workflow), "Open the PR.",
      JSON.stringify(startInput().consent), JSON.stringify({ providerId: "claude-code", model: "sonnet" }), "paused",
      "paused-by-user", null, null, 0, 3, 30, null, started, "2026-09-20T09:30:00.000Z", null, null, null,
    );
    database.prepare(`INSERT INTO agent_run_stages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "run-old", "work", 1, "running", 1, null, null, null, started, null, "abc1234", null, 0, null,
    );
    const insertEvent = database.prepare(`INSERT INTO agent_run_events VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertEvent.run("e1", "run-old", 1, "agent-run-started", "run-old:started", "{}", started);
    insertEvent.run("e2", "run-old", 2, "turn-linked", null, JSON.stringify({ stageId: "work", attempt: 1, turnId: "old-1" }), started);
    insertEvent.run("e3", "run-old", 3, "nudge", null, JSON.stringify({ stageId: "work", attempt: 1 }), started);

    const store = new AgentRunStore(database);
    const columns = (database.prepare("PRAGMA table_info(agent_runs)").all() as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(["account_pool_json", "event_wait_json"]));
    const aggregate = store.getAggregate("run-old")!;
    expect(aggregate.agentRun).toMatchObject({ state: "paused", pauseReason: "paused-by-user", turnCount: 3, maxTurns: 30, currentStageIndex: 0 });
    expect(aggregate.agentRun.eventWait).toBeUndefined();
    expect(aggregate.agentRun.accountPool).toBeUndefined();
    expect(currentStageRecord(aggregate)).toMatchObject({ stageId: "work", attempt: 1, status: "running", nudged: true, startHeadSha: "abc1234" });
    expect(store.listRecentEvents("run-old", 10).map((event) => event.kind)).toEqual(["agent-run-started", "turn-linked", "nudge"]);

    // The upgraded row takes writes: Resume through the runtime keeps the count and adds no wait.
    const harness = createHarness({ store });
    const resumed = await harness.runtime.resume({ agentRunId: "run-old" });
    expect(resumed.agentRun).toMatchObject({ state: "running", turnCount: 3 });
    const reloaded = new AgentRunStore(database).getAggregate("run-old")!;
    expect(reloaded.agentRun).toMatchObject({ state: "running", turnCount: 3 });
    expect(reloaded.agentRun.eventWait).toBeUndefined();
    expect(reloaded.agentRun.accountPool).toBeUndefined();
    expect(new AgentRunStore(database).listRecentEvents("run-old", 10).map((event) => event.kind)).toContain("resumed");
  });

  test("the task's own wake-ups stay paused while the run waits", async () => {
    const harness = createHarness();
    const { id } = await waitingRun(harness, { kind: "time", at: inHours(harness, 1) });
    const active = harness.runtime.getActiveAgentRunForTask("task-1");
    expect(active).toMatchObject({ id, state: "running", eventWait: { kind: "time" } });
    const wakeUp = createWakeUp({
      id: "wake-1",
      input: { workspaceId: "ws-1", taskId: "task-1", prompt: "Re-check CI.", trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } }, maxOccurrences: null, expiresAt: null },
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: new Date(START),
    });
    const decision = decideWakeUpAction({
      wakeUp,
      observation: {
        workspaceAvailable: true, taskExists: true, taskArchived: false, hasActiveTurn: false,
        pendingApprovalCount: 0, pendingUserInputCount: 0, fingerprint: { providerId: "claude-code", model: "sonnet" },
        identity: { ok: true }, completionObservability: "stave_owned", completions: [], agentRunActive: Boolean(active),
      },
      now: new Date(Date.parse(START) + 2 * 60 * MINUTE),
    });
    expect(decision).toMatchObject({ action: "pause", reason: "agent-run-active" });
  });
});
