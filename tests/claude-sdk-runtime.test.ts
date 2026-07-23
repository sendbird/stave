import { describe, expect, test } from "bun:test";
import {
  buildClaudeApprovalPermissionResult,
  buildClaudeApprovalTimeoutBridgeEvent,
  buildClaudeQueryOptions,
  CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  claudeForegroundSubagentPreToolUseHook,
  ClaudeToolDecisionTimeoutError,
  resolveClaudeForegroundSubagentInput,
  resolveClaudeAgentProgressSummaries,
  resolveClaudeApprovalDecisionTimeoutMs,
  resolveClaudePermissionModeDecision,
  buildClaudeSystemPrompt,
  buildClaudeUserInputPermissionResult,
  extractClaudeRequestedSkillSlug,
  mapClaudeMessageToEvents,
  parseClaudeQuestionList,
  parseClaudeRouteClassificationJson,
  resolveClaudeDisallowedTools,
  resolveClaudePlanModeApprovalScope,
  shouldAutoAllowClaudeTool,
  shouldAutoAllowPlanModeScopedTool,
  shouldDenyClaudePostPlanTool,
  isReadOnlyMcpLeafToolName,
  shouldRedirectClaudePreloadedSkillToolUse,
  shouldDenyClaudeToolInPlanMode,
  SubagentProgressTracker,
  waitForClaudeToolDecision,
} from "../electron/providers/claude-sdk-runtime";

const workspaceRoot = "/workspace/stave";

describe("parseClaudeRouteClassificationJson", () => {
  test("parses strict route classification JSON", () => {
    expect(
      parseClaudeRouteClassificationJson(
        '{"taskType":"plan","complexity":"high","recommendedTier":"heavy","confidence":0.82,"rationale":"planning","stick":false}',
      ),
    ).toEqual({
      ok: true,
      classification: {
        taskType: "plan",
        complexity: "high",
        recommendedTier: "heavy",
        confidence: 0.82,
        rationale: "planning",
        stick: false,
      },
    });
  });

  test("returns ok false for malformed route classification JSON", () => {
    expect(parseClaudeRouteClassificationJson("not json")).toEqual({
      ok: false,
    });
    expect(
      parseClaudeRouteClassificationJson(
        '{"taskType":"unknown","complexity":"high","recommendedTier":"heavy","confidence":0.82}',
      ),
    ).toEqual({ ok: false });
  });
});

describe("mapClaudeMessageToEvents", () => {
  test("surfaces Claude init session ids as provider conversation metadata", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "init",
        session_id: "session-1",
        uuid: "msg-init-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "provider_session",
        providerId: "claude-code",
        nativeSessionId: "session-1",
      },
    ]);
  });

  test("surfaces Claude local command output as assistant text", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "local_command_output",
        content: "Current cost: $0.12",
        uuid: "msg-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "text", text: "Current cost: $0.12" },
    ]);
  });

  test("surfaces Claude task progress summaries as system events", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "task_progress",
        summary: "Analyzing authentication module",
        uuid: "msg-progress-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "system", content: "Subagent progress: Analyzing authentication module" },
    ]);
  });

  test("surfaces compact_boundary as a system event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "manual", pre_tokens: 50000 },
        uuid: "msg-compact-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "system",
        content: "Context compacted (manual).",
        compactBoundary: { trigger: "manual" },
      },
    ]);
  });

  test("surfaces compact_boundary with auto trigger", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "compact_boundary",
        compact_metadata: { trigger: "auto", pre_tokens: 80000 },
        uuid: "msg-compact-2",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "system",
        content: "Context compacted (auto).",
        compactBoundary: { trigger: "auto" },
      },
    ]);
  });

  test("surfaces compacting status as a system event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "status",
        status: "compacting",
        uuid: "msg-status-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "system", content: "Compacting conversation context\u2026" },
    ]);
  });

  test("ignores null status messages", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "system",
        subtype: "status",
        status: null,
        uuid: "msg-status-2",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([]);
  });

  test("surfaces tool_progress as a tool_progress event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "tool_progress",
        tool_use_id: "tool-abc",
        tool_name: "Bash",
        parent_tool_use_id: null,
        elapsed_time_seconds: 15,
        uuid: "msg-tp-1",
        session_id: "session-1",
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      { type: "tool_progress", toolUseId: "tool-abc", toolName: "Bash", elapsedSeconds: 15 },
    ]);
  });

  test("surfaces ExitPlanMode tool use as a plan_ready event", () => {
    const events = mapClaudeMessageToEvents({
      message: {
        type: "assistant",
        message: {
          content: [{
            type: "tool_use",
            name: "ExitPlanMode",
            input: {
              plan: "1. Inspect the task\n2. Ship the patch",
            },
          }],
        },
      } as never,
      claudeDebugStream: false,
    });

    expect(events).toEqual([
      {
        type: "plan_ready",
        planText: "1. Inspect the task\n2. Ship the patch",
      },
    ]);
  });

  test("surfaces streamed ExitPlanMode input_json_delta as an early plan_ready event", () => {
    const planState = {
      exitPlanBlocksByIndex: new Map(),
    };

    const startEvents = mapClaudeMessageToEvents({
      message: {
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "tool-plan-1",
            name: "ExitPlanMode",
            input: {},
          },
        },
      } as never,
      claudeDebugStream: false,
      planState,
    });

    const deltaEvents = mapClaudeMessageToEvents({
      message: {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: "{\"plan\":\"1. Inspect the task\\n2. Ship the patch\"}",
          },
        },
      } as never,
      claudeDebugStream: false,
      planState,
    });

    const stopEvents = mapClaudeMessageToEvents({
      message: {
        type: "stream_event",
        event: {
          type: "content_block_stop",
          index: 0,
        },
      } as never,
      claudeDebugStream: false,
      planState,
    });

    expect(startEvents).toEqual([]);
    expect(deltaEvents).toEqual([
      {
        type: "plan_ready",
        planText: "1. Inspect the task\n2. Ship the patch",
        sourceSegmentId: "tool-plan-1",
      },
    ]);
    expect(stopEvents).toEqual([]);
  });
});

