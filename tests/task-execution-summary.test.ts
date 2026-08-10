import { describe, expect, it } from "bun:test";
import {
  buildTaskExecutionSummary,
  buildTaskReviewArtifact,
} from "@/lib/fleet/task-execution-summary";
import type { TaskHeartbeatSummary } from "@/lib/automation/task-supervisor";
import type { RateLimitsSnapshotResponse } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

function assistantMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    model: "gpt-5.6",
    providerId: "codex",
    content: "Implemented the requested change.",
    startedAt: "2026-07-31T00:00:00.000Z",
    completedAt: "2026-07-31T00:00:02.000Z",
    parts: [{ type: "text", text: "Implemented the requested change." }],
    ...overrides,
  };
}

const rateLimits: RateLimitsSnapshotResponse = {
  claude: {
    source: "oauth",
    session: { usedPercent: 18, resetsAt: 10 },
    weekly: { usedPercent: 72, resetsAt: 20 },
    fableWeekly: null,
    error: null,
  },
  codex: {
    source: "rpc",
    buckets: [
      {
        limitId: "standard",
        limitName: "Standard",
        planType: "pro",
        primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 30 },
        secondary: { usedPercent: 67, windowDurationMins: 10_080, resetsAt: 40 },
        individualLimit: null,
        credits: null,
      },
    ],
    error: null,
  },
};

function heartbeatSummary(
  overrides: Partial<TaskHeartbeatSummary> = {},
): TaskHeartbeatSummary {
  return {
    heartbeatId: "heartbeat-1",
    taskId: "task-1",
    state: "scheduled",
    reason: null,
    nextRunAt: "2026-07-31T00:05:00.000Z",
    occurrenceCount: 3,
    skippedCount: 0,
    ...overrides,
  };
}

