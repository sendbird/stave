import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { createAgentRunRuntime } from "../electron/host-service/supervision/agent-run-runtime";
import {
  createAgentRunActionExecutor,
  type AgentRunScmPort,
  type AgentRunScriptRun,
} from "../electron/host-service/supervision/agent-run-actions";
import { createAgentRun, currentStageRecord, EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import type { AgentConfig } from "../src/lib/agents/schema";
import type { StaveAction } from "../src/lib/workflows/schema";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

const START = "2026-10-17T00:00:00.000Z";
const CONTROLS = ["pause", "takeOver", "cancel", "composerTakeOver"] as const;
function interrupt(h: ReturnType<typeof harness>, control: typeof CONTROLS[number], id: string) {
  return control === "composerTakeOver" ? h.runtime.noteUserTurn({ agentRunId: id, intent: "take-over" }) : h.runtime[control]({ agentRunId: id });
}

function publishingScm(writes: string[], beforeRead = async () => {}): AgentRunScmPort {
  return {
    currentBranch: async () => { await beforeRead(); return "feature/change"; },
    readBaseBranch: async () => "main", readPullRequest: async () => ({ ok: true, value: null }), hasUncommittedChanges: async () => true,
    commitAll: async () => { writes.push("commit"); return { ok: true, value: true }; }, hasUnpushedCommits: async () => true,
    push: async () => { writes.push("push"); return { ok: true, value: true }; }, readCommitLog: async () => ({ baseBranch: "main", log: "abc1234 fix: change" }),
    createDraftPullRequest: async () => { writes.push("create-pr"); return { ok: true, value: { url: "https://github.com/acme/app/pull/1", created: true } }; },
    headSha: async () => "abc1234", markReady: async () => ({ ok: true, value: true }), readChecks: async () => ({ ok: true, value: [] }),
  };
}

function harness(options: {
  action: StaveAction;
  scm?: AgentRunScmPort;
  runScript?: Parameters<typeof createAgentRunActionExecutor>[0]["runScript"];
  agent?: AgentConfig;
  beforeSnapshot?: () => Promise<void>;
}) {
  const store = new AgentRunStore(new Database(":memory:"));
  const performAction = createAgentRunActionExecutor({
    store,
    scm: options.scm ?? {} as AgentRunScmPort,
    resolveWorkspacePath: async () => "/tmp/workspace",
    runScript: options.runScript,
  });
  let actionSignal: AbortSignal | undefined;
  const runtime = createAgentRunRuntime({
    store,
    now: () => new Date(START),
    ...(options.agent ? { taskAgent: () => options.agent!, taskRunsAsAgent: () => true } : {}),
    getTaskSupervisionSnapshot: async ({ workspaceId, taskId }) => { await options.beforeSnapshot?.(); return {
      workspaceId, taskId, repositoryPath: "/tmp/repository",
      exists: true, archived: false, providerId: "codex", model: "gpt-6-sol",
      activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0,
    }; },
    listRecentTurns: () => [],
    countActiveDelegatedTasks: () => 0,
    isReportingAvailable: async () => true,
    resolveAgentRunGrant: () => null,
    resolveWorkspacePath: async () => "/tmp/workspace",
    readHeadSha: async () => "abc1234",
    collectStageFacts: async () => EMPTY_STAGE_FACTS,
    completeInterruptedTurn: () => false,
    runSupervisedTurn: async () => ({ turnId: "unused" }),
    performAction: async (args) => { actionSignal = args.signal; return performAction(args); },
  });
  return {
    runtime, store,
    signal: () => actionSignal,
    current: (id: string) => currentStageRecord(store.getAggregate(id)!),
    start: async () => (await runtime.startAgentRun({
      ...(options.agent ? { origin: "agent" } : {}),
      workspaceId: "workspace", leadTaskId: "task", assignment: "Run the configured action.",
      workflow: {
        version: 1, id: "action", name: "Action", purpose: "Run the configured action.",
        checkIns: "when-stuck", team: "solo", createdAt: START, updatedAt: START,
        stages: [{ id: "action", title: "Action", kind: "action", action: options.action }],
      },
      consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["action"] },
    })).agentRun.id,
  };
}

