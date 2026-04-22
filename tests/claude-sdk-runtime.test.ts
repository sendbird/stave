import { describe, expect, test } from "bun:test";
import {
  buildClaudeApprovalPermissionResult,
  buildClaudeApprovalTimeoutBridgeEvent,
  CLAUDE_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  ClaudeToolDecisionTimeoutError,
  resolveClaudeAgentProgressSummaries,
  resolveClaudeApprovalDecisionTimeoutMs,
  resolveClaudePermissionModeDecision,
  buildClaudeSystemPrompt,
  buildClaudeUserInputPermissionResult,
  extractClaudeRequestedSkillSlug,
  mapClaudeMessageToEvents,
  resolveClaudeDisallowedTools,
  shouldAutoAllowClaudeTool,
  shouldRedirectClaudePreloadedSkillToolUse,
  shouldDenyClaudeToolInPlanMode,
  SubagentProgressTracker,
  waitForClaudeToolDecision,
} from "../electron/providers/claude-sdk-runtime";

const workspaceRoot = "/workspace/stave";

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

  test("still prompts for Bash in plan mode so command-level inspection runs", () => {
    // Bash must keep going through the canUseTool prompt path in plan mode —
    // the hard-deny check in shouldDenyClaudeToolInPlanMode inspects the
    // command and we don't want to short-circuit that.
    expect(resolveClaudePermissionModeDecision({
      permissionMode: "plan",
      toolName: "Bash",
    })).toBe("prompt");
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

    // Static prefix is parts[0] (before boundary).
    expect(parts[0].startsWith("Follow repository conventions.")).toBe(true);
    // Workspace context sits in the dynamic suffix (parts[2]).
    expect(parts[2]).toContain("Resolve every relative filesystem path against the workspace root above.");
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

describe("resolveClaudeDisallowedTools", () => {
  test("adds mutating file tools while Claude plan mode is enabled", () => {
    expect(resolveClaudeDisallowedTools({
      permissionMode: "plan",
      runtimeDisallowedTools: ["Read", "Edit"],
    })).toEqual([
      "Read",
      "Edit",
      "MultiEdit",
      "Write",
      "NotebookEdit",
      "TodoWrite",
    ]);
  });

  test("preserves runtime disallowed tools outside plan mode", () => {
    expect(resolveClaudeDisallowedTools({
      permissionMode: "default",
      runtimeDisallowedTools: ["Read"],
    })).toEqual(["Read"]);
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