describe("task execution summary", () => {
  it("aggregates persisted usage and the first-to-latest diff per file", () => {
    const messages = [
      assistantMessage({
        id: "assistant-1",
        usage: {
          inputTokens: 100,
          outputTokens: 40,
          totalCostUsd: 0.01,
        },
        parts: [
          {
            type: "code_diff",
            filePath: "src/a.ts",
            oldContent: "one\n",
            newContent: "one\ntwo\n",
            status: "accepted",
          },
        ],
      }),
      assistantMessage({
        id: "assistant-2",
        usage: {
          inputTokens: 20,
          outputTokens: 10,
          cacheReadTokens: 5,
        },
        parts: [
          {
            type: "code_diff",
            filePath: "src/a.ts",
            oldContent: "one\ntwo\n",
            newContent: "one\nthree\n",
            status: "accepted",
          },
        ],
      }),
    ];
    const summary = buildTaskExecutionSummary({
      taskId: "task-1",
      providerId: "codex",
      messages,
      rateLimits,
    });

    expect(summary.usage.value).toEqual({
      inputTokens: 120,
      outputTokens: 50,
      cacheReadTokens: 5,
      cacheCreationTokens: 0,
      totalCostUsd: 0.01,
    });
    expect(summary.changes.value).toMatchObject({
      files: ["src/a.ts"],
      additions: 1,
      deletions: 0,
      partial: false,
    });
    expect(summary.accountLimit.value).toMatchObject({
      providerId: "codex",
      label: "Standard secondary",
      usedPercent: 67,
    });
    expect(summary.contextHeadroom.provenance).toBe("unavailable");
  });

  it("keeps missing provider data unavailable instead of displaying zero", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [assistantMessage({ usage: undefined, parts: [] })],
    });

    expect(summary.usage.value).toBeNull();
    expect(summary.usage.provenance).toBe("unavailable");
    expect(summary.changes.value).toBeNull();
    expect(summary.accountLimit.value).toBeNull();
    expect(summary.contextHeadroom.value).toBeNull();
  });

  it("keeps persisted approval details visible after the live activity expires", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "codex",
      messages: [
        assistantMessage({
          content: "",
          completedAt: undefined,
          isStreaming: false,
          parts: [
            {
              type: "approval",
              toolName: "Bash",
              description: "Run the production deployment.",
              requestId: "approval-1",
              state: "approval-requested",
            },
          ],
        }),
      ],
    });

    expect(summary.latestActivity).toMatchObject({
      provenance: "derived",
      value: {
        label:
          "Waiting for approval · Bash: Run the production deployment.",
      },
      sourceRefs: ["message:assistant-1"],
    });
    expect(summary.elapsed).toMatchObject({
      provenance: "unavailable",
      value: null,
    });
  });

  it("selects the most constrained account bucket per provider", () => {
    const claude = buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [],
      rateLimits,
    });
    const codex = buildTaskExecutionSummary({
      providerId: "codex",
      messages: [],
      rateLimits,
    });

    expect(claude.accountLimit.value?.label).toBe("Weekly");
    expect(claude.accountLimit.value?.usedPercent).toBe(72);
    expect(codex.accountLimit.value?.usedPercent).toBe(67);
  });

  it("keeps cumulative persisted metrics across a compact boundary and restart", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [
        assistantMessage({
          id: "assistant-before-compact",
          providerId: "claude-code",
          model: "claude-opus-4-6",
          usage: { inputTokens: 80, outputTokens: 20 },
        }),
        assistantMessage({
          id: "assistant-compact-boundary",
          providerId: "claude-code",
          model: "system",
          content: "Conversation compacted.",
          usage: undefined,
          parts: [
            {
              type: "system_event",
              content: "Conversation compacted.",
              compactBoundary: { trigger: "provider" },
            },
          ],
        }),
        assistantMessage({
          id: "assistant-after-compact",
          providerId: "claude-code",
          model: "claude-opus-4-6",
          usage: { inputTokens: 40, outputTokens: 10 },
          startedAt: "2026-07-31T00:01:00.000Z",
          completedAt: "2026-07-31T00:01:03.000Z",
        }),
      ],
    });

    expect(summary.usage.value).toMatchObject({
      inputTokens: 120,
      outputTokens: 30,
    });
    expect(summary.elapsed).toMatchObject({
      provenance: "derived",
      value: { milliseconds: 3_000, running: false },
    });
    expect(summary.usage.sourceRefs).toEqual([
      "message:assistant-before-compact",
      "message:assistant-after-compact",
    ]);
  });

  it("marks oversized persisted diffs partial without inventing line totals", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "codex",
      messages: [
        assistantMessage({
          parts: [
            {
              type: "code_diff",
              filePath: "generated.txt",
              oldContent: "",
              newContent: "x".repeat(250_001),
              status: "accepted",
            },
          ],
        }),
      ],
    });

    expect(summary.changes.value).toEqual({
      files: ["generated.txt"],
      additions: null,
      deletions: null,
      partial: true,
    });
  });

  it("counts separated line edits without charging unchanged middle lines", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "codex",
      messages: [
        assistantMessage({
          parts: [
            {
              type: "code_diff",
              filePath: "src/flow.ts",
              oldContent: "start\nkeep-one\nmiddle\nkeep-two\nend\n",
              newContent:
                "start\nadded-one\nkeep-one\nmiddle\nkeep-two\nadded-two\nend\n",
              status: "accepted",
            },
          ],
        }),
      ],
    });

    expect(summary.changes.value).toMatchObject({
      additions: 2,
      deletions: 0,
      partial: false,
    });
  });

  it("reports the attached heartbeat against its own source ref", () => {
    const summary = buildTaskExecutionSummary({
      taskId: "task-1",
      providerId: "codex",
      messages: [assistantMessage()],
      heartbeat: heartbeatSummary({ skippedCount: 2 }),
    });

    expect(summary.supervision).toMatchObject({
      provenance: "reported",
      value: {
        heartbeatId: "heartbeat-1",
        state: "scheduled",
        reason: null,
        nextRunAt: Date.parse("2026-07-31T00:05:00.000Z"),
        occurrenceCount: 3,
        skippedCount: 2,
      },
    });
    // The ref names the heartbeat, not the task: a reader has to be able to
    // walk back to the row that made the claim.
    expect(summary.supervision.sourceRefs).toEqual(["heartbeat:heartbeat-1"]);
  });

  it("keeps an unsupervised task unavailable instead of reporting a zeroed heartbeat", () => {
    const summary = buildTaskExecutionSummary({
      taskId: "task-1",
      providerId: "codex",
      messages: [assistantMessage()],
    });

    expect(summary.supervision.provenance).toBe("unavailable");
    // Explicitly null, never 0: "no heartbeat" and "a heartbeat that has never
    // fired" are different facts and must not render the same.
    expect(summary.supervision.value).toBeNull();
    expect(summary.supervision.value).not.toBe(0);
    expect(summary.supervision.sourceRefs).toEqual([]);
  });

  it("cautions on a paused heartbeat and on skipped occurrences", () => {
    const artifact = buildTaskReviewArtifact(
      buildTaskExecutionSummary({
        taskId: "task-1",
        providerId: "codex",
        messages: [assistantMessage()],
        heartbeat: heartbeatSummary({
          state: "paused",
          reason: "The task is waiting on an approval.",
          nextRunAt: null,
          skippedCount: 2,
        }),
      }),
    );

    expect(artifact.cautions).toContain(
      "Heartbeat paused: The task is waiting on an approval.",
    );
    expect(artifact.cautions).toContain(
      "2 heartbeat occurrences were skipped.",
    );
    expect(artifact.sourceRefs).toContain("heartbeat:heartbeat-1");
  });

  it("leaves a healthy heartbeat out of the cautions", () => {
    const artifact = buildTaskReviewArtifact(
      buildTaskExecutionSummary({
        taskId: "task-1",
        providerId: "codex",
        messages: [assistantMessage()],
        heartbeat: heartbeatSummary(),
      }),
    );

    expect(artifact.cautions.some((caution) => /heartbeat/i.test(caution))).toBe(
      false,
    );
  });

  it("builds a compact review artifact without claiming unreported checks", () => {
    const artifact = buildTaskReviewArtifact(
      buildTaskExecutionSummary({
        providerId: "codex",
        messages: [assistantMessage()],
      }),
    );

    expect(artifact.headline).toBe("Implemented the requested change.");
    expect(artifact.cautions).toContain("Verification was not reported.");
    expect(artifact.facts.some((fact) => fact.includes("passed"))).toBe(false);
  });
});
