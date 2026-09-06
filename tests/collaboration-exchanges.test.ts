import { describe, expect, test } from "bun:test";
import { selectWorkerExchanges } from "../src/lib/collaboration/worker-exchanges";
import { selectAdvisorTranscriptExchanges } from "../src/lib/collaboration/advisor-transcript";
import { buildCollaborationReport } from "../src/lib/collaboration/report";
import {
  mergeCollaborationRows,
  collectCollaborationHistoryExport,
  projectCollaborationHistoryPage,
  resolveNewerCollaborationHistoryOffset,
  resolveOlderCollaborationHistoryOffset,
} from "../src/lib/collaboration/history";
import { appendWorkflowDraft } from "../src/lib/collaboration/workflows";
import type { ChatMessage, ToolUsePart } from "../src/types/chat";
function message(parts: ToolUsePart[], id = "m"): ChatMessage {
  return {
    id,
    role: "assistant",
    providerId: "codex",
    model: "test-model",
    content: "",
    parts,
  };
}
function call(patch: Partial<ToolUsePart> = {}): ToolUsePart {
  return {
    type: "tool_use",
    toolName: "stave_run_worker",
    input: JSON.stringify({
      task: "Inspect restart behavior",
      workerKey: "private-grant",
    }),
    output: "Verified recovery",
    state: "output-available",
    ...patch,
  };
}

