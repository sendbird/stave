import { describe, expect, test } from "bun:test";
import {
  ClaudeFileRewindArgsSchema,
  ClaudeSessionForkArgsSchema,
  CliSessionCreateSessionArgsSchema,
  ClaudeMcpOauthLoginArgsSchema,
  CursorMcpOauthLoginArgsSchema,
  CodexThreadForkArgsSchema,
  CreatePRArgsSchema,
  EnhancePromptArgsSchema,
  FilesystemRepoMapArgsSchema,
  LocalMcpConfigUpdateArgsSchema,
  McpServerConfigMutationApplyArgsSchema,
  McpServerConfigMutationArgsSchema,
  ReviewDiffArgsSchema,
  RoutineInformationResourceCreateArgsSchema,
  RoutineProviderTimeoutArgsSchema,
  SetNotificationBadgeArgsSchema,
  ShowNativeNotificationArgsSchema,
  StageFilesArgsSchema,
  SteerTurnArgsSchema,
  SuggestPRDescriptionArgsSchema,
  SuggestTaskNameArgsSchema,
  TerminalCreateSessionArgsSchema,
  StreamTurnArgsSchema,
  TryAutoFixLintArgsSchema,
} from "../electron/main/ipc/schemas";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";

describe("provider IPC schemas", () => {
  test("validates prompt-enhancement requests", () => {
    expect(
      EnhancePromptArgsSchema.safeParse({
        cwd: "/tmp/workspace",
        activeProviderId: "codex",
        prompt: "make this clearer",
      }).success,
    ).toBe(true);
    expect(EnhancePromptArgsSchema.safeParse({ prompt: "   " }).success).toBe(
      false,
    );
    expect(
      EnhancePromptArgsSchema.safeParse({ prompt: "x".repeat(100_001) })
        .success,
    ).toBe(false);
  });

  test("validates Claude MCP OAuth login requests", () => {
    expect(
      ClaudeMcpOauthLoginArgsSchema.safeParse({
        name: "github",
        cwd: "/tmp/workspace",
        timeoutSecs: 600,
        runtimeOptions: {
          claudeBinaryPath: "/tmp/claude",
        },
      }).success,
    ).toBe(true);
    expect(
      ClaudeMcpOauthLoginArgsSchema.safeParse({
        name: "",
        timeoutSecs: 0,
      }).success,
    ).toBe(false);
  });

  test("validates Cursor MCP OAuth login requests", () => {
    expect(
      CursorMcpOauthLoginArgsSchema.safeParse({
        name: "slack",
        cwd: "/tmp/workspace",
        timeoutSecs: 600,
        runtimeOptions: { cursorBinaryPath: "/tmp/agent" },
      }).success,
    ).toBe(true);
    expect(
      CursorMcpOauthLoginArgsSchema.safeParse({ name: "", timeoutSecs: 0 })
        .success,
    ).toBe(false);
  });

  test("validates secret-safe MCP configuration mutations", () => {
    const create = {
      operation: "create",
      cwd: "/tmp/workspace",
      draft: {
        provider: "claude-code",
        scope: "project",
        name: "docs-server",
        transport: "http",
        url: "https://mcp.example.test/api",
        envVars: [],
        bearerTokenEnvVar: "DOCS_TOKEN",
        headerEnvBindings: [{ name: "X-Workspace", envVar: "WORKSPACE_ID" }],
        enabled: true,
      },
    };

    expect(McpServerConfigMutationArgsSchema.safeParse(create).success).toBe(true);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        installProviders: ["claude-code", "codex", "cursor", "kiro"],
      }).success,
    ).toBe(true);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        operation: "share",
        target: {
          provider: "claude-code",
          scope: "user",
          name: "docs-server",
        },
        destination: {
          provider: "cursor",
          scope: "user",
          name: "docs-server",
        },
      }).success,
    ).toBe(true);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        draft: { ...create.draft, provider: "cursor", scope: "project" },
      }).success,
    ).toBe(true);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        draft: { ...create.draft, provider: "cursor", scope: "local" },
      }).success,
    ).toBe(false);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        draft: { ...create.draft, provider: "kiro", scope: "project" },
      }).success,
    ).toBe(true);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        draft: { ...create.draft, provider: "kiro", scope: "local" },
      }).success,
    ).toBe(false);
    expect(
      McpServerConfigMutationApplyArgsSchema.safeParse({
        ...create,
        expectedRevision: "revision-1",
      }).success,
    ).toBe(true);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        draft: { ...create.draft, provider: "codex", scope: "project" },
      }).success,
    ).toBe(false);
    expect(
      McpServerConfigMutationArgsSchema.safeParse({
        ...create,
        draft: { ...create.draft, bearerTokenEnvVar: "literal secret" },
      }).success,
    ).toBe(false);
  });

  test("accepts the full steer request contract", () => {
    const parsed = SteerTurnArgsSchema.safeParse({
      turnId: "turn-1",
      text: "Also update the tests.",
      enabled: true,
      clientMessageId: "client-steer-1",
    });

    expect(parsed.success).toBe(true);
    expect(
      SteerTurnArgsSchema.safeParse({
        turnId: "turn-1",
        text: "Also update the tests.",
        clientMessageId: "",
      }).success,
    ).toBe(false);
  });

  test("accepts routine Information resource creation", () => {
    expect(
      RoutineInformationResourceCreateArgsSchema.safeParse({
        kind: "figma",
        workspaceId: "ws-default",
        url: "https://www.figma.com/design/file-key/example?node-id=1-2",
        title: "Routine design",
        nodeId: "1:2",
        note: "Use this design as implementation context.",
      }).success,
    ).toBe(true);
  });

  test("accepts an automation provider timeout up to 24 hours", () => {
    expect(
      RoutineProviderTimeoutArgsSchema.safeParse({
        providerTimeoutMs: 86_400_000,
      }).success,
    ).toBe(true);
    expect(
      RoutineProviderTimeoutArgsSchema.safeParse({
        providerTimeoutMs: 86_400_001,
      }).success,
    ).toBe(false);
  });

  test("accepts latest Codex and Claude runtime options", () => {
    const parsed = StreamTurnArgsSchema.safeParse({
      providerId: "codex",
      prompt: "continue",
      runtimeOptions: {
        codexAutoApproveStaveLocalMcpTools: true,
        codexApprovalPolicy: "on-failure",
        claudePromptSuggestions: false,
        claudeForwardSubagentText: true,
        claudeEnableFileCheckpointing: true,
        claudeForkSession: true,
        claudeStrictMcpConfig: true,
        claudeSkills: ["review"],
        claudePluginPaths: ["/tmp/claude-plugin"],
        claudePluginMode: "all",
        claudePluginOverrides: { "eli5@claude-community": false },
        claudeAgentName: "code-reviewer",
        claudeFallbackModel: "claude-sonnet-4-6,claude-haiku-4-5",
        claudeResumeSessionAt: "message-uuid",
        claudeSandboxCredentialFiles: ["/tmp/service-token"],
        claudeSandboxCredentialEnvVars: ["SERVICE_TOKEN"],
        codexWebSearch: "indexed",
        codexAppToolApprovalMode: "writes",
      },
    });

    expect(parsed.success).toBe(true);
  });

  test("validates provider-native branch and rewind boundaries", () => {
    expect(
      ClaudeSessionForkArgsSchema.safeParse({
        sessionId: "claude-session-1",
        upToMessageId: "message-uuid-1",
        cwd: "/tmp/project",
      }).success,
    ).toBe(true);
    expect(
      ClaudeFileRewindArgsSchema.safeParse({
        sessionId: "claude-session-1",
        userMessageId: "message-uuid-1",
        dryRun: true,
        runtimeOptions: {},
      }).success,
    ).toBe(true);
    expect(
      CodexThreadForkArgsSchema.safeParse({
        threadId: "thread-1",
        lastTurnId: "turn-1",
        runtimeOptions: {},
      }).success,
    ).toBe(true);
    expect(
      CodexThreadForkArgsSchema.safeParse({
        threadId: "thread-1",
        lastTurnId: "turn-1",
        beforeTurnId: "turn-2",
        runtimeOptions: {},
      }).success,
    ).toBe(false);
  });

  test("validates the provider-neutral Advisor target", () => {
    expect(
      StreamTurnArgsSchema.safeParse({
        providerId: "claude-code",
        prompt: "continue",
        runtimeOptions: {
          advisorTarget: {
            providerId: "codex",
            model: "gpt-5.6-terra",
          },
        },
      }).success,
    ).toBe(true);
    expect(
      StreamTurnArgsSchema.safeParse({
        providerId: "codex",
        prompt: "continue",
        runtimeOptions: {
          advisorTarget: {
            providerId: "claude-code",
            model: "",
          },
        },
      }).success,
    ).toBe(false);
  });

  test("accepts an optional advisor effort and rejects an unselectable one", () => {
    const parse = (effort: unknown) =>
      StreamTurnArgsSchema.safeParse({
        providerId: "claude-code",
        prompt: "continue",
        runtimeOptions: {
          advisorTarget: { providerId: "codex", model: "gpt-5.6-sol", effort },
        },
      }).success;

    expect(parse("ultra")).toBe(true);
    // "minimal" is Codex's legacy tier: unselectable, and collapsed to "low"
    // before any call, so it must not cross the IPC boundary as a pin.
    expect(parse("minimal")).toBe(false);
    expect(parse("insane")).toBe(false);
    expect(
      StreamTurnArgsSchema.safeParse({
        providerId: "claude-code",
        prompt: "continue",
        runtimeOptions: {
          advisorTarget: { providerId: "codex", model: "gpt-5.6-sol" },
        },
      }).success,
    ).toBe(true);
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
    expect(
      StreamTurnArgsSchema.safeParse({
        providerId: "codex",
        prompt: "continue",
        runtimeOptions: {
          providerTimeoutMs: 86_400_000,
        },
      }).success,
    ).toBe(true);

    expect(
      StreamTurnArgsSchema.safeParse({
        providerId: "codex",
        prompt: "continue",
        runtimeOptions: {
          providerTimeoutMs: 86_400_001,
        },
      }).success,
    ).toBe(false);
  });

  test("preserves renderer-side tool metadata needed by assistant trace rendering", () => {
    const parsed = parseWorkspaceSnapshot({
      payload: {
        activeTaskId: "task-1",
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            provider: "codex",
            updatedAt: "2026-04-02T00:00:00.000Z",
            unread: false,
          },
        ],
        messagesByTask: {
          "task-1": [
            {
              id: "task-1-m-1",
              role: "assistant",
              providerId: "codex",
              model: "gpt-5.4",
              content: "",
              providerBoundary: {
                providerId: "codex",
                kind: "turn",
                nativeId: "turn-1",
              },
              parts: [
                {
                  type: "tool_use",
                  toolName: "Agent",
                  input: '{"description":"Review schemas"}',
                  output: "Done",
                  state: "output-available",
                  elapsedSeconds: 19,
                  progressMessages: ["Reading schemas", "Checking snapshots"],
                  workerExecution: {
                    providerId: "codex",
                    primaryModel: "gpt-5.6-sol",
                    presetId: "verified-patch",
                    workerModel: "gpt-5.6-terra",
                    workerEffort: "max",
                  },
                },
              ],
            },
          ],
        },
        promptDraftByTask: {},
        providerSessionByTask: {},
        editorTabs: [],
        activeEditorTabId: null,
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.messagesByTask["task-1"]?.[0]?.providerBoundary).toEqual({
      providerId: "codex",
      kind: "turn",
      nativeId: "turn-1",
    });
    expect(parsed?.messagesByTask["task-1"]?.[0]?.parts[0]).toEqual({
      type: "tool_use",
      toolName: "Agent",
      input: '{"description":"Review schemas"}',
      output: "Done",
      state: "output-available",
      elapsedSeconds: 19,
      progressMessages: ["Reading schemas", "Checking snapshots"],
      workerExecution: {
        providerId: "codex",
        primaryModel: "gpt-5.6-sol",
        presetId: "verified-patch",
        workerModel: "gpt-5.6-terra",
        workerEffort: "max",
      },
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
                input: '{"command":"ls -la"}',
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
    expect(
      FilesystemRepoMapArgsSchema.safeParse({
        rootPath: "/tmp/project",
        refresh: true,
      }).success,
    ).toBe(true);
    expect(
      FilesystemRepoMapArgsSchema.safeParse({
        rootPath: "/tmp/project",
        refresh: "yes",
      }).success,
    ).toBe(false);
  });

  test("accepts workspace-scoped PR drafting context", () => {
    expect(
      SuggestPRDescriptionArgsSchema.safeParse({
        cwd: "/tmp/project",
        baseBranch: "main",
        providerId: "codex",
        workspaceContext:
          "Use the active workspace task to explain the intent.",
        runtimeOptions: {
          model: "gpt-5.6-codex",
          codexFileAccess: "read-only",
          codexNetworkAccess: false,
          codexApprovalPolicy: "never",
        },
      }).success,
    ).toBe(true);
    expect(
      SuggestPRDescriptionArgsSchema.safeParse({
        cwd: "/tmp/project",
        providerId: "unknown",
      }).success,
    ).toBe(false);
  });

  test("accepts ready PR creation with optional auto-merge", () => {
    expect(
      CreatePRArgsSchema.safeParse({
        cwd: "/tmp/project",
        title: "fix(pr): align create flow with ship rules",
        body: "## Summary\n- Align the PR flow with the repository ship rules.",
        baseBranch: "main",
        draft: false,
        autoMerge: true,
        mergeMethod: "squash",
      }).success,
    ).toBe(true);
    expect(
      CreatePRArgsSchema.safeParse({
        title: "fix(pr): reject unknown options",
        unsupported: true,
      }).success,
    ).toBe(false);
  });

  test("accepts an explicit file scope for lint auto-fix", () => {
    expect(
      TryAutoFixLintArgsSchema.safeParse({
        cwd: "/tmp/project",
        paths: ["src/components/TopBarOpenPR.tsx", "src/lib/pr-status.ts"],
      }).success,
    ).toBe(true);
    expect(
      TryAutoFixLintArgsSchema.safeParse({
        paths: [""],
      }).success,
    ).toBe(false);
  });

  test("accepts a non-empty batch staging scope", () => {
    expect(
      StageFilesArgsSchema.safeParse({
        cwd: "/tmp/project",
        paths: ["src/a.ts", "src/b.ts"],
      }).success,
    ).toBe(true);
    expect(StageFilesArgsSchema.safeParse({ paths: [] }).success).toBe(false);
  });

  test("accepts strict pre-PR review requests", () => {
    expect(
      ReviewDiffArgsSchema.safeParse({
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
      }).success,
    ).toBe(true);
    expect(
      ReviewDiffArgsSchema.safeParse({
        cwd: "/tmp/project",
        providerId: "openai",
      }).success,
    ).toBe(false);
    expect(
      ReviewDiffArgsSchema.safeParse({
        cwd: "/tmp/project",
        extra: true,
      }).success,
    ).toBe(false);
  });

  test("accepts the intent-guard fingerprint gate", () => {
    expect(
      ReviewDiffArgsSchema.safeParse({
        cwd: "/tmp/project",
        providerId: "claude-code",
        mode: "intent",
        intentContext: "Ship the settings dialog",
        intentFingerprintGate: true,
        runtimeOptions: { model: "claude-haiku-4-5" },
      }).success,
    ).toBe(true);
    expect(
      ReviewDiffArgsSchema.safeParse({
        cwd: "/tmp/project",
        intentFingerprintGate: "yes",
        runtimeOptions: {},
      }).success,
    ).toBe(false);
  });

  test("accepts Background AI lane overrides on utility requests", () => {
    expect(
      SuggestTaskNameArgsSchema.safeParse({
        prompt: "fix the terminal",
        utilityProviderId: "claude-code",
        utilityModel: "claude-haiku-4-5",
        utilityMaxProviderAttempts: 2,
      }).success,
    ).toBe(true);
    // The fan-out cap must stay a small integer; an unbounded value would
    // reinstate the very behavior the cap exists to prevent.
    expect(
      SuggestTaskNameArgsSchema.safeParse({
        prompt: "fix the terminal",
        utilityMaxProviderAttempts: 99,
      }).success,
    ).toBe(false);
    expect(
      SuggestTaskNameArgsSchema.safeParse({
        prompt: "fix the terminal",
        utilityMaxProviderAttempts: 0,
      }).success,
    ).toBe(false);
  });

  test("accepts terminal session creation args with workspace metadata", () => {
    expect(
      TerminalCreateSessionArgsSchema.safeParse({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/project",
        taskId: null,
        taskTitle: null,
        terminalTabId: "terminal-1",
        cwd: "/tmp/project",
        cols: 120,
        rows: 40,
        deliveryMode: "push",
      }).success,
    ).toBe(true);
    expect(
      TerminalCreateSessionArgsSchema.safeParse({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/project",
        taskId: null,
        taskTitle: null,
        terminalTabId: "terminal-1",
        cwd: "",
      }).success,
    ).toBe(false);
  });

  test("accepts CLI session creation args with provider and context metadata", () => {
    expect(
      CliSessionCreateSessionArgsSchema.safeParse({
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
      }).success,
    ).toBe(true);
    expect(
      CliSessionCreateSessionArgsSchema.safeParse({
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
      }).success,
    ).toBe(true);
    expect(
      CliSessionCreateSessionArgsSchema.safeParse({
        workspaceId: "workspace-1",
        workspacePath: "/tmp/project",
        cliSessionTabId: "cli-1",
        providerId: "stave",
        contextMode: "workspace",
        taskId: null,
        taskTitle: null,
        cwd: "/tmp/project",
      }).success,
    ).toBe(false);
  });

  test("validates native notification and dock badge payloads", () => {
    expect(
      ShowNativeNotificationArgsSchema.safeParse({
        notificationId: "notification-1",
        title: "Task completed",
        body: "The provider turn finished.",
      }).success,
    ).toBe(true);
    expect(
      ShowNativeNotificationArgsSchema.safeParse({
        notificationId: "notification-1",
        title: "Task completed",
        body: "The provider turn finished.",
        unexpected: true,
      }).success,
    ).toBe(false);
    expect(SetNotificationBadgeArgsSchema.safeParse({ count: 3 }).success).toBe(
      true,
    );
    expect(
      SetNotificationBadgeArgsSchema.safeParse({ count: -1 }).success,
    ).toBe(false);
  });

  test("accepts Claude Code auto-registration in local MCP config updates", () => {
    expect(
      LocalMcpConfigUpdateArgsSchema.safeParse({
        enabled: true,
        claudeCodeAutoRegister: false,
        codexAutoRegister: false,
      }).success,
    ).toBe(true);
    expect(
      LocalMcpConfigUpdateArgsSchema.safeParse({
        claudeCodeAutoRegister: "off",
      }).success,
    ).toBe(false);
    expect(
      LocalMcpConfigUpdateArgsSchema.safeParse({
        codexAutoRegister: "off",
      }).success,
    ).toBe(false);
  });
});
