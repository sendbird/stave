import { describe, expect, test } from "bun:test";
import {
  buildSecondaryProviderRuntimeOptions,
  executeSecondaryProviderRun,
} from "../electron/providers/secondary-run-executor";
import {
  buildClaudeQueryOptions,
  shouldDenyClaudeToolInSecondaryReadOnly,
} from "../electron/providers/claude-sdk-runtime";
import type { BridgeEvent, StreamTurnArgs } from "../electron/providers/types";

function createRequest(providerId: "claude-code" | "codex" = "codex") {
  return {
    runId: "run-1",
    stepId: "step-1",
    executionId: "execution-1",
    input: {
      providerId,
      model: providerId === "codex" ? "gpt-5.6-sol" : "claude-sonnet-5",
      prompt: "Inspect the candidate worktrees.",
      cwd: "/tmp/stave",
      runtimeHints:
        providerId === "codex"
          ? {
              codexBinaryPath: "/opt/codex",
              codexReasoningEffort: "high" as const,
            }
          : {
              claudeBinaryPath: "/opt/claude",
              claudeEffort: "high" as const,
            },
    },
    policy: {
      maxAttempts: 3,
      timeoutMs: 120_000,
      maxTurns: 16,
      maxOutputBytes: 64_000,
      maxEvents: 256,
    },
  };
}

describe("SecondaryRunExecutor provider policy", () => {
  test("forces fresh, sandboxed Claude execution and denies network tools", async () => {
    let providerArgs: StreamTurnArgs | null = null;
    const cleanedTaskIds: string[] = [];
    const result = await executeSecondaryProviderRun(
      createRequest("claude-code"),
      {
        streamTurn: async (args) => {
          providerArgs = args;
          return [
            { type: "text", text: '{"winner":"B"}' },
            { type: "done", stop_reason: "end_turn" },
          ];
        },
        cleanupTask: ({ taskId }) => {
          cleanedTaskIds.push(taskId);
          return { ok: true, message: "cleaned" };
        },
      },
    );

    expect(result).toMatchObject({
      status: "completed",
      text: '{"winner":"B"}',
      providerId: "claude-code",
      model: "claude-sonnet-5",
      executionId: "execution-1",
      truncated: false,
    });
    expect(providerArgs).toMatchObject({
      turnId: "execution-1",
      taskId: "secondary:execution-1",
      executionPolicy: "secondary-read-only",
      conversation: undefined,
      runtimeOptions: {
        model: "claude-sonnet-5",
        providerTimeoutMs: 120_000,
        claudePermissionMode: "plan",
        claudeSandboxEnabled: true,
        claudeAllowUnsandboxedCommands: false,
        claudeAllowDangerouslySkipPermissions: false,
        claudeAllowedTools: ["Read", "Glob", "Grep", "Bash"],
        claudeDisallowedTools: [
          "Write",
          "Edit",
          "MultiEdit",
          "NotebookEdit",
          "WebFetch",
          "WebSearch",
        ],
        claudeMaxTurns: 16,
        claudeStrictMcpConfig: true,
      },
    });
    expect(providerArgs?.runtimeOptions?.claudeResumeSessionId).toBeUndefined();
    expect(providerArgs?.runtimeOptions?.codexResumeThreadId).toBeUndefined();
    expect(cleanedTaskIds).toEqual(["secondary:execution-1"]);

    expect(
      shouldDenyClaudeToolInSecondaryReadOnly({
        toolName: "Bash",
        input: { command: "git diff --stat" },
      }),
    ).toBe(false);
    expect(
      shouldDenyClaudeToolInSecondaryReadOnly({
        toolName: "Bash",
        input: { command: "curl https://example.com" },
      }),
    ).toBe(true);
    expect(
      shouldDenyClaudeToolInSecondaryReadOnly({
        toolName: "mcp__github__get_file_contents",
        input: {},
      }),
    ).toBe(true);

    const queryOptions = buildClaudeQueryOptions({
      cwd: "/tmp/stave",
      claudeExecutablePath: "/opt/claude",
      runtimeOptions: providerArgs?.runtimeOptions,
      secondaryReadOnly: true,
    });
    expect(queryOptions.sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      network: {
        deniedDomains: ["*"],
        allowAllUnixSockets: false,
        allowLocalBinding: false,
      },
      filesystem: {
        denyWrite: ["/"],
      },
    });
    expect(queryOptions.settings).toMatchObject({
      permissions: {
        deny: [
          "Edit(*)",
          "Write(*)",
          "NotebookEdit(*)",
          "WebFetch(*)",
          "WebSearch",
        ],
      },
    });
  });

  test("forces ephemeral, no-network Codex execution", () => {
    expect(
      buildSecondaryProviderRuntimeOptions({
        providerId: "codex",
        model: "gpt-5.6-sol",
        policy: createRequest().policy,
        runtimeHints: {
          codexBinaryPath: "/opt/codex",
          codexReasoningEffort: "high",
        },
      }),
    ).toMatchObject({
      model: "gpt-5.6-sol",
      providerTimeoutMs: 120_000,
      codexBinaryPath: "/opt/codex",
      codexReasoningEffort: "high",
      codexApprovalPolicy: "never",
      codexFileAccess: "read-only",
      codexNetworkAccess: false,
      codexWebSearch: "disabled",
      codexPlanMode: false,
      codexShowRawReasoning: false,
    });
  });

  test("bounds collected events and UTF-8 output", async () => {
    const request = {
      ...createRequest(),
      policy: {
        ...createRequest().policy,
        maxOutputBytes: 1_024,
        maxEvents: 2,
      },
    };
    const events: BridgeEvent[] = [
      { type: "text", text: "한".repeat(600) },
      { type: "thinking", text: "hidden" },
      { type: "text", text: "tail" },
      { type: "done", stop_reason: "end_turn" },
    ];
    const result = await executeSecondaryProviderRun(request, {
      streamTurn: async () => events,
      cleanupTask: () => ({ ok: true, message: "cleaned" }),
    });

    expect(result.status).toBe("completed");
    expect(result.truncated).toBe(true);
    expect(result.collectedEventCount).toBe(2);
    expect(result.eventCount).toBe(4);
    expect(
      new TextEncoder().encode(result.text).byteLength,
    ).toBeLessThanOrEqual(1_024);
  });

  test("returns sanitized terminal failure without raw events", async () => {
    const result = await executeSecondaryProviderRun(createRequest(), {
      streamTurn: async () => [
        {
          type: "error",
          message: ` ${"failure ".repeat(300)} `,
          recoverable: false,
        },
        { type: "done", stop_reason: "runtime_failure" },
      ],
      cleanupTask: () => ({ ok: true, message: "cleaned" }),
    });

    expect(result.status).toBe("failed");
    expect(result.error?.length).toBeLessThanOrEqual(1_000);
    expect(result).not.toHaveProperty("events");
  });
});