describe("action controls stop work already admitted by the supervisor", () => {
  for (const control of CONTROLS) {
    test(`${control} before action admission cancels the pending observation and prevents later publication`, async () => {
      const reading = deferred<void>(), finishRead = deferred<void>();
      let snapshots = 0, settled = false;
      const writes: string[] = [];
      const h = harness({ action: { type: "open-draft-pr" }, beforeSnapshot: async () => {
        if (++snapshots === 2) { reading.resolve(); await finishRead.promise; }
      }, scm: {
        currentBranch: async () => "feature/change", readBaseBranch: async () => "main", readPullRequest: async () => ({ ok: true, value: null }),
        hasUncommittedChanges: async () => true,
        commitAll: async () => { writes.push("commit"); return { ok: true, value: true }; },
        hasUnpushedCommits: async () => true,
        push: async () => { writes.push("push"); return { ok: true, value: true }; },
        readCommitLog: async () => ({ baseBranch: "main", log: "abc1234 fix: change" }),
        createDraftPullRequest: async () => { writes.push("create-pr"); return { ok: true, value: { url: "https://github.com/acme/app/pull/1", created: true } }; },
        headSha: async () => "abc1234", markReady: async () => ({ ok: true, value: true }), readChecks: async () => ({ ok: true, value: [] }),
      } });
      const id = await h.start();
      await reading.promise;
      const command = interrupt(h, control, id).then(() => { settled = true; return true; }, () => false);
      await Promise.race([command, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
      const acceptedBeforeReadReturned = settled;
      finishRead.resolve();
      const accepted = await command;
      await h.runtime.requestTick();
      try {
        expect(acceptedBeforeReadReturned).toBe(true);
        expect(accepted).toBe(true);
        expect(writes).toEqual([]);
        expect(h.store.getAgentRun(id)?.state).toBe(control === "cancel" ? "cancelled" : "paused");
        if (control !== "cancel") {
          await h.runtime.resume({ agentRunId: id });
          await h.runtime.requestTick();
          expect(writes).toEqual(["commit", "push", "create-pr"]);
          expect(h.store.getAgentRun(id)?.state).toBe("completed");
        }
      } finally {
        if (h.store.getActiveAgentRunForTask("task")) await h.runtime.cancel({ agentRunId: id });
        h.runtime.stop();
      }
    });
  }

  test("a control for a later run in the same tick blocks its admission without cancelling the current run", async () => {
    const reading = deferred<void>(), finishRead = deferred<void>();
    let snapshots = 0;
    const writes: string[] = [];
    const h = harness({ action: { type: "open-draft-pr" }, scm: publishingScm(writes), beforeSnapshot: async () => {
      if (++snapshots === 1) { reading.resolve(); await finishRead.promise; }
    } });
    for (const id of ["first", "second"]) h.store.create(createAgentRun({ id,
      input: { workspaceId: "workspace", leadTaskId: id, assignment: "Publish.", workflow: {
        version: 1, id: "publish", name: "Publish", purpose: "Publish.", checkIns: "when-stuck", team: "solo", createdAt: START, updatedAt: START,
        stages: [{ id: "action", title: "Publish", kind: "action", action: { type: "open-draft-pr" } }],
      }, consent: { checkIns: "when-stuck", permissionMode: "guided", authorizedEffectStageIds: ["action"] } },
      repositoryPath: "/tmp/repository", fingerprint: { providerId: "codex", model: "gpt-6-sol" }, now: new Date(START),
    }), new Date(START));
    const tick = h.runtime.requestTick();
    await reading.promise;
    const paused = h.runtime.pause({ agentRunId: "second" });
    finishRead.resolve();
    await paused;
    await tick;
    await h.runtime.requestTick();
    try {
      expect(h.store.getAgentRun("first")?.state).toBe("completed");
      expect(h.store.getAgentRun("second")?.state).toBe("paused");
      expect(writes).toEqual(["commit", "push", "create-pr"]);
    } finally {
      await h.runtime.cancel({ agentRunId: "second" });
      h.runtime.stop();
    }
  });

  test("stopping before action admission discards an unresolved observation", async () => {
    const reading = deferred<void>(), finishRead = deferred<void>();
    let snapshots = 0;
    const writes: string[] = [];
    const h = harness({ action: { type: "open-draft-pr" }, scm: publishingScm(writes), beforeSnapshot: async () => {
      if (++snapshots === 2) { reading.resolve(); await finishRead.promise; }
    } });
    const id = await h.start();
    await reading.promise;
    h.runtime.stop();
    await h.runtime.whenIdle();
    finishRead.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(writes).toEqual([]);
    expect(h.store.getAgentRun(id)?.state).toBe("running");
    expect(h.current(id).status).toBe("pending");
  });

  test("releasing the Agent during an SCM read stops publication before ending its run", async () => {
    const reading = deferred<void>(), finishRead = deferred<void>();
    const writes: string[] = [];
    const h = harness({ action: { type: "open-draft-pr" }, agent: getBuiltinAgent("implementer")!, scm: publishingScm(writes, async () => {
      reading.resolve(); await finishRead.promise;
    }) });
    const id = await h.start();
    await reading.promise;
    const released = h.runtime.endAgentRunForTask({ taskId: "task" });
    const aborted = h.signal()?.aborted;
    finishRead.resolve();
    expect(await released).toBe(true);
    expect(aborted).toBe(true);
    expect(writes).toEqual([]);
    expect(h.store.getAgentRun(id)?.state).toBe("cancelled");
    h.runtime.stop();
  });

  test("an interrupted script can run again once through explicit Retry after Resume", async () => {
    const finished = deferred<AgentRunScriptRun>();
    let executions = 0;
    const h = harness({ action: { type: "run-script", scriptId: "check" }, runScript: async () => {
      executions += 1;
      return executions === 1 ? finished.promise : { ok: true, exitCode: 0 };
    } });
    const id = await h.start();
    await h.runtime.requestTick();
    await h.runtime.pause({ agentRunId: id });
    finished.resolve({ ok: true, exitCode: 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await h.runtime.resume({ agentRunId: id });
    await h.runtime.requestTick();
    expect(h.current(id).status).toBe("blocked");
    expect(executions).toBe(1);
    await h.runtime.retryStage({ agentRunId: id, stageId: "action", attempt: 1 });
    await h.runtime.requestTick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await h.runtime.requestTick();
    expect(executions).toBe(2);
    expect(h.current(id)).toMatchObject({ status: "completed", attempt: 2 });
    h.runtime.stop();
  });

  test("stopping the runtime aborts a running host script", async () => {
    const finished = deferred<AgentRunScriptRun>();
    let signal: AbortSignal | undefined;
    const h = harness({ action: { type: "run-script", scriptId: "check" }, runScript: async (args) => {
      signal = args.signal;
      return finished.promise;
    } });
    await h.start();
    await h.runtime.requestTick();
    h.runtime.stop();
    finished.resolve({ ok: true, exitCode: 0 });
    expect(signal?.aborted).toBe(true);
  });
  for (const control of CONTROLS) {
    test(`${control} aborts a running action script`, async () => {
      const finished = deferred<AgentRunScriptRun>();
      let scriptSignal: AbortSignal | undefined;
      const h = harness({ action: { type: "run-script", scriptId: "check" }, runScript: async ({ signal }) => {
        scriptSignal = signal;
        return finished.promise;
      } });
      const id = await h.start();
      await h.runtime.requestTick();
      await interrupt(h, control, id);
      const aborted = scriptSignal?.aborted;
      finished.resolve({ ok: true, exitCode: 0 });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        expect(aborted).toBe(true);
      } finally {
        if (control !== "cancel") await h.runtime.cancel({ agentRunId: id });
        h.runtime.stop();
      }
    });
  }

  for (const control of ["pause", "takeOver"] as const) {
    test(`${control} rejects late script success and Resume does not replay the script`, async () => {
      const finished = deferred<AgentRunScriptRun>();
      let executions = 0;
      const h = harness({ action: { type: "run-script", scriptId: "check" }, runScript: async () => {
        executions += 1;
        return finished.promise;
      } });
      const id = await h.start();
      await h.runtime.requestTick();
      await interrupt(h, control, id);
      finished.resolve({ ok: true, exitCode: 0 });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await h.runtime.resume({ agentRunId: id });
      await h.runtime.requestTick();
      try {
        expect(h.store.getAgentRun(id)?.state).toBe("running");
        expect(h.current(id).status).toBe("blocked");
        expect(executions).toBe(1);
        expect(h.current(id).facts?.action).toBeUndefined();
      } finally {
        if (h.store.getActiveAgentRunForTask("task")) await h.runtime.cancel({ agentRunId: id });
        h.runtime.stop();
      }
    });
  }

  for (const control of CONTROLS) {
    test(`${control} during an SCM read prevents subsequent commits and publication`, async () => {
      const reading = deferred<void>(), finishRead = deferred<void>();
      const writes: string[] = [];
      const scm: AgentRunScmPort = {
        currentBranch: async () => { reading.resolve(); await finishRead.promise; return "feature/change"; },
        readBaseBranch: async () => "main",
        readPullRequest: async () => ({ ok: true, value: null }),
        hasUncommittedChanges: async () => true,
        commitAll: async () => { writes.push("commit"); return { ok: true, value: true }; },
        hasUnpushedCommits: async () => true,
        push: async () => { writes.push("push"); return { ok: true, value: true }; },
        readCommitLog: async () => ({ baseBranch: "main", log: "abc1234 fix: change" }),
        createDraftPullRequest: async () => { writes.push("create-pr"); return { ok: true, value: { url: "https://github.com/acme/app/pull/1", created: true } }; },
        headSha: async () => "abc1234",
        markReady: async () => { writes.push("mark-ready"); return { ok: true, value: true }; },
        readChecks: async () => ({ ok: true, value: [] }),
      };
      const h = harness({ action: { type: "open-draft-pr" }, scm });
      const id = await h.start();
      await reading.promise;
      const command = interrupt(h, control, id).then(() => true, () => false);
      const aborted = h.signal()?.aborted;
      finishRead.resolve();
      const accepted = await command;
      await h.runtime.requestTick();
      try {
        expect(aborted).toBe(true);
        expect(accepted).toBe(true);
        expect(writes).toEqual([]);
        expect(h.store.getAgentRun(id)?.state).toBe(control === "cancel" ? "cancelled" : "paused");
        if (control !== "cancel") {
          await h.runtime.resume({ agentRunId: id });
          await h.runtime.requestTick();
          expect(h.current(id).status).toBe("blocked");
          expect(writes).toEqual([]);
        }
      } finally {
        if (h.store.getActiveAgentRunForTask("task")) await h.runtime.cancel({ agentRunId: id });
        h.runtime.stop();
      }
    });
  }
});

describe("a primary read-only Agent cannot use host action stages to write", () => {
  for (const action of [
    { type: "run-script", scriptId: "check" },
    { type: "open-draft-pr" },
    { type: "mark-pr-ready" },
  ] satisfies StaveAction[]) {
    test(action.type, async () => {
      const writes: string[] = [];
      const scm: AgentRunScmPort = {
        currentBranch: async () => "feature/change",
        readBaseBranch: async () => "main",
        readPullRequest: async () => ({ ok: true, value: { number: 1, url: "https://github.com/acme/app/pull/1", state: "OPEN", isDraft: true, headRefOid: "abc1234", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: "APPROVED" } }),
        hasUncommittedChanges: async () => true,
        commitAll: async () => { writes.push("commit"); return { ok: true, value: true }; },
        hasUnpushedCommits: async () => true,
        push: async () => { writes.push("push"); return { ok: true, value: true }; },
        readCommitLog: async () => ({ baseBranch: "main", log: "abc1234 fix: change" }),
        createDraftPullRequest: async () => { writes.push("create-pr"); return { ok: true, value: { url: "https://github.com/acme/app/pull/1", created: true } }; },
        headSha: async () => "abc1234",
        markReady: async () => { writes.push("mark-ready"); return { ok: true, value: true }; },
        readChecks: async () => ({ ok: true, value: [] }),
      };
      const agent: AgentConfig = { ...getBuiltinAgent("reviewer")!, workflow: [{ id: "action", title: "Action", kind: "action", action }] };
      const h = harness({ action, agent, scm, runScript: async () => { writes.push("script"); return { ok: true, exitCode: 0 }; } });
      const id = await h.start();
      await h.runtime.requestTick();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await h.runtime.requestTick();
      try {
        expect(writes).toEqual([]);
        expect(h.current(id).status).toBe("blocked");
        expect(h.store.getAgentRun(id)?.state).toBe("running");
      } finally {
        if (h.store.getActiveAgentRunForTask("task")) await h.runtime.cancel({ agentRunId: id });
        h.runtime.stop();
      }
    });
  }
});
