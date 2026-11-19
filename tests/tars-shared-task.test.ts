import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Database } from "bun:sqlite";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsExecutionObservation, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import type { TarsControlOperation } from "../src/lib/tars/conversation";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";
import { tarsActionMode } from "../src/lib/tars/autonomy";
import { isTarsPublishable } from "../src/lib/tars/publish-model";
import { admitTarsPublish } from "../electron/host-service/tars-publish";

// The user continues in a delegated task: a run the user starts there does
// not end Tars's responsibility; Tars follows it on its next pass and only
// observes it. No authority granted for Tars's own run applies to it.
const NOW = "2026-11-05T00:00:00.000Z";
const input = { completionGoal: "design" as const, requestId: "one", title: "Investigate search", instruction: "Investigate why search misses results.",
  acceptanceCriteria: ["The cause is identified."], workspaceId: "source", repositoryPath: "/tmp/tars-repository",
  providerId: "codex" as const, model: null, priority: 50, maxTurns: 30 };

function fixture(state: TarsState, overrides: Partial<TarsRuntimePorts> = {}, options: { deliveries?: boolean } = {}) {
  const database = new Database(":memory:");
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  // The task's newest run: Tars's own until the user continues in the task.
  let latest = "tars-run";
  const observed: Record<string, TarsExecutionObservation> = { "tars-run": { state: "completed", detail: null }, "user-run": { state: "running", detail: null } };
  const controlled: string[] = [];
  // Every attempt to say words in the task or start a continuation there, and its run.
  const sends: string[] = [];
  const ports: TarsRuntimePorts = {
    store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null, startRun: async () => "unexpected",
    followTaskRun: (row) => latest !== row.agentRunId && !row.previousRunIds?.includes(latest) ? latest : null,
    observe: async (row) => {
      // The host refuses any run but the one the responsibility names.
      if (row.agentRunId !== latest) throw new Error("observe must follow the task's newest run first");
      return observed[row.agentRunId]!;
    },
    controlRun: async (row, operation) => { controlled.push(`${operation}:${row.agentRunId}`); },
    respondTask: async (row, request) => { controlled.push(`${request.operation}:${row.agentRunId}`); },
    ...(options.deliveries ? {
      messages: conversations,
      hasUserTurn: () => false,
      deliverMessage: async (row) => { sends.push(`say:${row.agentRunId}`); return "busy" as const; },
      // The task's turn is still running, so a continuation cannot start yet.
      continueWork: async (row) => { sends.push(`continue:${row.agentRunId}`); return "busy" as const; },
    } : {}),
    ...overrides,
  };
  const runtime = createTarsRuntime(ports);
  const created = store.create(input, NOW);
  const row = store.patch(created.id, created.revision, { taskId: "task", executionWorkspaceId: "execution", agentRunId: "tars-run", state }, NOW);
  let clicks = 0;
  const act = async (current: TarsResponsibility, operation: TarsControlOperation, text?: string) =>
    (await actTars({ requestId: `click-${clicks++}`, responsibilityId: current.id, expectedRevision: current.revision, operation, source: "click",
      ...(text ? { input: { text } } : {}) }, { conversations, runtime, now: () => NOW })).record;
  return {
    database, store, row, observed, controlled, sends, act, conversations,
    userContinues: () => { latest = "user-run"; },
    tick: async () => { runtime.requestTick(); await runtime.drain(); await Promise.resolve(); },
    current: () => store.get(row.id)!,
  };
}

