import { describe, expect, test } from "bun:test";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import {
  getTurnModelInfoLabel,
  resolveTurnModelInfo,
} from "@/lib/providers/turn-model-info";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import { WorkspaceSnapshotSchema } from "@/lib/task-context/schemas";
import { buildPendingProviderTurnState } from "@/store/chat-state-helpers";
import type { ChatMessage } from "@/types/chat";

describe("turn model info", () => {
  test("captures the effective Claude effort and fast mode", () => {
    expect(
      resolveTurnModelInfo({
        providerId: "claude-code",
        runtimeOptions: {
          claudeEffort: "xhigh",
          claudeFastMode: false,
        },
      }),
    ).toEqual({
      effort: "xhigh",
      fastMode: false,
    });
  });

  test("normalizes legacy Codex minimal effort to the executed low effort", () => {
    expect(
      resolveTurnModelInfo({
        providerId: "codex",
        runtimeOptions: {
          codexReasoningEffort: "minimal",
          codexFastMode: true,
        },
      }),
    ).toEqual({
      effort: "low",
      fastMode: true,
    });
  });

  test("captures and labels the Kiro effort", () => {
    expect(
      resolveTurnModelInfo({
        providerId: "kiro",
        runtimeOptions: { kiroEffort: "xhigh" },
      }),
    ).toEqual({ effort: "xhigh", fastMode: false });
    expect(
      getTurnModelInfoLabel({
        providerId: "kiro",
        model: "kiro-model",
        modelInfo: { effort: "xhigh", fastMode: false },
      }),
    ).toBe("Kiro Model · X-High");
  });

  test("formats Claude 1M context and effort in the model chip", () => {
    expect(
      getTurnModelInfoLabel({
        providerId: "claude-code",
        model: "claude-opus-4-8[1m]",
        modelInfo: {
          effort: "xhigh",
          fastMode: false,
        },
      }),
    ).toBe("Claude Opus 4.8 (1M) · X-High");
  });

  test("formats Codex effort and enabled fast mode in the model chip", () => {
    expect(
      getTurnModelInfoLabel({
        providerId: "codex",
        model: "gpt-5.6-terra",
        modelInfo: {
          effort: "ultra",
          fastMode: true,
        },
      }),
    ).toBe("GPT-5.6 Terra · Ultra · Fast");
  });

  test("keeps legacy messages on the model-only label", () => {
    const model = "gpt-5.4";
    expect(
      getTurnModelInfoLabel({
        providerId: "codex",
        model,
      }),
    ).toBe(toHumanModelName({ model }));
  });

  test("stores model info on the pending assistant message", () => {
    const pending = buildPendingProviderTurnState({
      tasks: [
        {
          id: "task-1",
          title: "Task",
          provider: "codex",
          updatedAt: "2026-07-24T00:00:00.000Z",
          unread: false,
          controlMode: "interactive",
          controlOwner: "stave",
        },
      ],
      messagesByTask: { "task-1": [] },
      messageCountByTask: { "task-1": 0 },
      activeTurnIdsByTask: {},
      taskWorkspaceIdById: {},
      workspaceSnapshotVersion: 0,
      taskId: "task-1",
      taskWorkspaceId: "workspace-1",
      turnId: "turn-1",
      provider: "codex",
      activeModel: "gpt-5.6-terra",
      modelInfo: {
        effort: "xhigh",
        fastMode: true,
      },
      content: "Implement it.",
    });

    expect(pending.messagesByTask["task-1"]?.at(-1)?.modelInfo).toEqual({
      effort: "xhigh",
      fastMode: true,
    });
  });

  test("keeps model info when a workspace snapshot is parsed", () => {
    const parsed = WorkspaceSnapshotSchema.parse({
      activeTaskId: "task-1",
      tasks: [
        {
          id: "task-1",
          title: "Task",
          provider: "claude-code",
          updatedAt: "2026-07-24T00:00:00.000Z",
          unread: false,
        },
      ],
      messagesByTask: {
        "task-1": [
          {
            id: "task-1-m-1",
            role: "assistant",
            providerId: "claude-code",
            model: "claude-opus-4-8[1m]",
            modelInfo: {
              effort: "xhigh",
              fastMode: false,
            },
            content: "Done.",
            parts: [{ type: "text", text: "Done." }],
          },
        ],
      },
    });

    expect(parsed.messagesByTask["task-1"]?.[0]?.modelInfo).toEqual({
      effort: "xhigh",
      fastMode: false,
    });
  });

  test("copies turn model info to a dedicated plan response", () => {
    const message: ChatMessage = {
      id: "task-1-m-1",
      role: "assistant",
      providerId: "codex",
      model: "gpt-5.6-terra",
      modelInfo: {
        effort: "xhigh",
        fastMode: true,
      },
      content: "I have a plan ready.",
      isStreaming: true,
      parts: [{ type: "text", text: "I have a plan ready." }],
    };
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [message],
      events: [
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.6-terra",
    });

    expect(replayed.messages).toHaveLength(2);
    expect(replayed.messages[1]?.modelInfo).toEqual(message.modelInfo);
  });
});
