import { describe, expect, test } from "bun:test";
import {
  buildCodexThreadStartedEvents,
  buildCodexConfigOverrides,
  buildCodexTodoPlanText,
  extractProposedPlan,
  looksLikeCodexPlanText,
  mapCodexItemEvent,
  parseCodexMcpServerListJson,
  resolveApprovalPolicy,
  resolveCodexAdditionalDirectories,
  resolveCodexResumeThreadFallback,
  resolveCodexPlanReadyText,
  shouldBufferCompletedCodexPlanCandidate,
} from "../electron/providers/codex-sdk-runtime";

describe("mapCodexItemEvent", () => {
  test("emits a non-streaming reasoning completion event even when there is no final delta", () => {
    const item = {
      id: "reasoning-test-1",
      type: "reasoning",
      text: "thinking text",
    } as const;

    const streamingEvents = mapCodexItemEvent({
      lifecycle: "item.updated",
      item,
    });
    const completedEvents = mapCodexItemEvent({
      lifecycle: "item.completed",
      item,
    });

    expect(streamingEvents).toEqual([
      { type: "thinking", text: "thinking text", isStreaming: true },
    ]);
    expect(completedEvents).toEqual([
      { type: "thinking", text: "", isStreaming: false },
    ]);
  });

  test("emits live TodoWrite tool updates for todo_list items", () => {
    const item = {
      id: "todo-test-1",
      type: "todo_list",
      items: [
        { text: "Investigate logs", completed: true },
        { text: "Patch runtime", completed: false },
      ],
    } as const;

    expect(mapCodexItemEvent({
      lifecycle: "item.updated",
      item,
    })).toEqual([
      {
        type: "tool",
        toolUseId: "todo-test-1",
        toolName: "TodoWrite",
        input: JSON.stringify({
          todos: [
            { content: "Investigate logs", status: "completed" },
            { content: "Patch runtime", status: "pending" },
          ],
        }),
        state: "input-streaming",
      },
    ]);

    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item,
    })).toEqual([
      {
        type: "tool",
        toolUseId: "todo-test-1",
        toolName: "TodoWrite",
        input: JSON.stringify({
          todos: [
            { content: "Investigate logs", status: "completed" },
            { content: "Patch runtime", status: "pending" },
          ],
        }),
        state: "output-available",
      },
    ]);
  });

  test("suppresses inline system messages for file_change items and only surfaces failures", () => {
    expect(mapCodexItemEvent({
      lifecycle: "item.started",
      item: {
        id: "file-change-1",
        type: "file_change",
        changes: [{ path: "src/app.ts" }],
      } as any,
    })).toEqual([]);

    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "file-change-2",
        type: "file_change",
        status: "failed",
        changes: [{ path: "src/app.ts" }],
      } as any,
    })).toEqual([
      {
        type: "error",
        message: "File change failed: src/app.ts",
        recoverable: false,
      },
    ]);
  });

  test("emits plan_ready when agent_message contains <proposed_plan> tags", () => {
    const events = mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plan-test-1",
        type: "agent_message",
        text: "<proposed_plan>\nShip the fix.\n</proposed_plan>",
      },
    } as const);
    expect(events).toEqual([
      { type: "text", text: "<proposed_plan>\nShip the fix.\n</proposed_plan>", segmentId: "plan-test-1" },
      { type: "plan_ready", planText: "Ship the fix." },
    ]);
  });

  test("emits plan_ready for structured plan item on completion", () => {
    // Future-proofing: when Codex CLI exec JSONL emits type:"plan" items
    const events = mapCodexItemEvent({
      lifecycle: "item.completed",
      // Cast because the SDK hasn't added PlanItem to ThreadItem yet
      item: {
        id: "plan-structured-1",
        type: "plan",
        plan_markdown: "## Plan\n- Step 1\n- Step 2",
      } as any,
    });
    expect(events).toEqual([
      { type: "plan_ready", planText: "## Plan\n- Step 1\n- Step 2", sourceSegmentId: "plan-structured-1" },
    ]);
  });

  test("streams plan item text during updates", () => {
    const item = {
      id: "plan-stream-1",
      type: "plan",
      plan_markdown: "Step 1 done",
    } as any;

    const started = mapCodexItemEvent({ lifecycle: "item.started", item });
    expect(started).toEqual([
      { type: "text", text: "Step 1 done", segmentId: "plan-stream-1" },
    ]);

    const updated = mapCodexItemEvent({
      lifecycle: "item.updated",
      item: { ...item, plan_markdown: "Step 1 done\nStep 2 done" },
    });
    expect(updated).toEqual([
      { type: "text", text: "\nStep 2 done", segmentId: "plan-stream-1" },
    ]);

    const completed = mapCodexItemEvent({
      lifecycle: "item.completed",
      item: { ...item, plan_markdown: "Step 1 done\nStep 2 done" },
    });
    expect(completed).toEqual([
      { type: "plan_ready", planText: "Step 1 done\nStep 2 done", sourceSegmentId: "plan-stream-1" },
    ]);
  });

  test("handles empty plan item completion without leaking state", () => {
    const events = mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plan-empty-1",
        type: "plan",
        plan_markdown: "  ",
      } as any,
    });
    expect(events).toEqual([]);
  });

  test("agent_message without <proposed_plan> is still plain text", () => {
    expect(mapCodexItemEvent({
      lifecycle: "item.completed",
      item: {
        id: "plain-msg-1",
        type: "agent_message",
        text: "Just a regular message.",
      },
    } as const)).toEqual([
      { type: "text", text: "Just a regular message.", segmentId: "plain-msg-1" },
    ]);
  });
});