describe("buildClaudeApprovalPermissionResult", () => {
  test("returns an allow payload with updated input for approved tools", () => {
    expect(buildClaudeApprovalPermissionResult({
      approved: true,
      normalizedInput: { skill: "keybindings-help" },
      denialMessage: "denied",
    })).toEqual({
      behavior: "allow",
      updatedInput: { skill: "keybindings-help" },
    });
  });

  test("returns a deny payload with a message for rejected tools", () => {
    expect(buildClaudeApprovalPermissionResult({
      approved: false,
      normalizedInput: { file_path: "/tmp/demo" },
      denialMessage: "User denied permission for Read.",
    })).toEqual({
      behavior: "deny",
      message: "User denied permission for Read.",
    });
  });
});

describe("buildClaudeUserInputPermissionResult", () => {
  test("returns an allow payload with merged answers for approved question responses", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: {
        questions: [{ header: "Name", question: "Who?", options: [{ label: "A", description: "A" }] }],
      },
      answers: { name: "Asty" },
    })).toEqual({
      behavior: "allow",
      updatedInput: {
        questions: [{ header: "Name", question: "Who?", options: [{ label: "A", description: "A" }] }],
        answers: { name: "Asty" },
      },
    });
  });

  test("returns a deny payload when the user declines to answer", () => {
    expect(buildClaudeUserInputPermissionResult({
      normalizedInput: { questions: [] },
      denied: true,
    })).toEqual({
      behavior: "deny",
      message: "User declined to answer questions.",
    });
  });
});

describe("activated skill tool redirection", () => {
  test("extracts the requested skill slug from skill tool input", () => {
    expect(extractClaudeRequestedSkillSlug({
      input: {
        command: "/stave-release patch",
      },
    })).toBe("stave-release");
  });

  test("extracts the requested skill slug from nested skill tool input", () => {
    expect(extractClaudeRequestedSkillSlug({
      input: {
        input: {
          name: "$reviewer",
        },
      },
    })).toBe("reviewer");
  });

  test("redirects Skill tool usage for already activated stave skills", () => {
    expect(shouldRedirectClaudePreloadedSkillToolUse({
      toolName: "Skill",
      input: {
        skill: "stave-release",
      },
      preloadedSkillSlugs: new Set(["stave-release"]),
    })).toBe("stave-release");
  });

  test("allows Skill tool usage when the requested skill was not preloaded by stave", () => {
    expect(shouldRedirectClaudePreloadedSkillToolUse({
      toolName: "Skill",
      input: {
        skill: "commit",
      },
      preloadedSkillSlugs: new Set(["stave-release"]),
    })).toBeNull();
  });
});

