import { describe, expect, test } from "bun:test";
import {
  buildChatInputGoalStatus,
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
  cycleClaudeEffortValue,
  cycleCodexEffortValue,
} from "@/components/session/chat-input.runtime";

const updateSettings = () => {};

const baseArgs = {
  activeProvider: "codex" as const,
  providerTimeoutMs: 3600000,
  claudePermissionMode: "acceptEdits" as const,
  claudePermissionModeBeforePlan: null,
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: true,
  claudeAllowUnsandboxedCommands: true,
  claudeEffort: "medium" as const,
  claudeThinkingMode: "adaptive" as const,
  claudeAgentProgressSummaries: true,
  claudeFastMode: false,
  claudeBinaryPath: "/opt/homebrew/bin/claude",
  codexFileAccess: "workspace-write" as const,
  codexNetworkAccess: true,
  codexApprovalPolicy: "on-request" as const,
  codexReasoningEffort: "high" as const,
  codexWebSearch: "live" as const,
  codexShowRawReasoning: true,
  codexReasoningSummary: "detailed" as const,
  codexReasoningSummarySupport: "enabled" as const,
  codexFastMode: true,
  codexPlanMode: true,
  codexBinaryPath: "/opt/homebrew/bin/codex",
  updateSettings,
};

describe("chat-input runtime helpers", () => {
  test("cycles Claude effort in provider order", () => {
    expect(cycleClaudeEffortValue("low")).toBe("medium");
    expect(cycleClaudeEffortValue("medium")).toBe("high");
    expect(cycleClaudeEffortValue("high")).toBe("xhigh");
    expect(cycleClaudeEffortValue("xhigh")).toBe("max");
    expect(cycleClaudeEffortValue("max")).toBe("low");
  });

  test("cycles Codex effort with minimal at the end of the loop", () => {
    expect(cycleCodexEffortValue("low")).toBe("medium");
    expect(cycleCodexEffortValue("medium")).toBe("high");
    expect(cycleCodexEffortValue("high")).toBe("xhigh");
    expect(cycleCodexEffortValue("xhigh")).toBe("minimal");
    expect(cycleCodexEffortValue("minimal")).toBe("low");
  });

  test("surfaces Codex runtime status items including binary override", () => {
    const items = buildChatInputRuntimeStatusItems(baseArgs);

    expect(items.find((item) => item.id === "timeout")?.value).toBe("1 hour");
    expect(items.find((item) => item.id === "sandbox")?.value).toBe(
      "Read Only",
    );
    expect(items.find((item) => item.id === "plan-mode")?.value).toBe("On");
    expect(items.find((item) => item.id === "summary")?.value).toBe("Detailed");
    expect(items.find((item) => item.id === "codex-binary")?.value).toBe(
      ".../bin/codex",
    );
    expect(items.find((item) => item.id === "goal")).toBeUndefined();
  });

  test("surfaces Codex goal status with compact progress", () => {
    const status = buildChatInputGoalStatus({
      providerGoal: {
        providerId: "codex",
        nativeSessionId: "thread-1",
        objective: "Finish the migration and keep the provider tests green",
        status: "budgetLimited",
        tokenBudget: 10_000,
        tokensUsed: 2500,
        timeUsedSeconds: 125,
        createdAt: 0,
        updatedAt: 0,
      },
    });

    expect(status).toEqual({
      statusLabel: "budget limited",
      objective: "Finish the migration and keep the provider tests green",
      tokenLabel: "2.5k / 10k tokens (25%)",
      elapsedLabel: "2m elapsed",
      progressPercent: 25,
      tone: "warning",
    });
  });

  test("keeps an active Codex goal label distinct from turn running state", () => {
    const status = buildChatInputGoalStatus({
      providerGoal: {
        providerId: "codex",
        nativeSessionId: "thread-1",
        objective: "Ship the goal progress indicator",
        status: "active",
        tokenBudget: null,
        tokensUsed: 120,
        timeUsedSeconds: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    });

    expect(status).toMatchObject({
      statusLabel: "active",
      tokenLabel: "120 tokens",
      progressPercent: null,
      tone: "default",
    });
  });

  test("only forwards command-catalog runtime options for Claude", () => {
    expect(
      buildCommandCatalogRuntimeOptions({
        ...baseArgs,
        model: "claude-sonnet-4-6",
      }),
    ).toBeUndefined();

    expect(
      buildCommandCatalogRuntimeOptions({
        ...baseArgs,
        activeProvider: "claude-code",
        model: "claude-sonnet-4-6",
      }),
    ).toMatchObject({
      model: "claude-sonnet-4-6",
      claudeBinaryPath: "/opt/homebrew/bin/claude",
      claudePermissionMode: "acceptEdits",
      claudeThinkingMode: "adaptive",
    });
  });
});