describe("Tars and the user share a delegated task", () => {
  for (const state of ["completed", "resultReady", "running", "waiting", "blocked"] as const) {
    test(`a run the user starts in the task is followed, not taken over (${state})`, async () => {
      const f = fixture(state);
      f.userContinues();
      await f.tick();
      expect(f.current()).toMatchObject({ state: "running", agentRunId: "user-run", previousRunIds: ["tars-run"] });
      // The record follows what actually happened in the task, through to its end.
      f.observed["user-run"] = { state: "completed", detail: null };
      await f.tick();
      expect(f.current()).toMatchObject({ state: "completed", agentRunId: "user-run" });
      f.database.close();
    });
  }
  for (const state of ["takenOver", "cancelled", "paused"] as const) {
    test(`work the user took over, cancelled or paused through Tars is not followed (${state})`, async () => {
      const f = fixture(state);
      f.userContinues();
      await f.tick();
      expect(f.current()).toMatchObject({ state, agentRunId: "tars-run" });
      f.database.close();
    });
  }
  test("a control approved for Tars's run is refused with no effect once the user's run is in the task, never applied to it", async () => {
    // Tars's run paused at its turn limit, and its card is still on screen when the user continues in the task.
    const f = fixture("waiting");
    const shown = f.store.patch(f.row.id, f.current().revision, { detail: "limit-reached", detailCode: "runPaused", detailParams: { reason: "limit-reached" } }, NOW);
    f.userContinues();
    const record = await f.act(shown, "extend");
    expect(f.controlled).toEqual([]);
    expect(record).toMatchObject({ status: "rejected", reason: "stale" });
    // The work follows the user's run; the user can decide again on that run.
    expect(f.current()).toMatchObject({ state: "running", agentRunId: "user-run" });
    f.database.close();
  });
  test("an explicit pause still works on the run the user started once the user sees it", async () => {
    const f = fixture("blocked");
    f.userContinues();
    await f.tick();
    expect((await f.act(f.current(), "pause")).status).toBe("applied");
    expect(f.controlled).toEqual(["pause:user-run"]);
    expect(f.current()).toMatchObject({ state: "paused", agentRunId: "user-run", previousRunIds: ["tars-run"] });
    f.database.close();
  });
  test("a follow-up kept for Tars's run is never recorded as delivered to the run the user started", async () => {
    const f = fixture("completed", {}, { deliveries: true });
    // The user confirms a follow-up for the completed delegation; the task's turn is busy, so it waits.
    const queued = await f.act(f.current(), "message", "Also cover the empty query.");
    expect(queued.delivery?.status).toBe("queued");
    await f.tick();
    const attempts = f.sends.length;
    expect(attempts).toBeGreaterThan(0);
    expect(f.sends.every((send) => send === "continue:tars-run")).toBe(true);
    // The busy turn was the user continuing in the task.
    f.userContinues();
    await f.tick();
    const record = f.conversations.getAction(queued.requestId)!;
    // Nothing was said to the user's run, and nothing claims it was.
    expect(f.sends).toHaveLength(attempts);
    expect(record.delivery?.status).not.toBe("delivered");
    expect(record.delivery?.agentRunId).not.toBe("user-run");
    expect(f.current()).toMatchObject({ agentRunId: "user-run" });
    f.database.close();
  });
  test("Tars never answers, publishes or controls by itself on the run the user started", async () => {
    const f = fixture("waiting");
    f.userContinues();
    f.observed["user-run"] = { state: "waiting", detail: "Which index?", stageAsksUser: true, stageWait: { kind: "question", blockKind: "input" },
      pendingRequests: [{ ref: "q1", kind: "question", workspaceId: "execution", taskId: "task", requestId: "r1", messageId: "m1", toolName: "AskUserQuestion",
        summary: "Which index?", questions: [{ key: "index", question: "Which index?", options: [] }] }] };
    await f.tick();
    const row = f.current();
    expect(row).toMatchObject({ state: "waiting", agentRunId: "user-run" });
    // An ordinary question in the user's run is not Tars's to answer, at any level or by any saved rule.
    for (const level of ["balanced", "handsOff"] as const)
      for (const origin of ["automatic", "user"] as const) {
        expect(tarsActionMode("answer", level, origin, { ownedQuestion: true, responsibility: row })).toBe("confirm");
        for (const key of ["resume", "message", "retryStage", "requestChanges", "extend", "deny"] as const)
          expect(tarsActionMode(key, level, origin, { responsibility: row, allowRules: [{ key, repositoryPath: null }],
            extend: { admittedMaxTurns: 30, currentMaxTurns: 30 } })).toBe("confirm");
      }
    // The user's own explicit stop still applies at once.
    expect(tarsActionMode("pause", "balanced", "user", { responsibility: row })).toBe("auto");
    expect(tarsActionMode("takeover", "balanced", "user", { responsibility: row })).toBe("auto");
    f.database.close();
  });
  test("work the user finished in its task offers no publication by Tars", async () => {
    const f = fixture("completed");
    f.userContinues();
    f.observed["user-run"] = { state: "completed", detail: "You finished this work in its task. Tars did not verify it.", detailCode: "finishedByUser" };
    await f.tick();
    await f.tick();
    const row = f.current();
    expect(row).toMatchObject({ state: "completed", agentRunId: "user-run", detailCode: "finishedByUser" });
    expect(isTarsPublishable(row)).toBe(false);
    expect(() => admitTarsPublish(row, { expectedRevision: row.revision })).toThrow("Tars does not publish it");
    f.database.close();
  });
  test("an unfinished publication of Tars's result is not replaced by a newer run", async () => {
    const f = fixture("resultReady");
    const row = f.store.patch(f.row.id, f.current().revision, { publication: { state: "committed", failedStep: null, commit: "abcdef1",
      branch: "tars/search", base: "main", commitMessage: "fix: search", title: "Fix search", url: null, number: null, error: null, reason: null, updatedAt: NOW, agentRunId: "tars-run" } }, NOW);
    f.userContinues();
    await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "resultReady", agentRunId: "tars-run" });
    f.database.close();
  });
});

