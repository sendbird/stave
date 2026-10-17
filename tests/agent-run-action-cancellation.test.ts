import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { createAgentRunRuntime } from "../electron/host-service/supervision/agent-run-runtime";
import {
  createAgentRunActionExecutor,
  type AgentRunScmPort,
  type AgentRunScriptRun,
} from "../electron/host-service/supervision/agent-run-actions";
import { currentStageRecord, EMPTY_STAGE_FACTS } from "../src/lib/agent-runs/domain";
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

function harness(options: {
  action: StaveAction;
  scm?: AgentRunScmPort;
  runScript?: Parameters<typeof createAgentRunActionExecutor>[0]["runScript"];
  agent?: AgentConfig;
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
    getTaskSupervisionSnapshot: async () => ({
      workspaceId: "workspace", taskId: "task", repositoryPath: "/tmp/repository",
      exists: true, archived: false, providerId: "codex", model: "gpt-6-sol",
      activeTurnId: null, pendingApprovalCount: 0, pendingUserInputCount: 0,
    }),
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