describe("Claude internal tool auto-allow", () => {
  test("auto-allows ExitPlanMode without surfacing an approval wait", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "ExitPlanMode",
      permissionMode: "default",
    })).toBe(true);
  });

  test("auto-allows managed Stave workspace-information MCP tools", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "stave_replace_workspace_notes",
      permissionMode: "default",
    })).toBe(true);
    expect(shouldAutoAllowClaudeTool({
      toolName: "mcp__stave-local-mcp__stave_add_workspace_todo",
      permissionMode: "default",
    })).toBe(true);
  });

  test("auto-allows mutating file tools in Claude auto mode", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "Edit",
      permissionMode: "auto",
    })).toBe(true);
    expect(shouldAutoAllowClaudeTool({
      toolName: "Write",
      permissionMode: "auto",
    })).toBe(true);
  });

  test("auto-allows mutating file tools in Claude acceptEdits mode", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "Edit",
      permissionMode: "acceptEdits",
    })).toBe(true);
  });

  test("does not auto-allow Bash in Claude auto mode", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "Bash",
      permissionMode: "auto",
    })).toBe(false);
  });

  test("does not auto-allow ordinary tools", () => {
    expect(shouldAutoAllowClaudeTool({
      toolName: "Bash",
      permissionMode: "default",
    })).toBe(false);
  });
});

describe("Claude permission mode decisions", () => {
  test("denies unapproved tools without prompting in dontAsk mode", () => {
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "dontAsk",
      toolName: "Bash",
    })).toBe("deny");
  });

  test("auto-allows all tools in bypassPermissions mode", () => {
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "bypassPermissions",
      toolName: "Bash",
    })).toBe("allow");
  });

  test("auto-allows Claude Code read-only built-in tools in plan mode", () => {
    for (const toolName of [
      "Read",
      "Grep",
      "Glob",
      "LS",
      "NotebookRead",
      "WebFetch",
      "WebSearch",
      "BashOutput",
      "TodoRead",
    ]) {
      expect(resolveClaudePermissionModeDecision({
        permissionMode: "plan",
        toolName,
      })).toBe("allow");
      expect(shouldAutoAllowClaudeTool({
        permissionMode: "plan",
        toolName,
      })).toBe(true);
    }
  });

  test("still prompts for read-only built-in tools outside plan/bypass modes", () => {
    // In default mode the user explicitly asked to be consulted — Read should
    // still prompt there.
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "default",
      toolName: "Read",
    })).toBe("prompt");
    // In acceptEdits/auto the read-only fast-path is intentionally not taken,
    // because those modes only relax *mutating* tool approvals; this test pins
    // the current behaviour so future relaxations are deliberate.
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "acceptEdits",
      toolName: "Read",
    })).toBe("prompt");
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "auto",
      toolName: "Read",
    })).toBe("prompt");
  });

  test("decision function still returns prompt for Bash in plan mode", () => {
    // The decision function must NOT short-circuit Bash to "allow" in plan
    // mode: the canUseTool flow first runs the mutating-command hard-deny
    // (shouldDenyClaudeToolInPlanMode), and only then may auto-allow a
    // *non-mutating* Bash command based on the plan-mode approval scope
    // (shouldAutoAllowPlanModeScopedTool). Keeping this "prompt" preserves
    // that ordering so mutating commands are always inspected first.
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "plan",
      toolName: "Bash",
    })).toBe("prompt");
  });

  test("auto-allows TodoWrite in plan mode because it does not mutate the filesystem", () => {
    // TodoWrite only mutates the in-session todo tracker, so hard-denying it
    // just broke the agent's own progress tracking and caused mid-plan
    // stalls.
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "plan",
      toolName: "TodoWrite",
    })).toBe("allow");
    expect(shouldAutoAllowClaudeTool({
      permissionMode: "plan",
      toolName: "TodoWrite",
    })).toBe(true);
  });
});

describe("resolveClaudePlanModeApprovalScope", () => {
  test("uses the runtime value when valid", () => {
    expect(
      resolveClaudePlanModeApprovalScope({ runtimeValue: "bash" }),
    ).toBe("bash");
  });

  test("falls back to the env value when no runtime value", () => {
    expect(
      resolveClaudePlanModeApprovalScope({ envValue: "bashAndTask" }),
    ).toBe("bashAndTask");
  });

  test("defaults to the broadest scope for missing or invalid input", () => {
    expect(resolveClaudePlanModeApprovalScope({})).toBe("bashTaskAndMcp");
    expect(
      resolveClaudePlanModeApprovalScope({ runtimeValue: undefined, envValue: "nope" }),
    ).toBe("bashTaskAndMcp");
  });
});

