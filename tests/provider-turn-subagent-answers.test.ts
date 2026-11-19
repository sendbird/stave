import { afterEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { BridgeEvent, ProviderPromptAcceptance, StreamTurnArgs } from "../electron/providers/types";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { DelegatedAnswerStore } from "../electron/persistence/delegated-answer-store";
import { buildDelegatedTaskRunId, buildDelegatedTaskStepId } from "../src/lib/runs/delegated-task";
import { collectOwedDelegatedTaskAnswers } from "../src/lib/runs/delegated-task-answers";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../src/lib/runs/run-domain";

// A subagent answer counts as delivered when the provider accepts the prompt
// carrying it: for either provider, and never for a turn refused or failed
// before that point.

const PARENT = "task-1";
const actualClaudeRuntime = await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime = await import("../electron/providers/codex-app-server-runtime");

let providerTurns: StreamTurnArgs[] = [];
/** Whether the answer was still owed when the provider received the turn, and recorded once it accepted the prompt. */
let recordedAtProviderStart: boolean[] = [];
let recordedAtAcceptance: boolean[] = [];
/** A provider that fails before it accepts the prompt (no binary, closed input, refused turn/start). */
let refuseBeforeAcceptance = false;

async function streamPrimary(args: StreamTurnArgs & ProviderPromptAcceptance & { onEvent?: (event: BridgeEvent) => void; registerAbort?: (aborter: () => void) => void }) {
  providerTurns.push(args);
  recordedAtProviderStart.push(owed().length === 0);
  args.registerAbort?.(() => {});
  if (refuseBeforeAcceptance) {
    const failed: BridgeEvent[] = [{ type: "error", message: "turn/start refused", recoverable: false }, { type: "done", stop_reason: "runtime_failure" }];
    failed.forEach((event) => args.onEvent?.(event));
    return failed;
  }
  args.onPromptAccepted?.();
  args.onPromptAccepted?.();
  recordedAtAcceptance.push(owed().length === 0);
  const events: BridgeEvent[] = [{ type: "done", stop_reason: "end_turn" }];
  events.forEach((event) => args.onEvent?.(event));
  return events;
}

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  ...actualClaudeRuntime, buildClaudeEnv: () => ({}), cleanupClaudeTask: () => {},
  resolveClaudeExecutablePath: () => "/tmp/claude", streamClaudeWithSdk: streamPrimary,
}));
mock.module("../electron/providers/codex-app-server-runtime", () => ({
  ...actualCodexRuntime, cleanupCodexAppServerTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex", streamCodexWithAppServer: streamPrimary,
}));
mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({ ok: true, detail: "", tools: [] }),
}));

// The host's persistence: a real ledger, or one whose delivery write fails.
const db = new Database(":memory:");
const ledger = new RunLedgerStore(db);
const realAnswers = new DelegatedAnswerStore(db, { now: () => "2026-08-10T00:00:00.000Z" });
let failWrites = false;
const delegatedAnswers = {
  startTracking: (args: Parameters<DelegatedAnswerStore["startTracking"]>[0]) => realAnswers.startTracking(args),
  listOwed: (args: Parameters<DelegatedAnswerStore["listOwed"]>[0]) => realAnswers.listOwed(args),
  recordDelivered: (args: Parameters<DelegatedAnswerStore["recordDelivered"]>[0]) => {
    if (failWrites) throw new Error("database is locked");
    realAnswers.recordDelivered(args);
  },
};
mock.module("../electron/host-service/persistence", () => ({ ensureHostServicePersistenceReady: () => ({ delegatedAnswers }) }));

const { providerRuntime, setProviderTurnAdmission, setProviderTurnCommittedListener, setTaskAgentTurnResolver } = await import("../electron/providers/runtime");
const { recordCommittedTurnAnswers } = await import("../electron/host-service/delegated-task-signals");
const { createHostTurnAdmission } = await import("../electron/host-service/turn-admission-host");
setProviderTurnCommittedListener(recordCommittedTurnAnswers);

const runId = buildDelegatedTaskRunId({ parentTaskId: PARENT, delegationKey: "docs" });
const stepId = buildDelegatedTaskStepId(runId);
let answerTurns = 0;