/**
 * The actual host and runtime over real Tars, run and assignment stores, with
 * the task services faked: the user continues a completed delegation in its
 * task, and another workspace has a run under the same task id. `verified`
 * gives the user's run a result Stave verified (unchanged work); `pullRequest`
 * is what GitHub says of the pull request the user's run reports.
 */
function hostScenario(options: { goal: "design" | "pullRequest" | "merge"; verified?: boolean; pullRequest?: Record<string, unknown> | null;
  /** The execution workspace's origin remote; null when it cannot be read. */
  origin?: string | null;
  /** Whether the pull request's head commit contains the work branch's commit. */
  contains?: boolean;
  /** \`gh\` or \`git\` fails (a timeout reads the same): which read throws. */
  fail?: "pullRequest" | "origin" | "contains";
  /** Several pull requests the report links, each with what GitHub says of it; replaces \`pullRequest\`. */
  pullRequests?: Record<string, unknown>[];
  /** What GitHub says of the same pull request on later looks, with the clock moved by \`afterMs\` first. */
  later?: { pullRequest: Record<string, unknown>; afterMs: number }[] }) {
  const source = `
    import { mock } from "bun:test";
    import { Database } from "bun:sqlite";
    import { TarsStore } from "./electron/persistence/tars-store";
    import { TarsConversationStore } from "./electron/persistence/tars-conversation-store";
    import { AgentRunStore } from "./electron/persistence/agent-run-store";
    import { AgentAssignmentStore } from "./electron/persistence/agent-assignment-store";
    import { createAssignRuntime } from "./electron/host-service/supervision/assign-runtime";
    import { createAgentRun, createStageRecord } from "./src/lib/agent-runs/domain";
    import { BUILTIN_AGENTS } from "./src/lib/agents/starters";
    import { FIX_REVIEW_STAGE_ID, REVIEW_STAGE_ID } from "./src/lib/agents/review-before-done";
    import { tarsWorkflow } from "./electron/host-service/tars-execution";
    import { tarsCanAutoPublish } from "./src/lib/tars/autonomy";
    const options = ${JSON.stringify(options)};
    const db = new Database(":memory:");
    const persistence = { tars: new TarsStore(db), tarsConversations: new TarsConversationStore(db),
      agentAssignments: new AgentAssignmentStore(db), agentRuns: new AgentRunStore(db) };
    const assignments = createAssignRuntime({ store: persistence.agentAssignments });
    const repositoryPath = "/tmp/tars-shared-repository";
    const now = "2026-11-11T00:00:00.000Z", later = "2026-11-11T01:00:00.000Z", end = "2026-11-11T02:00:00.000Z";
    mock.module("./electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => persistence }));
    mock.module("./electron/host-service/supervision/assign-host", () => ({ hostAgents: () => BUILTIN_AGENTS }));
    mock.module("./electron/providers/runtime", () => ({ providerRuntime: {} }));
    mock.module("./electron/host-service/local-mcp-runtime", () => ({
      listKnownRepositories: async () => [{ repositoryPath, repositoryName: "repo", defaultBranch: "main", workspaces: [
        { id: "source", path: repositoryPath, branch: "main" }, { id: "execution", path: repositoryPath + "/.stave/execution", branch: "tars/search" }] }],
      getTaskSupervisionSnapshot: async () => ({ exists: true, archived: false, repositoryPath, providerId: "codex", activeTurnId: null,
        pendingApprovalCount: 0, pendingUserInputCount: 0 }),
    }));
    const reports = {}, stages = {}, reads = [];
    const { createHostTarsRuntime } = await import("./electron/host-service/tars-host");
    const runtime = createHostTarsRuntime({ assignments, agentRuns: { get: async ({ agentRunId }) => {
      const aggregate = persistence.agentRuns.getAggregate(agentRunId);
      return { events: [], ...aggregate, stages: stages[agentRunId] ?? aggregate.stages, report: reports[agentRunId] ?? null };
    } }, readPullRequest: async (cwd, url) => { reads.push(cwd + " " + url); if (options.fail === "pullRequest") throw new Error("gh timed out"); return options.pullRequests?.find((item) => item.url === url) ?? pullRequest; },
      workBranch: { origin: async () => { if (options.fail === "origin") throw new Error("git failed"); return options.origin === undefined ? "git@github.com:example/repo.git" : options.origin; },
        contains: async (cwd, branch, commit) => { reads.push("contains " + branch + " " + commit); if (options.fail === "contains") throw new Error("git failed"); return options.contains ?? true; } } });
    let pullRequest = options.pullRequest ?? null, clock = Date.now();
    Date.now = () => clock;
    const consent = { checkIns: "when-stuck", permissionMode: "auto", authorizedEffectStageIds: [] };
    const run = (id, row, overrides, at) => {
      const change = createAgentRun({ id, input: { workspaceId: row.executionWorkspaceId, leadTaskId: row.taskId, origin: "agent",
        workflow: tarsWorkflow(row, at), assignment: row.instruction, consent, ...overrides },
        repositoryPath, fingerprint: { providerId: "codex", model: "test-model" }, now: new Date(at) });
      persistence.agentRuns.create(change, new Date(at));
      return change.agentRun;
    };
    const delegate = (requestId, taskId) => {
      const created = persistence.tars.create({ requestId, title: "Investigate search", instruction: "Investigate why search misses results.",
        acceptanceCriteria: ["The cause is identified."], completionGoal: options.goal, workspaceId: "source", repositoryPath, providerId: "codex" }, now);
      const row = persistence.tars.patch(created.id, created.revision, { taskId, executionWorkspaceId: "execution", state: "completed",
        agentRunId: "tars-run-" + requestId }, now);
      assignments.recordTaskAgent({ requestId: "tars-" + row.id, taskId, workspaceId: "execution", repositoryPath,
        agent: BUILTIN_AGENTS.find(agent => agent.id === "supervisor"), providerId: "codex", model: null, assignment: row.instruction });
      const own = run(row.agentRunId, row, {}, now);
      persistence.agentRuns.apply({ agentRun: { ...own, state: "completed" }, upserts: [], events: [] }, new Date(now));
      return row;
    };
    const shared = delegate("shared", "shared-task");
    const elsewhere = delegate("elsewhere", "elsewhere-task");
    // The user continues in the delegated task with their own words and permission.
    run("user-run", shared, { workflow: { ...tarsWorkflow(shared, later), id: "user-workflow" },
      assignment: "Implement it and open the PR.", consent: { ...consent, permissionMode: "manual" } }, later);
    // Another worktree's task with the same id is never this work.
    run("other-workspace-run", { ...elsewhere, executionWorkspaceId: "other-workspace" }, { workflow: { ...tarsWorkflow(elsewhere, later), id: "user-workflow" } }, later);
    const tick = async () => { runtime.requestTick(); await runtime.drain(); await Promise.resolve(); };
    const steps = {};
    await tick();
    steps.following = persistence.tars.get(shared.id);
    steps.elsewhere = persistence.tars.get(elsewhere.id);
    // The user's run completes with its own criteria and the pull request it reports.
    persistence.agentRuns.apply({ agentRun: { ...persistence.agentRuns.getAgentRun("user-run"), state: "completed", currentStageIndex: 2 }, upserts: [], events: [] }, new Date(end));
    reports["user-run"] = { outcome: "completed", endedAt: end, acceptanceCriteria: [{ text: "The PR is open.", status: "met" }],
      links: (options.pullRequests ?? [{ url: "https://github.com/example/repo/pull/1002" }]).map((item) => ({ label: "PR", url: item.url, source: "agent" })), leftBehind: [], evidence: [] };
    if (options.verified) {
      // Stave read the workspace after the report and found nothing changed since the stage began.
      const revision = { status: "known", revision: "r1" };
      const record = (stageId, patch) => ({ ...createStageRecord({ agentRunId: "user-run", stageId, attempt: 1 }), status: "completed", startedAt: later, endedAt: end, ...patch });
      stages["user-run"] = [record("work", { startHeadSha: "a".repeat(40),
        report: { outcome: "complete", summary: "Done.", decisions: [], evidence: [], artifacts: [], reportedAt: end, turnId: "turn", workspaceRevision: revision },
        facts: { currentTurnId: "turn", workspaceRevision: revision, diff: null, commands: [], toolCalls: [], action: null, changedPaths: [] } }),
        record(REVIEW_STAGE_ID, { status: "skipped", startedAt: null }), record(FIX_REVIEW_STAGE_ID, { status: "skipped", startedAt: null })];
    }
    await tick();
    steps.ended = persistence.tars.get(shared.id);
    steps.later = [];
    for (const look of options.later ?? []) {
      pullRequest = look.pullRequest; clock += look.afterMs;
      await tick();
      steps.later.push(persistence.tars.get(shared.id));
    }
    steps.autoPublish = tarsCanAutoPublish(steps.ended);
    steps.userConsent = persistence.agentRuns.getAgentRun("user-run").consent.permissionMode;
    steps.reads = reads;
    runtime.stop(); db.close();
    console.log(JSON.stringify(steps));
  `;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return JSON.parse(result.stdout.toString());
}