describe("isReadOnlyMcpLeafToolName", () => {
  test("classifies read-verb tool names as read-only", () => {
    for (const leaf of [
      "get_file_contents",
      "slack_search_public",
      "stave_lens_get_html",
      "stave_lens_screenshot",
      "list_issues",
      "searchJiraIssuesUsingJql",
    ]) {
      expect(isReadOnlyMcpLeafToolName(leaf)).toBe(true);
    }
  });

  test("treats write-verb tool names as not read-only", () => {
    for (const leaf of [
      "create_pull_request",
      "slack_send_message",
      "stave_lens_navigate",
      "stave_lens_fill_saved_account",
      "stave_lens_evaluate",
      "editJiraIssue",
      "merge_pull_request",
    ]) {
      expect(isReadOnlyMcpLeafToolName(leaf)).toBe(false);
    }
  });

  test("returns false when no read verb is present", () => {
    expect(isReadOnlyMcpLeafToolName("whatever")).toBe(false);
    expect(isReadOnlyMcpLeafToolName("")).toBe(false);
  });
});

describe("shouldAutoAllowPlanModeScopedTool", () => {
  test("strict scope never auto-allows extra tools", () => {
    for (const toolName of ["Bash", "Task", "mcp__claude_ai_Github__get_me"]) {
      expect(
        shouldAutoAllowPlanModeScopedTool({
          scope: "strict",
          toolName,
          input: { command: "git status" },
        }),
      ).toBe(false);
    }
  });

  test("bash scope auto-allows non-mutating Bash only", () => {
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bash",
        toolName: "Bash",
        input: { command: "git status" },
      }),
    ).toBe(true);
    // Mutating Bash is hard-denied upstream; the helper also refuses it.
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bash",
        toolName: "Bash",
        input: { command: "rm -rf build" },
      }),
    ).toBe(false);
    // Task and MCP are not part of the "bash" scope.
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bash",
        toolName: "Task",
        input: {},
      }),
    ).toBe(false);
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bash",
        toolName: "mcp__claude_ai_Github__get_me",
        input: {},
      }),
    ).toBe(false);
  });

  test("bashAndTask scope adds subagents but not MCP", () => {
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bashAndTask",
        toolName: "Task",
        input: {},
      }),
    ).toBe(true);
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bashAndTask",
        toolName: "mcp__claude_ai_Github__get_me",
        input: {},
      }),
    ).toBe(false);
  });

  test("bashTaskAndMcp scope adds read-only MCP tools", () => {
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bashTaskAndMcp",
        toolName: "mcp__claude_ai_Github__get_file_contents",
        input: {},
      }),
    ).toBe(true);
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bashTaskAndMcp",
        toolName: "Task",
        input: {},
      }),
    ).toBe(true);
    // Mutating-looking MCP tools still prompt.
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bashTaskAndMcp",
        toolName: "mcp__claude_ai_Github__create_pull_request",
        input: {},
      }),
    ).toBe(false);
    // Stave workspace MCP tools are auto-allowed elsewhere, so they are not
    // matched as read-only by name here (they carry no read verb).
    expect(
      shouldAutoAllowPlanModeScopedTool({
        scope: "bashTaskAndMcp",
        toolName: "Bash",
        input: { command: "cat package.json" },
      }),
    ).toBe(true);
  });
});

describe("shouldDenyClaudePostPlanTool", () => {
  test("denies post-plan tool calls in plan mode so the turn ends", () => {
    for (const toolName of [
      "Bash",
      "Write",
      "Task",
      "Read",
      "mcp__claude_ai_Github__get_me",
    ]) {
      expect(
        shouldDenyClaudePostPlanTool({
          permissionMode: "plan",
          planPresented: true,
          toolName,
        }),
      ).toBe(true);
    }
  });

  test("still allows re-presenting an updated plan via ExitPlanMode", () => {
    expect(
      shouldDenyClaudePostPlanTool({
        permissionMode: "plan",
        planPresented: true,
        toolName: "ExitPlanMode",
      }),
    ).toBe(false);
  });

  test("does not gate tools before a plan is presented", () => {
    expect(
      shouldDenyClaudePostPlanTool({
        permissionMode: "plan",
        planPresented: false,
        toolName: "Bash",
      }),
    ).toBe(false);
  });

  test("never gates outside plan mode", () => {
    for (const permissionMode of [
      "default",
      "acceptEdits",
      "auto",
      "bypassPermissions",
    ] as const) {
      expect(
        shouldDenyClaudePostPlanTool({
          permissionMode,
          planPresented: true,
          toolName: "Bash",
        }),
      ).toBe(false);
    }
  });
});