/** A fresh answer from the child, owed to the parent. */
function childAnswers() {
  const now = new Date(Date.UTC(2026, 7, 10, 0, answerTurns, 30)).toISOString();
  if (answerTurns === 0) {
    ledger.claimStep({ run: createPendingRun({ id: runId, kind: "delegated-task", origin: { kind: "task", id: PARENT },
      ownership: { repositoryPath: "/tmp/stave", workspaceId: "ws", taskId: "child" },
      policy: { maxAttempts: 3, timeoutMs: 86_400_000, maxTurns: 200, maxOutputBytes: 1_048_576, maxEvents: 4_096 },
      provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now }),
    step: createPendingRunStep({ id: stepId, runId, kind: "delegated-task-turn", target: { taskId: "child", workspaceId: "ws", turnId: null, providerId: "codex" },
      dependencyIds: [], inputHash: "c".repeat(64), now }), executionId: "exec", idempotencyKey: "claim", now });
  } else {
    ledger.resumeStep({ runId, stepId, executionId: "exec", idempotencyKey: `follow-up-${answerTurns}`, now });
  }
  answerTurns += 1;
  ledger.markStepWaiting({ runId, stepId, executionId: "exec", idempotencyKey: `child:exec:turn:t${answerTurns}`, reenter: true, now,
    detail: { code: "child-turn-completed", responseText: `ANSWER-${answerTurns}` } });
}

function owed() {
  return collectOwedDelegatedTaskAnswers({ delegatedAnswers: realAnswers }, { parentTaskId: PARENT, lastTurnStartedAt: null, now: "2026-08-10T01:00:00.000Z" }).answers;
}

function conversation(input: string): NonNullable<StreamTurnArgs["conversation"]> {
  return {
    target: { providerId: "codex" }, mode: "chat", history: [],
    input: { role: "user", providerId: "user", content: input, parts: [{ type: "text", text: input }] },
    contextParts: [{ type: "retrieved_context", sourceId: "stave:delegated-tasks", title: "Subagent results", content: owed().map((answer) => answer.text).join("\n") }],
  } as NonNullable<StreamTurnArgs["conversation"]>;
}

/** A parent turn that carries every owed answer, started as the composer and the host both start one. */
async function parentTurn(providerId: StreamTurnArgs["providerId"], turnId: string, overrides: Partial<StreamTurnArgs> = {}) {
  const subagentAnswers = owed().map(({ runId: id, sequence }) => ({ runId: id, sequence }));
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const started = providerRuntime.startTurnStream({ turnId, taskId: PARENT, providerId, prompt: "Next.", cwd: "/tmp/stave-subagent-answers",
    conversation: conversation("Next."), subagentAnswers, ...overrides },
    { bufferEvents: true, onDone: resolveDone });
  await done;
  return { started, subagentAnswers };
}

afterEach(() => {
  // Each test starts with nothing owed.
  realAnswers.recordDelivered({ answers: owed(), parentTurnId: "drain", now: "2026-08-10T02:00:00.000Z" });
  setProviderTurnAdmission(null);
  setTaskAgentTurnResolver(null);
  failWrites = false;
  refuseBeforeAcceptance = false;
  providerTurns = [];
  recordedAtProviderStart = [];
  recordedAtAcceptance = [];
  providerRuntime.cleanupTask({ taskId: PARENT });
});

