import { afterEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { DelegatedAnswerStore } from "../electron/persistence/delegated-answer-store";
import { buildDelegatedTaskRunId, buildDelegatedTaskStepId } from "../src/lib/runs/delegated-task";
import { collectOwedDelegatedTaskAnswers } from "../src/lib/runs/delegated-task-answers";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../src/lib/runs/run-domain";

// A subagent answer counts as delivered when the provider runtime hands the
// turn carrying it to a provider: for either provider, and never for a turn
// refused before that point.

const PARENT = "task-1";
const actualClaudeRuntime = await import("../electron/providers/claude-sdk-runtime");
const actualCodexRuntime = await import("../electron/providers/codex-app-server-runtime");

let providerTurns: StreamTurnArgs[] = [];
/** Whether the answer was already recorded when the provider received the turn. */
let recordedAtProviderStart: boolean[] = [];

async function streamPrimary(args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void; registerAbort?: (aborter: () => void) => void }) {
  providerTurns.push(args);
  recordedAtProviderStart.push(owed().length === 0);
  args.registerAbort?.(() => {});
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
setProviderTurnCommittedListener(recordCommittedTurnAnswers);

const runId = buildDelegatedTaskRunId({ parentTaskId: PARENT, delegationKey: "docs" });
const stepId = buildDelegatedTaskStepId(runId);
let answerTurns = 0;

/** A fresh answer from the child, owed to the parent. */
function childAnswers() {
  const now = `2026-08-10T00:0${answerTurns}:30.000Z`;
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

/** A parent turn that carries every owed answer, started as the composer and the host both start one. */
async function parentTurn(providerId: StreamTurnArgs["providerId"], turnId: string) {
  const subagentAnswers = owed().map(({ runId: id, sequence }) => ({ runId: id, sequence }));
  let resolveDone = () => {};
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const started = providerRuntime.startTurnStream({ turnId, taskId: PARENT, providerId, prompt: "Next.", cwd: "/tmp/stave-subagent-answers", subagentAnswers },
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
  providerTurns = [];
  recordedAtProviderStart = [];
  providerRuntime.cleanupTask({ taskId: PARENT });
});

describe("subagent answers reach the ledger when their turn reaches its provider", () => {
  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId}: a committed turn settles exactly what it carried, before the provider runs, and keeps the refs from the provider`, async () => {
      childAnswers();
      const { subagentAnswers } = await parentTurn(providerId, `${providerId}-turn`);
      expect(subagentAnswers).toHaveLength(1);
      expect(recordedAtProviderStart).toEqual([true]);
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

  test("a turn whose task policy cannot be applied settles nothing", async () => {
    childAnswers();
    setTaskAgentTurnResolver(() => { throw new Error("assignment unreadable"); });
    await parentTurn("codex", "refused-turn");
    expect(providerTurns).toHaveLength(0);
    expect(owed()).toHaveLength(1);
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