describe("buildClaudeSystemPrompt", () => {
  test("returns string[] with cache boundary marker", () => {
    const parts = buildClaudeSystemPrompt({ cwd: workspaceRoot });
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBe(3);
    // The second element must be the dynamic boundary sentinel.
    expect(parts[1]).toBe("__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__");
  });

  test("anchors relative paths to the active workspace root", () => {
    const parts = buildClaudeSystemPrompt({ cwd: workspaceRoot });
    const joined = parts.join("\n\n");
    expect(joined).toContain(`Current workspace root: ${workspaceRoot}`);
  });

  test("places base system prompt in the static (cacheable) prefix", () => {
    const parts = buildClaudeSystemPrompt({
      cwd: workspaceRoot,
      baseSystemPrompt: "Follow repository conventions.",
    });

    // Base system prompt lives in the static (cacheable) prefix, parts[0].
    expect(parts[0]).toContain("Follow repository conventions.");
    // Workspace context sits in the dynamic suffix (parts[2]).
    expect(parts[2]).toContain("Resolve every relative filesystem path against the workspace root above.");
  });

  test("always includes the Stave turn-behavior guardrail in the static prefix", () => {
    const parts = buildClaudeSystemPrompt({ cwd: workspaceRoot });
    // Guardrail is always present even when no base prompt is provided.
    expect(parts[0]).toContain("Stave runtime constraints");
    expect(parts[0]).toContain("AskUserQuestion");
    // Background-notification guardrail: turns must not end waiting on
    // background subagent / task completion notifications.
    expect(parts[0]).toContain("run_in_background: false");
  });
});

describe("resolveClaudeForegroundSubagentInput", () => {
  test("forces run_in_background to false when explicitly true", () => {
    const updated = resolveClaudeForegroundSubagentInput({
      toolName: "Agent",
      input: { prompt: "do work", run_in_background: true },
    });
    expect(updated).toEqual({ prompt: "do work", run_in_background: false });
  });

  test("forces run_in_background to false when omitted (background-by-default CLIs)", () => {
    const updated = resolveClaudeForegroundSubagentInput({
      toolName: "Agent",
      input: { prompt: "do work" },
    });
    expect(updated).toEqual({ prompt: "do work", run_in_background: false });
  });

  test("returns undefined when the call is already foreground", () => {
    expect(
      resolveClaudeForegroundSubagentInput({
        toolName: "Agent",
        input: { prompt: "do work", run_in_background: false },
      }),
    ).toBeUndefined();
  });

  test("leaves remote-isolation agents untouched (always background at CLI level)", () => {
    expect(
      resolveClaudeForegroundSubagentInput({
        toolName: "Agent",
        input: { prompt: "do work", isolation: "remote" },
      }),
    ).toBeUndefined();
  });

  test("never rewrites other tools, including background Bash", () => {
    expect(
      resolveClaudeForegroundSubagentInput({
        toolName: "Bash",
        input: { command: "bun run dev", run_in_background: true },
      }),
    ).toBeUndefined();
  });

  test("ignores malformed non-object inputs", () => {
    expect(
      resolveClaudeForegroundSubagentInput({ toolName: "Agent", input: null }),
    ).toBeUndefined();
    expect(
      resolveClaudeForegroundSubagentInput({
        toolName: "Agent",
        input: "prompt",
      }),
    ).toBeUndefined();
  });
});

describe("claudeForegroundSubagentPreToolUseHook", () => {
  const signal = new AbortController().signal;
  const baseHookInput = {
    session_id: "session",
    transcript_path: "/tmp/transcript",
    cwd: workspaceRoot,
  };

  test("returns updatedInput without a permissionDecision for Agent calls", async () => {
    const output = await claudeForegroundSubagentPreToolUseHook(
      {
        ...baseHookInput,
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_input: { prompt: "do work", run_in_background: true },
        tool_use_id: "toolu_1",
      } as Parameters<typeof claudeForegroundSubagentPreToolUseHook>[0],
      "toolu_1",
      { signal },
    );

    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { prompt: "do work", run_in_background: false },
      },
    });
    // The permission flow (canUseTool / plan-mode gates) must still run for
    // the rewritten call, so the hook never emits a permissionDecision.
    expect(output.hookSpecificOutput).not.toHaveProperty("permissionDecision");
  });

  test("is a no-op for non-Agent tools", async () => {
    const output = await claudeForegroundSubagentPreToolUseHook(
      {
        ...baseHookInput,
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "bun run dev", run_in_background: true },
        tool_use_id: "toolu_2",
      } as Parameters<typeof claudeForegroundSubagentPreToolUseHook>[0],
      "toolu_2",
      { signal },
    );

    expect(output).toEqual({});
  });
});

describe("resolveClaudeAgentProgressSummaries", () => {
  test("preserves explicit false so the SDK can be forced off", () => {
    expect(resolveClaudeAgentProgressSummaries(false)).toBe(false);
  });

  test("returns undefined when no override is set", () => {
    expect(resolveClaudeAgentProgressSummaries(undefined)).toBeUndefined();
  });
});

