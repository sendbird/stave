import { expect, test } from "bun:test";
import {
  captureResultEvidence,
  ResultEvidenceSchema,
} from "@/lib/reviews/result-evidence";
import type { ChatMessage } from "@/types/chat";

test("captures the last answer and its file names without private tool arguments", () => {
  const message: ChatMessage = {
    id: "answer",
    turnId: "turn",
    role: "assistant",
    providerId: "codex",
    model: "model",
    content: "Final result",
    parts: [
      {
        type: "tool_use",
        toolName: "Worker",
        input: '{"grant":"private-value"}',
        state: "output-available",
        output: "worker output",
      },
      {
        type: "code_diff",
        filePath: "src/result.ts",
        oldContent: "old",
        newContent: "new",
        status: "accepted",
      },
    ],
  };
  const evidence = captureResultEvidence([message], "turn");
  expect(ResultEvidenceSchema.safeParse(evidence).success).toBe(true);
  expect(evidence?.answer).toBe("Final result");
  expect(evidence?.files).toEqual(["src/result.ts"]);
  expect(evidence?.snapshots).toEqual([
    {
      filePath: "src/result.ts",
      oldContent: "old",
      newContent: "new",
      status: "accepted",
      truncated: false,
    },
  ]);
  expect(JSON.stringify(evidence)).not.toContain("private-value");
  message.content = "Later content";
  const diff = message.parts[1];
  if (diff?.type === "code_diff") diff.newContent = "Changed again";
  expect(evidence?.answer).toBe("Final result");
  expect(evidence?.snapshots?.[0]?.newContent).toBe("new");
});

test("keeps the last reported change per file within a total content budget", () => {
  const answer: ChatMessage = {
    id: "answer",
    turnId: "turn",
    role: "assistant",
    providerId: "codex",
    model: "model",
    content: "Done",
    parts: [],
  };
  const changes = Array.from({ length: 30 }, (_, index) => ({
    type: "code_diff" as const,
    filePath: `file-${index}.ts`,
    oldContent: "a".repeat(40_000),
    newContent: "b".repeat(40_000),
    status: "accepted" as const,
  }));
  const evidence = captureResultEvidence(
    [
      { ...answer, parts: changes },
      {
        ...answer,
        parts: [
          {
            ...changes[0]!,
            newContent: "Last recorded contents",
            status: "rejected",
          },
        ],
      },
    ],
    "turn",
  );
  expect(ResultEvidenceSchema.safeParse(evidence).success).toBe(true);
  expect(evidence?.snapshots?.[0]).toMatchObject({
    newContent: "Last recorded contents",
    status: "rejected",
    truncated: true,
  });
  expect(evidence?.snapshotsTruncated).toBe(true);
  const storedCharacters = evidence!.snapshots!.reduce(
    (count, row) => count + row.oldContent.length + row.newContent.length,
    0,
  );
  expect(storedCharacters).toBeLessThanOrEqual(64_000);
  expect(evidence!.snapshots!.length).toBeLessThanOrEqual(20);
  const {
    snapshots: _snapshots,
    snapshotsTruncated: _truncated,
    ...legacy
  } = evidence!;
  expect(ResultEvidenceSchema.safeParse(legacy).success).toBe(true);
  expect(
    ResultEvidenceSchema.safeParse({
      ...legacy,
      snapshots: Array.from({ length: 3 }, () => ({
        filePath: "x",
        oldContent: "x".repeat(16_000),
        newContent: "x".repeat(16_000),
        status: "accepted",
        truncated: false,
      })),
    }).success,
  ).toBe(false);
});

test("marks an excerpt honestly and never invents an answer for a user-only history", () => {
  const user: ChatMessage = {
    id: "user",
    role: "user",
    model: "user",
    providerId: "user",
    content: "Prompt",
    parts: [],
  };
  expect(captureResultEvidence([user], "turn")).toBeUndefined();
  const evidence = captureResultEvidence(
    [
      {
        ...user,
        id: "answer",
        turnId: "turn",
        role: "assistant",
        content: "x".repeat(40_000),
      },
    ],
    "turn",
  );
  expect(evidence?.answer).toHaveLength(32_000);
  expect(evidence?.answerTruncated).toBe(true);
});

test("never attaches another execution or a legacy answer to a failed new turn", () => {
  const old: ChatMessage = {
    id: "old",
    turnId: "old-turn",
    role: "assistant",
    providerId: "codex",
    model: "model",
    content: "Previous success",
    parts: [],
  };
  const user: ChatMessage = {
    id: "new-request",
    role: "user",
    providerId: "user",
    model: "user",
    content: "New request",
    parts: [],
  };
  expect(captureResultEvidence([old, user], "new-turn")).toBeUndefined();
  expect(
    captureResultEvidence([{ ...old, turnId: undefined }], "new-turn"),
  ).toBeUndefined();
  const failure: ChatMessage = {
    ...old,
    id: "failure",
    turnId: "new-turn",
    content: "",
    parts: [],
  };
  expect(captureResultEvidence([old, user, failure], "new-turn")?.answer).toBe(
    "",
  );
});

test("collects files across a split execution without borrowing another run's changes", () => {
  const answer: ChatMessage = {
    id: "answer",
    turnId: "turn",
    role: "assistant",
    providerId: "codex",
    model: "model",
    content: "Finished",
    parts: [],
  };
  const changed = {
    ...answer,
    id: "before-plan",
    content: "",
    parts: [
      {
        type: "code_diff" as const,
        filePath: "src/changed.ts",
        oldContent: "before",
        newContent: "after",
        status: "accepted" as const,
      },
    ],
  };
  const old = {
    ...changed,
    id: "old",
    turnId: "old-turn",
    parts: [{ ...changed.parts[0]!, filePath: "src/old.ts" }],
  };
  expect(captureResultEvidence([old, changed, answer], "turn")).toMatchObject({
    messageId: "answer",
    answer: "Finished",
    files: ["src/changed.ts"],
  });
});

test("keeps the routed explanation separate from the executed model across split rows", () => {
  const resolution = {
    selectedProviderId: "codex" as const,
    selectedModel: "selected-model",
    source: "heuristic" as const,
    rationale: "A small scoped edit fits this route.",
    confidence: 0.8,
    taskType: "quick_edit" as const,
  };
  const start: ChatMessage = {
    id: "start",
    turnId: "current",
    role: "assistant",
    providerId: "codex",
    model: "selected-model",
    modelResolution: resolution,
    content: "",
    parts: [],
  };
  const end: ChatMessage = {
    id: "end",
    turnId: "current",
    role: "assistant",
    providerId: "cursor",
    model: "runtime-model",
    content: "Final answer",
    parts: [],
  };
  const captured = captureResultEvidence([start, end], "current");
  const restored = ResultEvidenceSchema.parse(
    JSON.parse(JSON.stringify(captured)),
  );
  expect(restored.model).toBe("runtime-model");
  expect(restored.modelResolution?.selectedModel).toBe("selected-model");
  resolution.rationale = "Changed later";
  expect(captured?.modelResolution?.rationale).toBe(
    "A small scoped edit fits this route.",
  );
  expect(
    captureResultEvidence([{ ...start, turnId: "old" }, end], "current")
      ?.modelResolution,
  ).toBeUndefined();
});