/** What GitHub says of the pull request from the work's branch in its own repository, changed by \`overrides\`. */
function workPullRequest(overrides: Record<string, unknown> = {}) {
  return { number: 1002, url: "https://github.com/example/repo/pull/1002", state: "OPEN", baseRefName: "main", headRefName: "tars/search",
    headRefOid: "c".repeat(40), isCrossRepository: false, headRepository: { name: "repo" }, headRepositoryOwner: { login: "example" }, ...overrides };
}

describe("the host observes the user's run in the delegated task", () => {
  test("it follows that run, keeps its permission and never a run in another workspace", () => {
    const steps = hostScenario({ goal: "design" });
    expect(steps.following).toMatchObject({ state: "running", agentRunId: "user-run", previousRunIds: ["tars-run-shared"] });
    // Denied: a run under the same task id in another workspace is not followed, and the work is not taken over either.
    expect(steps.elsewhere).toMatchObject({ state: "completed", agentRunId: "tars-run-elsewhere" });
    expect(steps.userConsent).toBe("manual");
  });
  test("the user's verified run never completes the delegation as Tars's verified result", () => {
    const steps = hostScenario({ goal: "design", verified: true });
    // Recorded as finished by the user, without Tars's verification.
    expect(steps.ended).toMatchObject({ state: "completed", detailCode: "finishedByUser", agentRunId: "user-run", resultVerifiedRunId: null });
    expect(steps.ended.completionConfirmedAt).toBeUndefined();
  });
  test("a pull request goal is not published for the user's run: without the requested pull request it stays open", () => {
    for (const pullRequest of [null, workPullRequest({ baseRefName: "release" }), workPullRequest({ headRefName: "someone-else" })]) {
      const steps = hostScenario({ goal: "pullRequest", pullRequest });
      expect(steps.ended).toMatchObject({ state: "blocked", detailCode: "userRunEnded", agentRunId: "user-run", resultUnverifiedRunId: null, resultVerifiedRunId: null });
      expect(steps.autoPublish).toBe(false);
    }
  });
  test("the pull request the user's run opened to the requested base from the work's branch finishes the work, by the user", () => {
    // The remote may name the repository in another case, over ssh or https.
    for (const origin of ["git@github.com:example/repo.git", "https://github.com/Example/Repo", "ssh://git@github.com/example/repo.git/",
      "ssh://git@GitHub.com:22/example/repo", "https://token@github.com:443/example/repo.git"]) {
      const steps = hostScenario({ goal: "pullRequest", pullRequest: workPullRequest(), origin });
      expect(steps.ended).toMatchObject({ state: "completed", detailCode: "finishedByUser", detailParams: { pullRequest: 1002 }, resultVerifiedRunId: null });
      expect(steps.autoPublish).toBe(false);
      expect(steps.reads).toEqual(["/tmp/tars-shared-repository/.stave/execution https://github.com/example/repo/pull/1002", "contains tars/search " + "c".repeat(40)]);
    }
  });
  test("a pull request with the same branch names elsewhere never finishes the work", () => {
    const denied: Parameters<typeof hostScenario>[0][] = [
      // A fork's branch of the same name into this repository's base.
      { goal: "pullRequest", pullRequest: workPullRequest({ isCrossRepository: true, headRepositoryOwner: { login: "someone" } }) },
      // A cross-repository head that names this owner is still not this repository's branch.
      { goal: "pullRequest", pullRequest: workPullRequest({ isCrossRepository: true }) },
      { goal: "pullRequest", pullRequest: workPullRequest({ headRepository: null }) },
      // An unrelated repository the user's report links to, with the same branch names.
      { goal: "pullRequest", pullRequest: workPullRequest({ url: "https://github.com/other/repo/pull/1002",
        headRepositoryOwner: { login: "other" } }) },
      { goal: "pullRequest", pullRequest: workPullRequest(), origin: "git@github.com:example/repo-fork.git" },
      // The same owner and name on another host (a GitHub Enterprise origin, a github.com pull request) is another repository.
      { goal: "pullRequest", pullRequest: workPullRequest(), origin: "git@git.company.com:example/repo.git" },
      { goal: "pullRequest", pullRequest: workPullRequest(), origin: "https://git.company.com/example/repo.git" },
      { goal: "pullRequest", pullRequest: workPullRequest({ url: "https://git.company.com/example/repo/pull/1002" }) },
      // The work's repository cannot be determined.
      { goal: "pullRequest", pullRequest: workPullRequest(), origin: null },
      { goal: "pullRequest", pullRequest: workPullRequest(), origin: "/srv/git/repo.git" },
      // The pull request does not carry the work's commits.
      { goal: "pullRequest", pullRequest: workPullRequest(), contains: false },
      { goal: "pullRequest", pullRequest: workPullRequest({ headRefOid: "" }) },
      // A failed or timed-out read never completes the work.
      { goal: "pullRequest", pullRequest: workPullRequest(), fail: "pullRequest" },
      { goal: "pullRequest", pullRequest: workPullRequest(), fail: "origin" },
      { goal: "pullRequest", pullRequest: workPullRequest(), fail: "contains" },
    ];
    for (const options of denied) {
      const steps = hostScenario(options);
      expect(steps.ended, JSON.stringify(options)).toMatchObject({ state: "blocked", detailCode: "userRunEnded", resultVerifiedRunId: null });
    }
  });
  test("a GitHub Enterprise pull request finishes the work when the origin is on the same host", () => {
    const steps = hostScenario({ goal: "pullRequest", origin: "ssh://git@git.company.com:2222/example/repo.git",
      pullRequests: [workPullRequest({ url: "https://git.company.com/example/repo/pull/1002" })] });
    expect(steps.ended).toMatchObject({ state: "completed", detailCode: "finishedByUser", detailParams: { pullRequest: 1002 } });
  });
  test("every pull request the report links is considered: a closed one never hides the valid one after it", () => {
    const closed = workPullRequest({ number: 1001, url: "https://github.com/example/repo/pull/1001", state: "CLOSED" });
    const merge = hostScenario({ goal: "merge", pullRequests: [closed, workPullRequest({ state: "OPEN", number: 1002 }),
      workPullRequest({ number: 1003, url: "https://github.com/example/repo/pull/1003", state: "MERGED" })] });
    expect(merge.ended).toMatchObject({ state: "completed", detailCode: "finishedByUser", detailParams: { pullRequest: 1003 } });
    // At most three links are read on GitHub per look.
    expect(merge.reads.filter((read: string) => read.includes("/pull/"))).toHaveLength(3);
    const open = hostScenario({ goal: "pullRequest", pullRequests: [closed, workPullRequest()] });
    expect(open.ended).toMatchObject({ state: "completed", detailCode: "finishedByUser", detailParams: { pullRequest: 1002 } });
    // Only closed ones: the work stays open.
    expect(hostScenario({ goal: "pullRequest", pullRequests: [closed] }).ended).toMatchObject({ state: "blocked", detailCode: "userRunEnded" });
  });
  test("an open pull request is read again for a merge goal, and only every few minutes", () => {
    const merged = workPullRequest({ state: "MERGED" });
    const steps = hostScenario({ goal: "merge", pullRequest: workPullRequest(), later: [{ pullRequest: merged, afterMs: 60_000 }, { pullRequest: merged, afterMs: 5 * 60_000 }] });
    expect(steps.ended).toMatchObject({ state: "blocked", detailCode: "userRunEnded" });
    // Within the recheck interval GitHub is not asked again.
    expect(steps.later[0]).toMatchObject({ state: "blocked", detailCode: "userRunEnded" });
    expect(steps.later[1]).toMatchObject({ state: "completed", detailCode: "finishedByUser", detailParams: { pullRequest: 1002 } });
    expect(steps.reads.filter((read: string) => read.includes("/pull/"))).toHaveLength(2);
  });
});