describe("buildClaudeQueryOptions", () => {
  test("omits resumeSessionAt when no Claude session is being resumed", () => {
    const options = buildClaudeQueryOptions({
      cwd: workspaceRoot,
      claudeExecutablePath: "",
      runtimeOptions: {
        claudeResumeSessionAt: "message-uuid",
      },
    });

    expect(options).not.toHaveProperty("resume");
    expect(options).not.toHaveProperty("resumeSessionAt");
  });

  test("omits forkSession when no Claude session is being resumed", () => {
    const options = buildClaudeQueryOptions({
      cwd: workspaceRoot,
      claudeExecutablePath: "",
      runtimeOptions: {
        claudeForkSession: true,
      },
    });

    expect(options).not.toHaveProperty("resume");
    expect(options).not.toHaveProperty("forkSession");
  });

  test("forwards resumeSessionAt only with a Claude resume session id", () => {
    const options = buildClaudeQueryOptions({
      cwd: workspaceRoot,
      claudeExecutablePath: "",
      resume: "session-id",
      runtimeOptions: {
        claudeForkSession: true,
        claudeResumeSessionAt: "message-uuid",
      },
    });

    expect(options).toMatchObject({
      resume: "session-id",
      forkSession: true,
      resumeSessionAt: "message-uuid",
    });
  });

  test("always registers the foreground-subagent PreToolUse hook", () => {
    const options = buildClaudeQueryOptions({
      cwd: workspaceRoot,
      claudeExecutablePath: "",
    });

    expect(options.hooks?.PreToolUse).toEqual([
      {
        matcher: "^Agent$",
        hooks: [claudeForegroundSubagentPreToolUseHook],
      },
    ]);
  });

  test("omits fallbackModel when it matches the primary model", () => {
    const options = buildClaudeQueryOptions({
      cwd: workspaceRoot,
      claudeExecutablePath: "",
      runtimeOptions: {
        model: "claude-sonnet-4-6",
        claudeFallbackModel: "claude-sonnet-4-6",
      },
    });

    expect(options).toMatchObject({
      model: "claude-sonnet-4-6",
    });
    expect(options).not.toHaveProperty("fallbackModel");
  });

  test("removes duplicate and primary models from fallbackModel lists", () => {
    const options = buildClaudeQueryOptions({
      cwd: workspaceRoot,
      claudeExecutablePath: "",
      runtimeOptions: {
        model: "claude-sonnet-4-6",
        claudeFallbackModel:
          "claude-sonnet-4-6, claude-haiku-4-5, claude-haiku-4-5",
      },
    });

    expect(options).toMatchObject({
      model: "claude-sonnet-4-6",
      fallbackModel: "claude-haiku-4-5",
    });
  });
});

describe("resolveClaudeDisallowedTools", () => {
  test("adds mutating file tools while Claude plan mode is enabled", () => {
    // Write is NOT in the blanket disallow list: the per-call
    // shouldDenyClaudeToolInPlanMode gate can allow Write to handoff plan
    // files. Edit / MultiEdit / NotebookEdit always target existing source
    // files, so they stay globally blocked in plan mode.
    expect(resolveClaudeDisallowedTools({
      permissionMode: "plan",
      runtimeDisallowedTools: ["Read", "Edit"],
    })).toEqual([
      "Read",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
    ]);
  });

  test("keeps Write callable in plan mode so the handoff gate can decide", () => {
    const disallowed = resolveClaudeDisallowedTools({
      permissionMode: "plan",
      runtimeDisallowedTools: [],
    });
    expect(disallowed).not.toContain("Write");
    expect(disallowed).toEqual(
      expect.arrayContaining(["Edit", "MultiEdit", "NotebookEdit"]),
    );
  });

  test("preserves runtime disallowed tools outside plan mode", () => {
    expect(resolveClaudeDisallowedTools({
      permissionMode: "default",
      runtimeDisallowedTools: ["Read"],
    })).toEqual(["Read"]);
  });

  test("does not disable TodoWrite in plan mode", () => {
    // TodoWrite is auto-allowed in plan mode, so the disallowed-tools list
    // must not drop it back onto the deny side.
    expect(resolveClaudeDisallowedTools({
      permissionMode: "plan",
      runtimeDisallowedTools: [],
    })).not.toContain("TodoWrite");
  });
});

