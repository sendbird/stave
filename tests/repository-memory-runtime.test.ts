import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RepositoryMemoryStore } from "../electron/persistence/repository-memory-store";
import { collectTurnStartRetrievedContextParts, recallRepositoryMemoryRetrievedContext, rememberTurnDurableFacts } from "../src/store/repository-memory-runtime";
import {
  collectOwedDelegatedTaskAnswers,
  DelegatedTaskAnswersArgsSchema,
  recordDelegatedTaskAnswersDelivered,
  type DelegatedTaskAnswerRef,
} from "../src/lib/runs/delegated-task-answers";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import { DelegatedAnswerStore } from "../electron/persistence/delegated-answer-store";
import { getProviderAdapter } from "../src/lib/providers";
import { runProviderTurn } from "../src/store/provider-turn-runtime";
import { buildDelegatedTaskPolicy, buildDelegatedTaskRunId, buildDelegatedTaskStepId } from "../src/lib/runs/delegated-task";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../src/lib/runs/run-domain";
import { buildCanonicalConversationRequest, buildLegacyPromptFromCanonicalRequest } from "../src/lib/providers/canonical-request";
import { StreamTurnArgsSchema } from "../electron/main/ipc/schemas";
import { createTaskContextAttachment } from "../src/lib/task-context/attached-task-context";
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

  test("a composer turn hands its attached review answer to the host with the turn request, unless the transport cut them", async () => {
    const db = new Database(":memory:");
    const ledger = new RunLedgerStore(db);
    const port = { delegatedAnswers: new DelegatedAnswerStore(db, { now: () => "2026-08-10T00:00:00.000Z" }) };
    const now = "2026-08-10T00:01:00.000Z";
    const runId = buildDelegatedTaskRunId({ parentTaskId: "parent", delegationKey: "stave-review-composer" });
    const step = createPendingRunStep({ id: buildDelegatedTaskStepId(runId), runId, kind: "delegated-task-turn",
      target: { taskId: "child", workspaceId: "ws", turnId: null, providerId: "claude-code" }, dependencyIds: [], inputHash: "e".repeat(64), now });
    ledger.claimStep({ run: createPendingRun({ id: runId, kind: "delegated-task", origin: { kind: "task", id: "parent" },
      ownership: { repositoryPath: "/tmp/project", workspaceId: "ws", taskId: "child" }, policy: buildDelegatedTaskPolicy("one-turn"),
      provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now }), step, executionId: "exec", idempotencyKey: "claim", now });
    ledger.completeStep({ runId, stepId: step.id, executionId: "exec", idempotencyKey: "done", resultArtifactRef: "stave://x", now,
      detail: { code: "child-turn-completed", responseText: "COMPOSER-PATH-ANSWER" } });
    // Main's answer channel and the host's provider start, behind the schemas they parse with.
    let sent: ReturnType<typeof StreamTurnArgsSchema.parse> | null = null;
    const attachment = createTaskContextAttachment({ taskId: "child", workspaceId: "ws", title: "Review" });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { api: {
      runs: {
        listDelegatedTasks: async () => [],
        collectDelegatedTaskAnswers: async (args: unknown) => {
          const parsed = DelegatedTaskAnswersArgsSchema.parse(args);
          expect(parsed.attachedTaskIds).toEqual(["child"]);
          return collectOwedDelegatedTaskAnswers(port, { ...parsed, now });
        },
      },
      provider: {
        subscribeStreamEvents: () => () => undefined,
        startPushTurn: async (args: unknown) => {
          sent = StreamTurnArgsSchema.parse(args);
          // The host commits the turn to its provider and records what the request carried.
          if (sent.subagentAnswers) recordDelegatedTaskAnswersDelivered(port, { parentTaskId: "parent", parentTurnId: sent.turnId!, answers: sent.subagentAnswers, now });
          return { ok: false, streamId: "", message: "stop here" };
        },
      },
    } } });
    const turn = async (turnId: string, pad = "") => {
      const deliveredAnswers: DelegatedTaskAnswerRef[] = [];
      const parts = await collectTurnStartRetrievedContextParts({
        repositoryPath: null, parentTaskId: "parent", history: [], prompt: "next", deliveredAnswers,
        promptDraft: { text: "next", attachedFilePaths: [], attachments: [attachment] },
      });
      const contextParts = parts.map((part) => (part.sourceId === "stave:delegated-tasks" ? { ...part, content: part.content + pad } : part));
      const conversation = buildCanonicalConversationRequest({ providerId: "claude-code", model: "m", userInput: "next", history: [], retrievedContextParts: contextParts });
      const done = new Promise<void>((resolve) => runProviderTurn({ turnId, provider: "claude-code", prompt: "next", conversation, taskId: "parent", runtimeOptions: {},
        ...(deliveredAnswers.length > 0 ? { subagentAnswers: deliveredAnswers } : {}),
        onEvent: ({ event }) => { if (event.type === "done") resolve(); } }, { runTurn: getProviderAdapter({ providerId: "claude-code" }).runTurn }));
      await done;
      return { content: parts.find((part) => part.sourceId === "stave:delegated-tasks")?.content ?? "", sent: sent! };
    };
    // A results part the transport has to cut no longer carries the answer, so the request claims none.
    const cut = await turn("turn-0", "x".repeat(1_000_000));
    expect(cut.content).toContain("    COMPOSER-PATH-ANSWER");
    expect(cut.sent).not.toHaveProperty("subagentAnswers");
    const first = await turn("turn-1");
    expect(first.content).toContain("    COMPOSER-PATH-ANSWER");
    expect(first.sent.subagentAnswers).toEqual([{ runId, sequence: expect.any(Number) }]);
    expect((await turn("turn-2")).content).not.toContain("COMPOSER-PATH-ANSWER");
  });

  test("a failed read of the owed answers carries and claims none, so they stay owed", async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { runs: {
      listDelegatedTasks: async () => [],
      collectDelegatedTaskAnswers: async () => { throw new Error("database is locked"); },
    } } } });
    const deliveredAnswers: DelegatedTaskAnswerRef[] = [];
    const parts = await collectTurnStartRetrievedContextParts({ repositoryPath: null, parentTaskId: "parent", history: [], prompt: "next", deliveredAnswers });
    expect(parts.some((part) => part.sourceId === "stave:delegated-tasks")).toBe(false);
    expect(deliveredAnswers).toEqual([]);
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
