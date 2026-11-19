import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RepositoryMemoryStore } from "../electron/persistence/repository-memory-store";
import { collectTurnStartRetrievedContextParts, recallRepositoryMemoryRetrievedContext, recordDeliveredDelegatedTaskAnswers, rememberTurnDurableFacts } from "../src/store/repository-memory-runtime";
import {
  collectOwedDelegatedTaskAnswers,
  DelegatedTaskAnswersArgsSchema,
  DelegatedTaskAnswersDeliveredArgsSchema,
  recordDelegatedTaskAnswersDelivered,
  type DelegatedTaskAnswerRef,
} from "../src/lib/runs/delegated-task-answers";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { buildDelegatedTaskPolicy, buildDelegatedTaskRunId, buildDelegatedTaskStepId } from "../src/lib/runs/delegated-task";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../src/lib/runs/run-domain";
import { buildCanonicalConversationRequest, buildLegacyPromptFromCanonicalRequest } from "../src/lib/providers/canonical-request";
import { StreamTurnArgsSchema } from "../electron/main/ipc/schemas";
import { resolveRepositoryMemoryRecallQuery } from "../src/lib/task-context/repository-memory";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
function setApi(repositoryMemory: unknown) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { repositoryMemory } } });
}

describe("project memory turn boundary", () => {
  test("current work selects curated memory, and every provider receives the same bounded context", async () => {
    const store = new RepositoryMemoryStore(new Database(":memory:"));
    store.settings.save({ repositoryPath: "/tmp/project", expectedRevision: 0, patch: { collectAutomatically: true } });
    store.remember({ repositoryPath: "/tmp/project", kind: "gotcha", content: "Terminal snapshots need stable slot keys.", confidence: 0.9 });
    store.remember({ repositoryPath: "/tmp/project", kind: "fact", content: "Composer uses derived colors.", confidence: 0.9 });
    store.remember({ repositoryPath: "/tmp/project", kind: "fact", content: "Terminal candidate should not be recalled.", confidence: 0.6, collectionRevision: 1 });
    setApi({ recall: async (args: { repositoryPath: string; query: string }) => ({ ok: true, items: store.recall(args) }) });
    const prompt = "Investigate terminal snapshots";
    const part = await recallRepositoryMemoryRetrievedContext({ repositoryPath: "/tmp/project", history: [{ role: "user", content: "Review the composer" }], prompt });
    expect(part?.content).toContain("stable slot keys");
    expect(part?.content).not.toContain("Composer");
    expect(part?.content).not.toContain("candidate should");
    for (const providerId of ["claude-code", "codex", "cursor", "kiro"] as const) {
      const conversation = buildCanonicalConversationRequest({ providerId, model: "test-model", userInput: prompt, history: [], retrievedContextParts: [part!] });
      expect(StreamTurnArgsSchema.safeParse({ providerId, prompt, conversation, runtimeOptions: {} }).success).toBe(true);
      expect(buildLegacyPromptFromCanonicalRequest({ request: conversation })).toContain(part!.content);
    }
  });

  test("a composer turn carries a subagent answer once through main's answer channels", async () => {
    const ledger = new RunLedgerStore(new Database(":memory:"));
    const now = "2026-08-10T00:01:00.000Z";
    const runId = buildDelegatedTaskRunId({ parentTaskId: "parent", delegationKey: "docs" });
    const step = createPendingRunStep({ id: buildDelegatedTaskStepId(runId), runId, kind: "delegated-task-turn",
      target: { taskId: "child", workspaceId: "ws", turnId: null, providerId: "claude-code" }, dependencyIds: [], inputHash: "e".repeat(64), now });
    ledger.claimStep({ run: createPendingRun({ id: runId, kind: "delegated-task", origin: { kind: "task", id: "parent" },
      ownership: { repositoryPath: "/tmp/project", workspaceId: "ws", taskId: "child" }, policy: buildDelegatedTaskPolicy("one-turn"),
      provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now }), step, executionId: "exec", idempotencyKey: "claim", now });
    ledger.completeStep({ runId, stepId: step.id, executionId: "exec", idempotencyKey: "done", resultArtifactRef: "stave://x", now,
      detail: { code: "child-turn-completed", responseText: "COMPOSER-PATH-ANSWER", turnId: "child-turn" } });
    const port = { listRunAggregatesByOrigin: (args: Parameters<RunLedgerStore["listAggregatesByOrigin"]>[0]) => ledger.listAggregatesByOrigin(args),
      listRunReceipts: (args: { runId: string }) => ledger.listReceipts(args), appendRunReceipts: (receipts: Parameters<RunLedgerStore["appendReceipts"]>[0]) => ledger.appendReceipts(receipts) };
    const recorded: Promise<unknown>[] = [];
    // Main's handlers, behind the schemas they parse with.
    Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { runs: {
      listDelegatedTasks: async () => [],
      collectDelegatedTaskAnswers: async (args: unknown) => collectOwedDelegatedTaskAnswers(port, { ...DelegatedTaskAnswersArgsSchema.parse(args), now }),
      recordDelegatedTaskAnswersDelivered: (args: unknown) => {
        const done = Promise.resolve().then(() => recordDelegatedTaskAnswersDelivered(port, { ...DelegatedTaskAnswersDeliveredArgsSchema.parse(args), now }));
        recorded.push(done);
        return done.then(() => ({ ok: true }));
      },
    } } } });
    const turn = async (turnId: string) => {
      const deliveredAnswers: DelegatedTaskAnswerRef[] = [];
      const parts = await collectTurnStartRetrievedContextParts({ repositoryPath: null, parentTaskId: "parent", history: [], prompt: "next", deliveredAnswers });
      recordDeliveredDelegatedTaskAnswers({ parentTaskId: "parent", parentTurnId: turnId, answers: deliveredAnswers });
      await Promise.all(recorded);
      return parts.find((part) => part.sourceId === "stave:delegated-tasks")?.content ?? "";
    };
    expect(await turn("turn-1")).toContain("    COMPOSER-PATH-ANSWER");
    expect(await turn("turn-2")).not.toContain("COMPOSER-PATH-ANSWER");
  });

  test("failed recall is omitted, and summary writes stay automatic", async () => {
    setApi({ recall: async () => { throw new Error("Database unavailable"); } });
    expect(await recallRepositoryMemoryRetrievedContext({ repositoryPath: "/tmp/project", history: [], prompt: "Investigate snapshots" })).toBeNull();
    const writes: unknown[] = [];
    setApi({ remember: async (args: unknown) => { writes.push(args); return { ok: true, results: [] }; } });
    rememberTurnDurableFacts({ repositoryPath: "/tmp/project", taskId: "task", turnId: "turn", facts: [{ kind: "fact", content: "Candidate." }] });
    expect(writes).toEqual([{ repositoryPath: "/tmp/project", source: "auto", sourceTaskId: "task", sourceTurnId: "turn", facts: [{ kind: "fact", content: "Candidate." }] }]);
  });

  test("long prompts fit IPC and short continuation uses recent context", () => {
    expect(resolveRepositoryMemoryRecallQuery({ history: [], prompt: "x".repeat(10000) })).toHaveLength(8000);
    expect(resolveRepositoryMemoryRecallQuery({ history: [{ role: "user", content: "Old composer task" }, { role: "user", content: "Current terminal task" }], prompt: "계속" })).toBe("Current terminal task\n계속");
  });
});