describe("shouldDenyClaudeToolInPlanMode", () => {
  test("denies mutating built-in tools", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Edit",
      input: { file_path: "/workspace/stave/src/app.ts" },
    })).toBe(true);
  });

  test("denies mutating Bash commands", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Bash",
      input: { command: "echo hi > notes.txt" },
    })).toBe(true);
  });

  test("allows read-only Bash commands", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Bash",
      input: { command: "ls -la src" },
    })).toBe(false);
  });

  test("allows non-mutating read tools", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Read",
      input: { file_path: "/workspace/stave/README.md" },
    })).toBe(false);
  });

  test("does not hard-deny TodoWrite in plan mode", () => {
    // TodoWrite mutates only the in-session todo tracker, so plan mode must
    // let it through.
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "TodoWrite",
      input: { todos: [] },
    })).toBe(false);
  });

  test("allows Write when the target is a workspace handoff plan file", () => {
    // The workspace handoff convention requires writing a plan file under
    // .stave/context/plans/**. Plan mode must make a per-call exception for
    // that exact path so the convention is actually followable.
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Write",
      input: {
        file_path:
          "/workspace/stave/.stave/context/plans/abcd1234_2026-04-01T01-02-03.md",
        content: "## Plan\n- Do the thing",
      },
    })).toBe(false);
  });

  test("still denies Write for non-handoff targets in plan mode", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Write",
      input: {
        file_path: "/workspace/stave/src/app.ts",
        content: "export const a = 1;",
      },
    })).toBe(true);
  });

  test("allows Write to a handoff plan file with a relative path", () => {
    expect(shouldDenyClaudeToolInPlanMode({
      toolName: "Write",
      input: {
        file_path: ".stave/context/plans/abcd1234_2026-04-01T01-02-03.md",
        content: "## Plan\n- Ship",
      },
    })).toBe(false);
  });
});

describe("SubagentProgressTracker", () => {
  test("resolves toolUseId from tracked Agent tool events (positional fallback)", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    expect(tracker.resolveToolUseId({})).toBe("toolu_1");
  });

  test("returns the most recent active Agent when multiple are pending", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });
    expect(tracker.resolveToolUseId({})).toBe("toolu_2");
  });

  test("removes completed agents from tracking", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool_result", tool_use_id: "toolu_2", output: "done" });
    expect(tracker.resolveToolUseId({})).toBe("toolu_1");
  });

  test("ignores non-agent tool events", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "Bash", toolUseId: "toolu_bash", input: "ls", state: "input-streaming" });
    expect(tracker.resolveToolUseId({})).toBeUndefined();
  });

  test("correlates via agent_id from hook metadata", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });

    // Hook message maps agent_id "A" to toolu_1
    tracker.processRawMessage({
      type: "hook_started",
      input: { agent_id: "A", tool_use_id: "toolu_1" },
    });
    // Hook message maps agent_id "B" to toolu_2
    tracker.processRawMessage({
      type: "hook_started",
      input: { agent_id: "B", tool_use_id: "toolu_2" },
    });

    // Progress from agent A resolves to toolu_1
    expect(tracker.resolveToolUseId({ agent_id: "A" })).toBe("toolu_1");
    // Progress from agent B resolves to toolu_2
    expect(tracker.resolveToolUseId({ agent_id: "B" })).toBe("toolu_2");
  });

  test("uses direct tool_use_id on progress message when available", () => {
    const tracker = new SubagentProgressTracker();
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_1", input: "{}", state: "input-streaming" });
    tracker.trackEvent({ type: "tool", toolName: "agent", toolUseId: "toolu_2", input: "{}", state: "input-streaming" });

    // Progress message carries its own tool_use_id
    expect(tracker.resolveToolUseId({ tool_use_id: "toolu_1" })).toBe("toolu_1");
  });

  test("returns undefined when no agents have been tracked", () => {
    const tracker = new SubagentProgressTracker();
    expect(tracker.resolveToolUseId({})).toBeUndefined();
  });
});