describe("subagent answers reach the ledger when their turn reaches its provider", () => {
  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId}: a turn settles exactly what it carried once its provider accepts the prompt, and keeps the refs from the provider`, async () => {
      childAnswers();
      const { subagentAnswers } = await parentTurn(providerId, `${providerId}-turn`);
      expect(subagentAnswers).toHaveLength(1);
      expect(recordedAtProviderStart).toEqual([false]);
      expect(recordedAtAcceptance).toEqual([true]);
      expect(providerTurns[0]).not.toHaveProperty("subagentAnswers");
      expect(owed()).toEqual([]);
    });
  }

  test("a turn refused at admission settles nothing", async () => {
    childAnswers();
    setProviderTurnAdmission({ acquire: async () => { throw new Error("turnAdmissionCancelled"); }, release: () => {}, cancel: () => true, cancelTask: () => {} });
    await parentTurn("claude-code", "cancelled-turn");
    expect(providerTurns).toHaveLength(0);
    expect(owed().map((answer) => answer.text)).toEqual([`ANSWER-${answerTurns}`]);
    setProviderTurnAdmission(null);
    await parentTurn("codex", "next-turn");
    expect(owed()).toEqual([]);
  });

  // Every early exit between the turn request and the provider call: none settles.
  for (const [label, overrides] of [
    ["has no working folder", { cwd: undefined }],
    ["has a relative working folder", { cwd: "relative/path" }],
  ] as const) {
    for (const providerId of ["claude-code", "codex"] as const) {
      test(`${providerId}: a turn refused because it ${label} settles nothing`, async () => {
        childAnswers();
        await parentTurn(providerId, `no-cwd-${providerId}-${label}`, overrides);
        expect(providerTurns).toHaveLength(0);
        expect(owed()).toHaveLength(1);
        await parentTurn(providerId, `next-${providerId}-${label}`);
        expect(owed()).toEqual([]);
      });
    }
  }

  test("a tool-less turn a provider cannot run settles nothing", async () => {
    childAnswers();
    await parentTurn("cursor", "toolless-cursor", { runtimeOptions: { toolsDisabled: true } as StreamTurnArgs["runtimeOptions"] });
    expect(providerTurns).toHaveLength(0);
    expect(owed()).toHaveLength(1);
  });

  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId}: a provider that fails before it accepts the prompt settles nothing`, async () => {
      childAnswers();
      refuseBeforeAcceptance = true;
      await parentTurn(providerId, `refused-start-${providerId}`);
      expect(providerTurns).toHaveLength(1);
      expect(owed()).toHaveLength(1);
      refuseBeforeAcceptance = false;
      await parentTurn(providerId, `accepted-${providerId}`);
      expect(owed()).toEqual([]);
    });

    test(`${providerId}: a native slash command carries no context and settles nothing`, async () => {
      childAnswers();
      await parentTurn(providerId, `slash-${providerId}`, { prompt: "/compact", conversation: conversation("/compact") });
      expect(providerTurns).toHaveLength(1);
      expect(owed()).toHaveLength(1);
    });
  }

  test("a turn whose context lost the Subagent results part settles nothing", async () => {
    childAnswers();
    await parentTurn("codex", "no-results-part", { conversation: { ...conversation("Next."), contextParts: [] } });
    expect(providerTurns).toHaveLength(1);
    expect(owed()).toHaveLength(1);
  });

  test("a turn whose task policy cannot be applied settles nothing", async () => {
    childAnswers();
    setTaskAgentTurnResolver(() => { throw new Error("assignment unreadable"); });
    await parentTurn("codex", "refused-turn");
    expect(providerTurns).toHaveLength(0);
    expect(owed()).toHaveLength(1);
  });

  test("a host turn queued in admission and run again after a restart records exactly the answers it carried", async () => {
    childAnswers();
    /** The admission rows on disk, as one boot leaves them for the next. */
    const disk = (rows: unknown[] = []) => {
      const store = { rows, turnAdmission: { read: () => store.rows, write: (next: unknown[]) => { store.rows = structuredClone(next); }, readRestored: () => [], writeRestored: () => {} },
        delegationPolicies: { loadRouteSettings: () => ({ globalAgentTurnLimit: 1 }) } };
      return store;
    };
    const before = disk();
    const firstBoot = createHostTurnAdmission(before as never);
    setProviderTurnAdmission(firstBoot.admission);
    await firstBoot.admission.acquire({ turnId: "busy", taskId: "other-task", providerId: "codex", prompt: "Busy." }, () => {});
    const subagentAnswers = owed().map(({ runId: id, sequence }) => ({ runId: id, sequence }));
    void providerRuntime.startTurnStream({ turnId: "queued-turn", taskId: PARENT, workspaceId: "ws", providerId: "codex", prompt: "Next.", cwd: "/tmp/stave-subagent-answers",
      conversation: conversation("Next."), subagentAnswers, admissionOwner: "host-task" }, { bufferEvents: true });
    while (!firstBoot.isQueued("queued-turn") || before.rows.length < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    // The app stops here. The next boot reads the queued start from disk and runs it again.
    const after = disk(structuredClone(before.rows));
    firstBoot.admission.cancel("queued-turn");
    const secondBoot = createHostTurnAdmission(after as never);
    setProviderTurnAdmission(secondBoot.admission);
    await secondBoot.recover({
      taskExists: () => true, restore: () => false, failed: () => { throw new Error("the queued start was not run again"); },
      start: (args) => new Promise<void>((resolve) => { providerRuntime.startTurnStream(args, { bufferEvents: true, onDone: () => resolve() }); }),
    });
    expect(providerTurns).toHaveLength(1);
    expect(providerTurns[0]?.turnId).toBe("queued-turn");
    expect(owed()).toEqual([]);
  });

  test("a failed delivery write is logged and the answers stay owed, so the next turn carries them again", async () => {
    childAnswers();
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
    try {
      failWrites = true;
      await parentTurn("claude-code", "unrecorded-turn");
    } finally {
      console.error = original;
    }
    expect(providerTurns).toHaveLength(1);
    expect(errors.some((line) => line.includes("could not record 1 subagent answers carried by turn unrecorded-turn"))).toBe(true);
    expect(owed()).toHaveLength(1);
    failWrites = false;
    const { subagentAnswers } = await parentTurn("claude-code", "retry-turn");
    expect(subagentAnswers).toHaveLength(1);
    expect(owed()).toEqual([]);
  });
});
