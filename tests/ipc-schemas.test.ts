import { describe, expect, test } from "bun:test";
import {
  CliSessionCreateSessionArgsSchema,
  FilesystemRepoMapArgsSchema,
  LocalMcpConfigUpdateArgsSchema,
  SuggestPRDescriptionArgsSchema,
  TerminalCreateSessionArgsSchema,
  StreamTurnArgsSchema,
} from "../electron/main/ipc/schemas";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";

describe("provider IPC schemas", () => {
  test("rejects deprecated Codex on-failure approval policy in runtime options", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "continue",
      runtimeOptions: {
        codexApprovalPolicy: "on-failure",
      },
    });

    expect(parsed.success).toBe(false);
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

  test("accepts stave_processing in canonical history", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      turnId: "turn-1",
      providerId: "stave",
      prompt: "그럼 수정해보자",
      taskId: "task-1",
      workspaceId: "workspace-1",
      conversation: {
        turnId: "turn-1",
        taskId: "task-1",
        workspaceId: "workspace-1",
        target: {
          providerId: "stave",
          model: "stave-auto",
        },
        mode: "chat",
        history: [{
          messageId: "task-1-m-1",
          role: "assistant",
          providerId: "claude-code",
          model: "claude-sonnet-4-6",
          content: "",
          parts: [{
            type: "stave_processing",
            strategy: "direct",
            model: "claude-sonnet-4-6",
            reason: "General task",
            fastModeRequested: false,
            fastModeApplied: false,
          }],
        }],
        input: {
          role: "user",
          providerId: "user",
          model: "user",
          content: "그럼 수정해보자",
          parts: [{
            type: "text",
            text: "그럼 수정해보자",
          }],
        },
        contextParts: [],
      },
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts stave_processing in workspace snapshots", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [{
          id: "task-1",
          title: "Debug Unexpected Failure",
          provider: "stave",
          updatedAt: "2026-03-25T13:15:32.623Z",
          unread: false,
          archivedAt: null,
        }],
        messagesByTask: {
          "task-1": [{
            id: "task-1-m-1",
            role: "assistant",
            providerId: "stave",
            model: "stave-auto",
            content: "",
            startedAt: "2026-04-02T10:00:00.000Z",
            completedAt: "2026-04-02T10:00:05.000Z",
            parts: [{
              type: "stave_processing",
              strategy: "direct",
              model: "claude-sonnet-4-6",
              reason: "General task",
              fastModeRequested: false,
              fastModeApplied: false,
            }],
          }],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [{
          id: "terminal-1",
          title: "project",
          linkedTaskId: null,
          backend: "ghostty",
          cwd: "/tmp/project",
          createdAt: 1,
        }],
        activeTerminalTabId: "terminal-1",
        cliSessionTabs: [{
          id: "cli-1",
          title: "Claude Workspace",
          provider: "claude-code",
          contextMode: "workspace",
          nativeSessionId: "claude-session-1",
          linkedTaskId: null,
          linkedTaskTitle: null,
          handoffSummary: "",
          cwd: "/tmp/project",
          createdAt: 2,
        }],
        activeCliSessionTabId: "cli-1",
        activeSurface: {
          kind: "cli-session",
          cliSessionTabId: "cli-1",
        },
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.messagesByTask["task-1"]?.[0]?.startedAt).toBe("2026-04-02T10:00:00.000Z");
    expect(parsed?.messagesByTask["task-1"]?.[0]?.completedAt).toBe("2026-04-02T10:00:05.000Z");
    expect(parsed?.activeTerminalTabId).toBe("terminal-1");
    expect(parsed?.messagesByTask["task-1"]?.[0]?.parts[0]).toEqual({
      type: "stave_processing",
      strategy: "direct",
      model: "claude-sonnet-4-6",
      reason: "General task",
      fastModeRequested: false,
      fastModeApplied: false,
    });
    expect(parsed?.activeCliSessionTabId).toBe("cli-1");
    expect(parsed?.activeSurface).toEqual({
      kind: "cli-session",
      cliSessionTabId: "cli-1",
    });
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