describe("resolveClaudeApprovalDecisionTimeoutMs", () => {
  test("returns default when env var is unset", () => {
    expect(resolveClaudeApprovalDecisionTimeoutMs({ envValue: undefined })).toBe(
      CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
  });

  test("respects a positive integer env value", () => {
    expect(
      resolveClaudeApprovalDecisionTimeoutMs({ envValue: "60000" }),
    ).toBe(60000);
  });

  test("falls back for non-numeric or non-positive env values", () => {
    expect(
      resolveClaudeApprovalDecisionTimeoutMs({ envValue: "abc" }),
    ).toBe(CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS);
    expect(resolveClaudeApprovalDecisionTimeoutMs({ envValue: "0" })).toBe(
      CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
    expect(resolveClaudeApprovalDecisionTimeoutMs({ envValue: "-5" })).toBe(
      CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
  });
});

describe("waitForClaudeToolDecision", () => {
  test("resolves with the responder value and cancels the timeout", async () => {
    const controller = new AbortController();
    let resolver: ((value: boolean) => void) | null = null;
    let cleaned = false;
    const promise = waitForClaudeToolDecision<boolean>({
      signal: controller.signal,
      register: (resolve) => {
        resolver = resolve;
        return () => {
          cleaned = true;
        };
      },
      timeoutMs: 1_000,
    });
    // Simulate responder invoking the registered resolver.
    await Promise.resolve();
    resolver?.(true);
    await expect(promise).resolves.toBe(true);
    // Cleanup is only run on timeout/abort paths; on success we do not call it.
    expect(cleaned).toBe(false);
  });

  test("rejects with ClaudeToolDecisionTimeoutError when no responder arrives", async () => {
    const controller = new AbortController();
    let cleaned = false;
    const promise = waitForClaudeToolDecision<boolean>({
      signal: controller.signal,
      register: () => () => {
        cleaned = true;
      },
      timeoutMs: 10,
    });
    await expect(promise).rejects.toBeInstanceOf(ClaudeToolDecisionTimeoutError);
    // Cleanup must run so the resolver registry does not leak.
    expect(cleaned).toBe(true);
  });

  test("abort beats a pending timeout", async () => {
    const controller = new AbortController();
    let cleaned = false;
    const promise = waitForClaudeToolDecision<boolean>({
      signal: controller.signal,
      register: () => () => {
        cleaned = true;
      },
      timeoutMs: 5_000,
    });
    controller.abort();
    await expect(promise).rejects.toThrow(
      "Claude tool permission request aborted.",
    );
    expect(cleaned).toBe(true);
  });

  test("never times out when timeoutMs is 0", async () => {
    const controller = new AbortController();
    let resolver: ((value: boolean) => void) | null = null;
    const promise = waitForClaudeToolDecision<boolean>({
      signal: controller.signal,
      register: (resolve) => {
        resolver = resolve;
        return () => {};
      },
      timeoutMs: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    resolver?.(false);
    await expect(promise).resolves.toBe(false);
  });
});

describe("buildClaudeApprovalTimeoutBridgeEvent", () => {
  test("emits a recoverable error event describing the approval timeout", () => {
    const event = buildClaudeApprovalTimeoutBridgeEvent({
      kind: "approval",
      toolName: "Edit",
      requestId: "req_1",
      timeoutMs: 45_000,
    });
    expect(event.type).toBe("error");
    if (event.type !== "error") {
      return;
    }
    expect(event.recoverable).toBe(true);
    expect(event.message).toContain("Edit");
    expect(event.message).toContain("req_1");
    expect(event.message).toContain("45s");
  });

  test("uses 'answer' wording for user_input timeouts", () => {
    const event = buildClaudeApprovalTimeoutBridgeEvent({
      kind: "user_input",
      toolName: "AskUserQuestion",
      requestId: "req_2",
      timeoutMs: 30_000,
    });
    expect(event.type).toBe("error");
    if (event.type !== "error") {
      return;
    }
    expect(event.message).toContain("answer");
  });
});

describe("parseClaudeQuestionList", () => {
  test("keeps questions whose options omit a description", () => {
    const questions = parseClaudeQuestionList({
      input: {
        questions: [
          {
            header: "Approach",
            question: "Which approach?",
            options: [{ label: "Option A" }, { label: "Option B" }],
          },
        ],
      },
    });
    expect(questions).toHaveLength(1);
    // Missing description falls back to the label so the question survives.
    expect(questions[0]?.options).toEqual([
      { label: "Option A", description: "Option A" },
      { label: "Option B", description: "Option B" },
    ]);
  });

  test("accepts bare-string options and `value` labels", () => {
    const questions = parseClaudeQuestionList({
      input: {
        questions: [
          {
            header: "Pick",
            question: "Pick one",
            options: ["Yes", { value: "no", description: "Do not proceed" }],
          },
        ],
      },
    });
    expect(questions[0]?.options).toEqual([
      { label: "Yes", description: "Yes" },
      { label: "no", description: "Do not proceed" },
    ]);
  });

  test("preserves an explicit description when present", () => {
    const questions = parseClaudeQuestionList({
      input: {
        questions: [
          {
            header: "H",
            question: "Q",
            options: [{ label: "A", description: "Detailed A" }],
            multiSelect: true,
          },
        ],
      },
    });
    expect(questions[0]).toMatchObject({
      options: [{ label: "A", description: "Detailed A" }],
      multiSelect: true,
    });
  });

  test("drops only options with no usable label", () => {
    const questions = parseClaudeQuestionList({
      input: {
        questions: [
          {
            header: "H",
            question: "Q",
            options: [{ description: "no label" }, { label: "Keep" }],
          },
        ],
      },
    });
    expect(questions[0]?.options).toEqual([
      { label: "Keep", description: "Keep" },
    ]);
  });
});