describe("collaboration transcript projections", () => {
  test("keeps the assignment and result without exposing a worker grant or nested tools", () => {
    const rows = selectWorkerExchanges([
      message([
        call(),
        call({ toolName: "Read", input: '{"path":"/tmp/file"}' }),
      ]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.assignment).toBe("Inspect restart behavior");
    expect(JSON.stringify(rows)).not.toContain("private-grant");
    expect(rows[0]?.result).toBe("Verified recovery");
  });
  test("caps retained rows, text and progress instead of cloning unbounded output", () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      message(
        [
          call({
            output: "x".repeat(20000),
            progressMessages: Array(20).fill("y".repeat(2000)),
          }),
        ],
        `m${i}`,
      ),
    );
    const rows = selectWorkerExchanges(messages);
    expect(rows).toHaveLength(24);
    expect(rows[0]?.id).toStartWith("m29:");
    expect(rows[0]?.result).toHaveLength(12000);
    expect(rows[0]?.progress).toHaveLength(8);
    expect(rows[0]?.progress[0]).toHaveLength(1000);
    expect(messages[29]?.parts[0]).toHaveProperty("output", "x".repeat(20000));
  });
  test("does not reveal incomplete grant-bearing inputs while streaming", () => {
    expect(
      selectWorkerExchanges([
        message([call({ input: '{"workerKey":"private-grant"' })]),
      ])[0]?.assignment,
    ).not.toContain("private-grant");
  });
  test("preserves requested, resolved, and runtime-reported Worker model evidence", () => {
    const rows = selectWorkerExchanges([
      message([
        call({
          workerExecution: {
            providerId: "cursor",
            primaryModel: "primary-model",
            presetId: "verified-patch",
            workerModel: "configured-worker",
            requestedWorkerModel: "auto",
            resolvedWorkerModel: "configured-worker",
            workerModelSource: "preset",
            workerModelRationale: "Recorded by the selection producer.",
            runtimeWorkerModel: "executed-worker",
            workerEffort: null,
          },
        }),
      ]),
    ]);

    expect(rows[0]).toMatchObject({
      model: "executed-worker",
      requestedModel: "auto",
      resolvedModel: "configured-worker",
      runtimeModel: "executed-worker",
      modelSource: "preset",
      modelRationale: "Recorded by the selection producer.",
    });
    const report = buildCollaborationReport({
      taskId: "parent",
      now: "2026-01-01",
      children: [],
      consults: [],
      workers: rows,
    });
    expect(report).toContain("Requested model: auto");
    expect(report).toContain("Resolved model: configured-worker");
    expect(report).toContain("Runtime-reported model: executed-worker");
    expect(report).toContain("Resolution source: preset");
    expect(report).toContain(
      "Recorded selection rationale: Recorded by the selection producer.",
    );
  });
  test("recovers advisor answers from serialized canonical conversation after restart", () => {
    const persisted = JSON.parse(
      JSON.stringify([
        message([
          call({
            toolName: "mcp__stave__stave_consult_advisor",
            input: JSON.stringify({
              consultKey: "private-consult",
              question: "Can this recover?",
            }),
            output: JSON.stringify({
              consult: { ok: true, advice: "Persist identity before launch." },
            }),
          }),
        ]),
      ]),
    ) as ChatMessage[];
    const rows = selectAdvisorTranscriptExchanges(persisted);
    expect(rows[0]?.question).toBe("Can this recover?");
    expect(rows[0]?.answer).toBe("Persist identity before launch.");
    expect(JSON.stringify(rows)).not.toContain("private-consult");
    const report = buildCollaborationReport({
      taskId: "parent",
      now: "2026-01-01",
      children: [],
      consults: [],
      recoveredAdvice: rows,
      workers: selectWorkerExchanges([message([call()])]),
    });
    expect(report).toContain("Persist identity before launch.");
    expect(report).toContain("Verified recovery");
    expect(report).not.toContain("private-grant");
  });
  test("labels unavailable advisor output and empty worker exports honestly", () => {
    const pending = selectAdvisorTranscriptExchanges([
      message([
        call({
          toolName: "mcp__stave__stave_consult_advisor",
          input: JSON.stringify({ question: "Is the answer ready?" }),
          output: "",
          state: "input-streaming",
        }),
      ]),
    ]);
    expect(pending[0]?.answer).toBe("Advisor response is still in progress.");

    const report = buildCollaborationReport({
      taskId: "parent",
      now: "2026-01-01",
      children: [],
      consults: [],
    });
    expect(report).toContain("Saved transcript coverage: unavailable");
    expect(report).toContain(
      "No worker exchanges in the current conversation or selected saved slice.",
    );
  });
  test("projects an older saved page without retaining its full transcript payloads", () => {
    const pageMessages = Array.from({ length: 120 }, (_, index) =>
      message(
        index === 0
          ? [
              call({
                toolUseId: "persisted-worker",
                input: JSON.stringify({ task: "Old persisted assignment" }),
                output: "Old persisted result",
              }),
              call({
                toolName: "mcp__stave__stave_consult_advisor",
                input: JSON.stringify({ question: "Old persisted question" }),
                output: JSON.stringify({ advice: "Old persisted advice" }),
              }),
            ]
          : [],
        `older-${index}`,
      ),
    );
    pageMessages[119] = {
      ...pageMessages[119]!,
      content: "unrelated-full-transcript-payload",
      parts: [{ type: "text", text: "unrelated-full-transcript-payload" }],
    };
    const history = projectCollaborationHistoryPage({
      messages: pageMessages,
      totalCount: 360,
      limit: 120,
      offset: 120,
      hasMoreOlder: true,
    });

    expect(history.coverage).toEqual({
      firstMessageNumber: 121,
      lastMessageNumber: 240,
      scannedMessageCount: 120,
      totalMessageCount: 360,
      hasOlder: true,
      hasNewer: true,
    });
    expect(history.workers[0]?.assignment).toBe("Old persisted assignment");
    expect(history.workers[0]?.toolUseId).toBeUndefined();
    expect(history.advisors[0]?.answer).toBe("Old persisted advice");
    expect(resolveOlderCollaborationHistoryOffset(history)).toBe(240);
    expect(resolveNewerCollaborationHistoryOffset(history)).toBe(0);
    expect(JSON.stringify(history)).not.toContain(
      "unrelated-full-transcript-payload",
    );
  });
  test("deduplicates current and saved projections and exports exact saved coverage", () => {
    const current = selectWorkerExchanges([
      message([call({ toolUseId: "same" })], "shared"),
    ]);
    const savedPage = projectCollaborationHistoryPage({
      messages: [message([call({ toolUseId: "same" })], "shared")],
      totalCount: 501,
      limit: 120,
      offset: 120,
      hasMoreOlder: true,
    });
    const merged = mergeCollaborationRows(current, savedPage.workers);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.toolUseId).toBe("same");

    const report = buildCollaborationReport({
      taskId: "parent",
      now: "2026-01-01",
      children: [],
      consults: [],
      workers: merged,
      recoveredAdvice: savedPage.advisors,
      historyPage: savedPage,
    });
    expect(report).toContain(
      "Saved transcript coverage: messages 381–381 of 501.",
    );
    expect(report).toContain(
      "Selected saved slice contains 0 advisor exchange(s) and 1 worker exchange(s)",
    );
    expect(report).toContain("It is not a full transcript");
  });
  test("exports saved pages sequentially and labels the message cap", async () => {
    const newest = message([call({ toolUseId: "new-worker" })], "newest");
    const older = message(
      [
        call({
          toolUseId: "old-advisor",
          toolName: "mcp__stave__stave_consult_advisor",
          input: JSON.stringify({ question: "Older saved question" }),
          output: JSON.stringify({ advice: "Older saved advice" }),
        }),
      ],
      "older",
    );
    const pages = new Map([
      [
        0,
        {
          messages: [newest],
          totalCount: 2,
          limit: 1,
          offset: 0,
          hasMoreOlder: true,
        },
      ],
      [
        1,
        {
          messages: [older],
          totalCount: 2,
          limit: 1,
          offset: 1,
          hasMoreOlder: false,
        },
      ],
    ]);
    const calls: number[] = [];
    const collected = await collectCollaborationHistoryExport({
      maxMessages: 2,
      loadPage: async ({ offset }) => {
        calls.push(offset);
        return pages.get(offset)!;
      },
    });
    expect(collected.status).toBe("complete");
    if (collected.status !== "complete") return;
    expect(calls).toEqual([0, 1]);
    expect(collected.export.coverage).toMatchObject({
      complete: true,
      scannedMessageCount: 2,
      includedAdvisorExchangeCount: 1,
      includedWorkerExchangeCount: 1,
    });
    expect(collected.export.advisors[0]?.answer).toBe("Older saved advice");

    const capped = await collectCollaborationHistoryExport({
      maxMessages: 1,
      loadPage: async ({ offset }) => pages.get(offset)!,
    });
    expect(capped.status).toBe("complete");
    if (capped.status !== "complete") return;
    expect(capped.export.coverage).toMatchObject({
      complete: false,
      incompleteReasons: ["message-cap"],
    });
    const report = buildCollaborationReport({
      taskId: "parent",
      now: "2026-01-01",
      children: [],
      consults: [],
      workers: capped.export.workers,
      recoveredAdvice: capped.export.advisors,
      historyExport: capped.export,
    });
    expect(report).toContain(
      "Saved transcript export coverage: 1 of 2 saved messages; incomplete because message-cap.",
    );
  });
  test("cancels a saved-history export before reading another page", async () => {
    let cancelled = false;
    let calls = 0;
    const result = await collectCollaborationHistoryExport({
      loadPage: async () => {
        calls += 1;
        cancelled = true;
        return {
          messages: [message([call()])],
          totalCount: 2,
          limit: 1,
          offset: 0,
          hasMoreOlder: true,
        };
      },
      isCancelled: () => cancelled,
    });
    expect(result).toEqual({ status: "cancelled" });
    expect(calls).toBe(1);
  });
  test("workflow insertion preserves the user's existing draft", () => {
    expect(appendWorkflowDraft("My constraints", "New workflow")).toBe(
      "My constraints\n\nNew workflow",
    );
    expect(appendWorkflowDraft("  ", "New workflow")).toBe("New workflow");
  });
});