describe("the work's own repository and commits", () => {
  test("a remote names its repository over ssh or https, in any case; a local path names none", async () => {
    const { tarsRemoteRepository } = await import("../electron/host-service/tars-execution");
    for (const remote of ["git@github.com:Example/Repo.git", "ssh://git@github.com/example/repo.git", "ssh://git@github.com:22/example/repo",
      "https://GitHub.com/example/repo", "https://token@github.com/example/repo.git/", "https://github.com:443/example/repo", "https://github.com/example/repo/pull/7"])
      expect(tarsRemoteRepository(remote), remote).toEqual({ host: "github.com", owner: "example", name: "repo" });
    for (const remote of ["git@git.company.com:example/repo.git", "ssh://git@git.company.com:2222/example/repo", "https://git.company.com/example/repo/pull/7"])
      expect(tarsRemoteRepository(remote), remote).toEqual({ host: "git.company.com", owner: "example", name: "repo" });
    for (const remote of ["/srv/git/repo.git", "file:///srv/example/repo", "../repo", "https://github.com/example", "https://github.com/a/b/c", "", "https:///example/repo", "git@:example/repo", "ssh://git@/example/repo"])
      expect(tarsRemoteRepository(remote), remote).toBeNull();
  });
  test("the work branch's commit is contained only in its own or a later commit, read with argument arrays", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const { tarsWorkBranch } = await import("../electron/host-service/tars-host");
    const dir = mkdtempSync(path.join(os.tmpdir(), "tars-work-branch-"));
    const git = (...args: string[]) => Bun.spawnSync({ cmd: ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], cwd: dir }).stdout.toString().trim();
    try {
      git("init", "-q", "-b", "main");
      git("remote", "add", "origin", "git@github.com:example/repo.git");
      git("commit", "-q", "--allow-empty", "-m", "base");
      const base = git("rev-parse", "HEAD");
      git("checkout", "-q", "-b", "tars/search");
      git("commit", "-q", "--allow-empty", "-m", "work");
      const work = git("rev-parse", "HEAD");
      git("commit", "-q", "--allow-empty", "-m", "later");
      const later = git("rev-parse", "HEAD");
      git("checkout", "-q", "--detach");
      git("branch", "-f", "tars/search", work);
      expect(await tarsWorkBranch.origin(dir)).toBe("git@github.com:example/repo.git");
      expect(await tarsWorkBranch.contains(dir, "tars/search", work)).toBe(true);
      expect(await tarsWorkBranch.contains(dir, "tars/search", later)).toBe(true);
      // Denied: a head without the work's commit, one GitHub has that is not here, a missing branch or a value that is no commit.
      expect(await tarsWorkBranch.contains(dir, "tars/search", base)).toBe(false);
      expect(await tarsWorkBranch.contains(dir, "tars/search", "d".repeat(40))).toBe(false);
      expect(await tarsWorkBranch.contains(dir, "missing", work)).toBe(false);
      expect(await tarsWorkBranch.contains(dir, "tars/search", "--all")).toBe(false);
      git("remote", "remove", "origin");
      expect(await tarsWorkBranch.origin(dir)).toBeNull();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
