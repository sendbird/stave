import { describe, expect, it } from "bun:test";
import {
  buildTaskExecutionSummary,
  buildTaskReviewArtifact,
} from "@/lib/fleet/task-execution-summary";
import type {
  NormalizedProviderEvent,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import {
  applyProviderTurnActivityEvents,
  startProviderTurnActivity,
} from "@/lib/providers/turn-status";
import type { ChatMessage } from "@/types/chat";

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
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
        secondary: {
          usedPercent: 67,
          windowDurationMins: 10_080,
          resetsAt: 40,
        },
        individualLimit: null,
        credits: null,
      },
    ],
    error: null,
  },
};

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
        label: "Waiting for approval · Bash: Run the production deployment.",
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

  it("does not attribute Codex account limits to Cursor or Kiro turns", () => {
    // Rate-limit snapshots only exist for Claude and Codex. The Headroom tile
    // used to fall through every other provider to Codex, so a Cursor turn
    // showed GPT plan percentages that belonged to a different runtime.
    const cursor = buildTaskExecutionSummary({
      providerId: "cursor",
      messages: [],
      rateLimits,
    });
    const kiro = buildTaskExecutionSummary({
      providerId: "kiro",
      messages: [],
      rateLimits,
    });

    expect(cursor.accountLimit.value).toBeNull();
    expect(cursor.accountLimit.provenance).toBe("unavailable");
    expect(cursor.accountLimit.detail).toBe(
      "Cursor does not report an account limit.",
    );
    expect(kiro.accountLimit.value).toBeNull();
    expect(kiro.accountLimit.detail).toBe(
      "Kiro does not report an account limit.",
    );
  });

  it("reads context headroom from the latest reported window instead of leaving the tile empty", () => {
    const tokenWindow = buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [
        assistantMessage({
          id: "older",
          providerId: "claude-code",
          model: "opus",
          usage: {
            inputTokens: 10,
            outputTokens: 4,
            contextUsedTokens: 100,
            contextWindowTokens: 200,
          },
        }),
        assistantMessage({
          id: "newer",
          providerId: "claude-code",
          model: "opus",
          usage: {
            inputTokens: 8,
            outputTokens: 2,
            contextUsedTokens: 750,
            contextWindowTokens: 1_000,
          },
        }),
      ],
    });
    expect(tokenWindow.contextHeadroom).toMatchObject({
      provenance: "reported",
      value: { remainingTokens: 250, totalTokens: 1_000, usedPercent: 75 },
    });

    const kiro = buildTaskExecutionSummary({
      providerId: "kiro",
      messages: [
        assistantMessage({
          providerId: "kiro",
          model: "auto",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            contextUsedPercent: 3.671,
            contextCostAmount: 0.05413,
            contextCostCurrency: "credits",
          },
        }),
      ],
    });
    expect(kiro.contextHeadroom).toMatchObject({
      provenance: "reported",
      value: { usedPercent: 3.671 },
    });
    expect(kiro.usage.value).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      costAmount: 0.05413,
      costCurrency: "credits",
    });
    expect(
      kiro.usage.value?.inputTokens + (kiro.usage.value?.outputTokens ?? 0),
    ).toBe(0);
  });

  it("does not treat a Kiro percentage-only record as a zero-token turn", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "kiro",
      messages: [
        assistantMessage({
          providerId: "kiro",
          model: "auto",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            contextUsedPercent: 12,
          },
        }),
      ],
    });
    expect(summary.usage.value).toBeNull();
    expect(summary.usage.provenance).toBe("unavailable");
    expect(summary.contextHeadroom.value?.usedPercent).toBe(12);
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

describe("task execution summary — agents", () => {
  function activityWithGraph(events: NormalizedProviderEvent[]) {
    const started = startProviderTurnActivity({
      activityByTask: {},
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      now: 1_000,
    });
    const applied = applyProviderTurnActivityEvents({
      activityByTask: started,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: "claude-code",
      events,
      now: 2_000,
    });
    return applied["task-1"] ?? null;
  }

  function spawn(toolUseId: string, agentId: string, description: string) {
    return {
      type: "tool",
      toolName: "Task",
      toolUseId,
      agentId,
      input: JSON.stringify({ description }),
      state: "input-available",
    } as NormalizedProviderEvent;
  }

  it("reports a fan-out as a derived metric rather than a new card", () => {
    const summary = buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [],
      activity: activityWithGraph([
        spawn("toolu_1", "agent_1", "Sweep the callers"),
        spawn("toolu_2", "agent_2", "Check the schema"),
      ]),
    });

    expect(summary.agents.provenance).toBe("derived");
    expect(summary.agents.value?.totalCount).toBe(2);
    expect(summary.agents.value?.label).toBe("2 agents");
    expect(summary.agents.sourceRefs).toEqual(["work-graph:turn-1"]);
  });

  it("separates a main-loop turn from a fan-out that never started", () => {
    // "0 agents" would read as a failed delegation, so a turn with no graph
    // reports unavailable with the reason instead of a zero.
    const summary = buildTaskExecutionSummary({
      providerId: "claude-code",
      messages: [],
      activity: activityWithGraph([
        {
          type: "tool",
          toolName: "Read",
          toolUseId: "toolu_read",
          input: "{}",
          state: "input-available",
        } as NormalizedProviderEvent,
      ]),
    });

    expect(summary.agents.provenance).toBe("unavailable");
    expect(summary.agents.value).toBeNull();
    expect(summary.agents.detail).toBe(
      "This turn is running on the main loop with no delegated agents.",
    );
  });

  it("raises a blocked agent as a caution, not another fact to skim", () => {
    const blocked = activityWithGraph([
      spawn("toolu_1", "agent_1", "Sweep the callers"),
      {
        type: "approval",
        toolName: "Bash",
        requestId: "req-1",
        description: "Run migration?",
        ownerAgentId: "agent_1",
      } as NormalizedProviderEvent,
    ]);

    const artifact = buildTaskReviewArtifact(
      buildTaskExecutionSummary({
        providerId: "claude-code",
        messages: [],
        activity: blocked,
      }),
    );

    expect(artifact.facts).toContain("1 agent · 1 blocked");
    expect(artifact.cautions).toContain("1 agent is waiting on an answer.");
  });
});