describe("extractProposedPlan", () => {
  test("extracts plan content from valid tags", () => {
    expect(extractProposedPlan("<proposed_plan>\nHello world\n</proposed_plan>")).toBe("Hello world");
  });

  test("returns null when no tags present", () => {
    expect(extractProposedPlan("just regular text")).toBeNull();
  });

  test("returns null when closing tag is missing", () => {
    expect(extractProposedPlan("<proposed_plan>\nincomplete")).toBeNull();
  });

  test("handles plan with surrounding text", () => {
    const text = "Some preamble\n<proposed_plan>\n## My Plan\n- do stuff\n</proposed_plan>\nSome epilogue";
    expect(extractProposedPlan(text)).toBe("## My Plan\n- do stuff");
  });
});

describe("buildCodexTodoPlanText", () => {
  test("formats todo items into markdown plan text", () => {
    expect(buildCodexTodoPlanText({
      items: [
        { text: "Inspect repo layout", completed: true },
        { text: "Implement runtime toggle", completed: false },
      ],
    })).toBe("## Draft Plan\n- [x] Inspect repo layout\n- [ ] Implement runtime toggle");
  });

  test("returns null when todo items are empty or blank", () => {
    expect(buildCodexTodoPlanText({
      items: [{ text: "  ", completed: false }],
    })).toBeNull();
  });
});

describe("resolveCodexPlanReadyText", () => {
  test("prefers a retained final plan even after the pending message was flushed", () => {
    expect(resolveCodexPlanReadyText({
      finalPlanText: "## Final Plan\n- ship it",
      pendingMessageText: null,
      latestTodoPlanText: "## Draft Plan\n- [ ] ignored",
    })).toBe("## Final Plan\n- ship it");
  });

  test("prefers a structured final pending message when available", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: "## Final Plan\n- Ship the patch.",
      latestTodoPlanText: "## Draft Plan\n- [ ] ignored",
    })).toBe("## Final Plan\n- Ship the patch.");
  });

  test("extracts proposed plan text from tagged final messages", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: "<proposed_plan>\n- step 1\n</proposed_plan>",
    })).toBe("- step 1");
  });

  test("falls back to the latest todo-list plan when no final message exists", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: null,
      latestTodoPlanText: "## Draft Plan\n- [ ] step 1",
    })).toBe("## Draft Plan\n- [ ] step 1");
  });

  test("falls back to the todo-list plan when the final message is plain commentary", () => {
    expect(resolveCodexPlanReadyText({
      pendingMessageText: "Let me know if you want me to revise it.",
      latestTodoPlanText: "## Draft Plan\n- [ ] inspect\n- [ ] patch",
    })).toBe("## Draft Plan\n- [ ] inspect\n- [ ] patch");
  });
});

describe("looksLikeCodexPlanText", () => {
  test("accepts multiline and list-style plan text", () => {
    expect(looksLikeCodexPlanText("## Plan\n- Inspect\n- Patch")).toBe(true);
    expect(looksLikeCodexPlanText("Inspect the codebase.\nThen patch the runtime.")).toBe(true);
  });

  test("rejects a short one-line sign-off", () => {
    expect(looksLikeCodexPlanText("Let me know if you want changes.")).toBe(false);
  });
});

describe("shouldBufferCompletedCodexPlanCandidate", () => {
  test("buffers the final completed agent message in plan mode even without plan tags", () => {
    expect(shouldBufferCompletedCodexPlanCandidate({
      planMode: true,
      lifecycle: "item.completed",
      itemType: "agent_message",
      text: "1. Inspect\n2. Patch",
    })).toBe(true);
  });

  test("ignores non-final or empty agent messages", () => {
    expect(shouldBufferCompletedCodexPlanCandidate({
      planMode: true,
      lifecycle: "item.updated",
      itemType: "agent_message",
      text: "1. Inspect\n2. Patch",
    })).toBe(false);
    expect(shouldBufferCompletedCodexPlanCandidate({
      planMode: true,
      lifecycle: "item.completed",
      itemType: "agent_message",
      text: "   ",
    })).toBe(false);
    expect(shouldBufferCompletedCodexPlanCandidate({
      planMode: false,
      lifecycle: "item.completed",
      itemType: "agent_message",
      text: "1. Inspect\n2. Patch",
    })).toBe(false);
  });
});

describe("buildCodexThreadStartedEvents", () => {
  test("always surfaces Codex thread ids as provider conversation metadata", () => {
    expect(buildCodexThreadStartedEvents({
      threadId: "thread-plan-1",
    })).toEqual([
      {
        type: "provider_session",
        providerId: "codex",
        nativeSessionId: "thread-plan-1",
      },
    ]);
  });

  test("ignores empty thread ids", () => {
    expect(buildCodexThreadStartedEvents({
      threadId: "   ",
    })).toEqual([]);
  });
});

