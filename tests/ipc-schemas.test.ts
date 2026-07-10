import { describe, expect, test } from "bun:test";
import {
  CliSessionCreateSessionArgsSchema,
  FilesystemRepoMapArgsSchema,
  LocalMcpConfigUpdateArgsSchema,
  ReviewDiffArgsSchema,
  SuggestPRDescriptionArgsSchema,
  TerminalCreateSessionArgsSchema,
  StreamTurnArgsSchema,
} from "../electron/main/ipc/schemas";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";

describe("provider IPC schemas", () => {
  test("accepts latest Codex and Claude runtime options", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "continue",
      runtimeOptions: {
        codexApprovalPolicy: "on-failure",
        claudePromptSuggestions: false,
        claudeForwardSubagentText: true,
        claudeEnableFileCheckpointing: true,
        claudeForkSession: true,
        claudeStrictMcpConfig: true,
        claudeSkills: ["review"],
        claudePluginPaths: ["/tmp/claude-plugin"],
        claudeAgentName: "code-reviewer",
        claudeFallbackModel: "claude-sonnet-4-6,claude-haiku-4-5",
        claudeResumeSessionAt: "message-uuid",
      },
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts Claude xhigh effort in runtime options", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "claude-code",
      prompt: "continue",
      runtimeOptions: {
        claudeEffort: "xhigh",
      },
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts Codex max/ultra efforts and legacy minimal in runtime options", () => {
    for (const effort of ["max", "ultra", "minimal"] as const) {
      const parsed = StreamTurnArgsSchema.safeParse({
        providerId: "codex",
        prompt: "continue",
        runtimeOptions: {
          codexReasoningEffort: effort,
        },
      });

      expect(parsed.success).toBe(true);
    }
  });

  test("accepts provider timeout windows up to 24 hours", () => {
    expect(StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "continue",
      runtimeOptions: {
        providerTimeoutMs: 86_400_000,
      },
    }).success).toBe(true);

    expect(StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "continue",
      runtimeOptions: {
        providerTimeoutMs: 86_400_001,
      },
    }).success).toBe(false);
  });

  test("preserves renderer-side tool metadata needed by assistant trace rendering", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Task 1",
          provider: "codex",
          updatedAt: "2026-04-02T00:00:00.000Z",
          unread: false,
        }],
        messagesByTask: {
          "task-1": [{
            id: "task-1-m-1",
            role: "assistant",
            providerId: "codex",
            model: "gpt-5.4",
            content: "",
            parts: [{
              type: "tool_use",
              toolName: "Agent",
              input: "{\"description\":\"Review schemas\"}",
              output: "Done",
              state: "output-available",
              elapsedSeconds: 19,
              progressMessages: ["Reading schemas", "Checking snapshots"],
            }],
          }],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.messagesByTask["task-1"]?.[0]?.parts[0]).toEqual({
      type: "tool_use",
      toolName: "Agent",
      input: "{\"description\":\"Review schemas\"}",
      output: "Done",
      state: "output-available",
      elapsedSeconds: 19,
      progressMessages: ["Reading schemas", "Checking snapshots"],
    });
  });

  test("accepts conversation history approval parts that carry tool input", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "claude-code",
      prompt: "continue",
      conversation: {
        target: { providerId: "claude-code" },
        mode: "chat",
        history: [
          {
            role: "user",
            content: "hi",
            parts: [{ type: "text", text: "hi" }],
          },
          {
            role: "assistant",
            content: "done",
            parts: [
              {
                type: "approval",
                toolName: "Bash",
                description: "Run a command",
                input: "{\"command\":\"ls -la\"}",
                requestId: "req-1",
                state: "approval-responded",
              },
            ],
          },
        ],
        input: {
          role: "user",
          content: "continue",
          parts: [{ type: "text", text: "continue" }],
        },
        contextParts: [],
      },
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts repo-map filesystem requests with optional refresh", () => {
    expect(FilesystemRepoMapArgsSchema.safeParse({
      rootPath: "/tmp/project",
      refresh: true,
    }).success).toBe(true);
    expect(FilesystemRepoMapArgsSchema.safeParse({
      rootPath: "/tmp/project",
      refresh: "yes",
    }).success).toBe(false);
  });

  test("accepts workspace-scoped PR drafting context", () => {
    expect(SuggestPRDescriptionArgsSchema.safeParse({
      cwd: "/tmp/project",
      baseBranch: "main",
      workspaceContext: "Use the active workspace task as the primary source of intent.",
    }).success).toBe(true);
  });

  test("accepts strict pre-PR review requests", () => {
    expect(ReviewDiffArgsSchema.safeParse({
      cwd: "/tmp/project",
      baseBranch: "main",
      headBranch: "feature/review",
      providerId: "codex",
      model: "gpt-5-codex",
      runtimeOptions: {
        model: "gpt-5-codex",
        codexApprovalPolicy: "never",
        codexBinaryPath: "/tmp/codex",
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexReasoningEffort: "medium",
        codexWebSearch: "disabled",
      },
    }).success).toBe(true);
    expect(ReviewDiffArgsSchema.safeParse({
      cwd: "/tmp/project",
      providerId: "openai",
    }).success).toBe(false);
    expect(ReviewDiffArgsSchema.safeParse({
      cwd: "/tmp/project",
      extra: true,
    }).success).toBe(false);
  });

  test("accepts terminal session creation args with workspace metadata", () => {
    expect(TerminalCreateSessionArgsSchema.safeParse({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/project",
      taskId: null,
      taskTitle: null,
      terminalTabId: "terminal-1",
      cwd: "/tmp/project",
      cols: 120,
      rows: 40,
      deliveryMode: "push",
    }).success).toBe(true);
    expect(TerminalCreateSessionArgsSchema.safeParse({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/project",
      taskId: null,
      taskTitle: null,
      terminalTabId: "terminal-1",
      cwd: "",
    }).success).toBe(false);
  });

  test("accepts CLI session creation args with provider and context metadata", () => {
    expect(CliSessionCreateSessionArgsSchema.safeParse({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/project",
      cliSessionTabId: "cli-0",
      providerId: "claude-code",
      contextMode: "workspace",
      nativeSessionId: "claude-session-1",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/project",
      runtimeOptions: {
        claudeBinaryPath: "/tmp/claude",
      },
    }).success).toBe(true);
    expect(CliSessionCreateSessionArgsSchema.safeParse({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/project",
      cliSessionTabId: "cli-1",
      providerId: "codex",
      contextMode: "active-task",
      nativeSessionId: "codex-session-1",
      taskId: "task-1",
      taskTitle: "Task 1",
      cwd: "/tmp/project",
      cols: 120,
      rows: 40,
      deliveryMode: "push",
      runtimeOptions: {
        codexBinaryPath: "/tmp/codex",
      },
    }).success).toBe(true);
    expect(CliSessionCreateSessionArgsSchema.safeParse({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/project",
      cliSessionTabId: "cli-1",
      providerId: "stave",
      contextMode: "workspace",
      taskId: null,
      taskTitle: null,
      cwd: "/tmp/project",
    }).success).toBe(false);
  });

  test("accepts Claude Code auto-registration in local MCP config updates", () => {
    expect(LocalMcpConfigUpdateArgsSchema.safeParse({
      enabled: true,
      claudeCodeAutoRegister: false,
      codexAutoRegister: false,
    }).success).toBe(true);
    expect(LocalMcpConfigUpdateArgsSchema.safeParse({
      claudeCodeAutoRegister: "off",
    }).success).toBe(false);
    expect(LocalMcpConfigUpdateArgsSchema.safeParse({
      codexAutoRegister: "off",
    }).success).toBe(false);
  });

});