describe("resolveCodexAdditionalDirectories", () => {
  test("keeps shared runtime asset directories outside the working root", () => {
    expect(resolveCodexAdditionalDirectories({
      cwd: "/tmp/stave-muse",
      candidates: [
        "/Users/demo/.codex",
        "/Users/demo/.stave",
        "/Users/demo/.codex",
      ],
      pathExists: () => true,
    })).toEqual([
      "/Users/demo/.codex",
      "/Users/demo/.stave",
    ]);
  });

  test("drops candidate directories that already contain the working directory", () => {
    expect(resolveCodexAdditionalDirectories({
      cwd: "/Users/demo/.codex/plugin-cache",
      candidates: [
        "/Users/demo/.codex",
        "/Users/demo/.stave",
      ],
      pathExists: () => true,
    })).toEqual([
      "/Users/demo/.stave",
    ]);
  });
});

describe("parseCodexMcpServerListJson", () => {
  test("parses Codex MCP server JSON output", () => {
    expect(parseCodexMcpServerListJson({
      stdout: JSON.stringify([
        {
          name: "slack",
          enabled: true,
          disabled_reason: null,
          transport: {
            bearer_token_env_var: "SLACK_OAUTH_TOKEN",
          },
        },
      ]),
    })).toEqual([
      {
        name: "slack",
        enabled: true,
        disabled_reason: null,
        transport: {
          bearer_token_env_var: "SLACK_OAUTH_TOKEN",
        },
      },
    ]);
  });

  test("ignores non-json output", () => {
    expect(parseCodexMcpServerListJson({
      stdout: "not-json",
    })).toBeNull();
  });
});

describe("resolveCodexResumeThreadFallback", () => {
  test("preserves persisted resume ids in plan mode", () => {
    expect(resolveCodexResumeThreadFallback({
      runtimeOptions: {
        codexPlanMode: true,
        codexResumeThreadId: "thread-plan-1",
      },
    })).toBe("thread-plan-1");
  });

  test("falls back to the canonical conversation resume id in plan mode", () => {
    expect(resolveCodexResumeThreadFallback({
      runtimeOptions: {
        codexPlanMode: true,
      },
      conversation: {
        target: {
          providerId: "codex",
          model: "gpt-5.4",
        },
        mode: "chat",
        history: [{
          role: "assistant",
          providerId: "codex",
          model: "gpt-5.4",
          content: "Patched the runtime.",
          parts: [{ type: "text", text: "Patched the runtime." }],
        }],
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "Continue.",
          parts: [{ type: "text", text: "Continue." }],
        },
        contextParts: [],
        resume: {
          nativeSessionId: "thread-plan-2",
        },
      },
    })).toBe("thread-plan-2");
  });
});

describe("buildCodexConfigOverrides", () => {
  test("returns explicit Codex config overrides including raw reasoning on", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexShowRawReasoning: true,
        codexReasoningSummary: "detailed",
        codexReasoningSummarySupport: "enabled",
      },
    })).toEqual({
      show_raw_agent_reasoning: true,
      model_reasoning_summary: "detailed",
      model_supports_reasoning_summaries: true,
    });
  });

  test("moves Codex response formatting and base prompts into developer instructions", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        claudeSystemPrompt: "Project rules",
        responseStylePrompt: "Use concise markdown.",
      },
    })).toEqual({
      developer_instructions: "Project rules\n\nUse concise markdown.",
    });
  });

  test("keeps an explicit raw reasoning off toggle so the UI can disable it reliably", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexShowRawReasoning: false,
        responseStylePrompt: "Use concise markdown.",
        codexReasoningSummary: "auto",
        codexReasoningSummarySupport: "auto",
      },
    })).toEqual({
      developer_instructions: "Use concise markdown.",
      show_raw_agent_reasoning: false,
    });
  });

  test("omits auto/default Codex config values when no explicit toggle is present", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexReasoningSummary: "auto",
        codexReasoningSummarySupport: "auto",
      },
    })).toBeUndefined();
  });

  test("adds plan-mode config overrides for experimental Codex plan mode", () => {
    expect(buildCodexConfigOverrides({
      runtimeOptions: {
        codexPlanMode: true,
        codexReasoningEffort: "low",
      },
    })).toEqual({
      collaboration_mode_kind: "plan",
      plan_mode_reasoning_effort: "low",
    });
  });
});

describe("resolveApprovalPolicy", () => {
  test("returns undefined for unknown approval modes", () => {
    expect(resolveApprovalPolicy({ runtimeValue: undefined })).toBeUndefined();
    expect(resolveApprovalPolicy({ envValue: "bogus-policy" })).toBeUndefined();
  });

  test("forces never in plan mode when a fallback policy is provided", () => {
    expect(resolveApprovalPolicy({
      runtimeValue: "on-request",
      planMode: true,
      fallback: "on-request",
    })).toBe("never");
  });
});
