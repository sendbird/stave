import { describe, expect, test } from "bun:test";
import {
  buildChatInputGoalStatus,
  buildChatInputRuntimeStatusItems,
  buildCommandCatalogRuntimeOptions,
  cycleClaudeEffortValue,
  cycleCodexEffortValue,
} from "@/components/session/chat-input.runtime";
import { getPromptInputRuntimeProfile } from "@/components/ai-elements/prompt-input-runtime-bar";

const updateSettings = () => {};

const baseArgs = {
  activeProvider: "codex" as const,
  advisorSummary: "Off",
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
  test("summarizes protected, overridden, and elevated runtime profiles", () => {
    expect(
      getPromptInputRuntimeProfile([
        { id: "sandbox", label: "Files", value: "Workspace Write" },
      ]),
    ).toMatchObject({ label: "Safe", tone: "default" });

    expect(
      getPromptInputRuntimeProfile([
        {
          id: "plan-mode",
          label: "Planning",
          value: "On",
          tone: "warning",
        },
      ]),
    ).toMatchObject({ label: "Custom", tone: "custom" });

    expect(
      getPromptInputRuntimeProfile([
        {
          id: "sandbox",
          label: "Files",
          value: "Danger Full Access",
          tone: "warning",
        },
      ]),
    ).toMatchObject({ label: "Elevated", tone: "warning" });
  });

  test("cycles Claude effort in provider order", () => {
    expect(cycleClaudeEffortValue("low")).toBe("medium");
    expect(cycleClaudeEffortValue("medium")).toBe("high");
    expect(cycleClaudeEffortValue("high")).toBe("xhigh");
    expect(cycleClaudeEffortValue("xhigh")).toBe("max");
    expect(cycleClaudeEffortValue("max")).toBe("low");
  });

  test("cycles Codex effort through max and ultra, mapping legacy minimal to low", () => {
    expect(cycleCodexEffortValue("low")).toBe("medium");
    expect(cycleCodexEffortValue("medium")).toBe("high");
    expect(cycleCodexEffortValue("high")).toBe("xhigh");
    expect(cycleCodexEffortValue("xhigh")).toBe("max");
    expect(cycleCodexEffortValue("max")).toBe("ultra");
    expect(cycleCodexEffortValue("ultra")).toBe("low");
    // Legacy persisted "minimal" is no longer in the cycle; it falls back to
    // the first entry.
    expect(cycleCodexEffortValue("minimal")).toBe("low");
  });

  test("scopes the Codex effort cycle to the model when provided", () => {
    // GPT-5.6 Luna has no "ultra" tier — the cycle should wrap from "max"
    // back to "low" instead of landing on "ultra".
    expect(cycleCodexEffortValue("max", "gpt-5.6-luna")).toBe("low");
    expect(cycleCodexEffortValue("xhigh", "gpt-5.6-luna")).toBe("max");
    // Sol/Terra still cycle through "ultra".
    expect(cycleCodexEffortValue("max", "gpt-5.6-sol")).toBe("ultra");
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
    expect(buildCommandCatalogRuntimeOptions(baseArgs)).toBeUndefined();

    expect(
      buildCommandCatalogRuntimeOptions({
        ...baseArgs,
        activeProvider: "claude-code",
      }),
    ).toMatchObject({
      claudeBinaryPath: "/opt/homebrew/bin/claude",
    });
  });

  test("omits runtime options that cannot change the command catalog", () => {
    // Each extra option here would widen the ChatInput effect's dep set, and
    // every re-run spawns a `claude` subprocess that reconnects every MCP
    // server — duplicating remote connector handshakes (Figma, Slack).
    const options = buildCommandCatalogRuntimeOptions({
      ...baseArgs,
      activeProvider: "claude-code",
      claudeSettingSources: ["user", "project"],
    });

    expect(options).toEqual({
      claudeBinaryPath: "/opt/homebrew/bin/claude",
      claudeSettingSources: ["user", "project"],
    });
  });
});

describe("advisor row in the runtime summary", () => {
  function findAdvisor(items: ReturnType<typeof buildChatInputRuntimeStatusItems>) {
    return items.find((item) => item.id === "advisor");
  }

  test("both providers report the advisor pair, since either can advise", () => {
    for (const activeProvider of ["codex", "claude-code"] as const) {
      expect(
        findAdvisor(
          buildChatInputRuntimeStatusItems({
            ...baseArgs,
            activeProvider,
            claudeSettingSources: ["project"],
            claudeTaskBudgetTokens: 0,
            advisorSummary: "Claude · Claude Fable 5.1",
          }),
        ),
      ).toEqual({
        id: "advisor",
        label: "Advisor",
        value: "Claude · Claude Fable 5.1",
      });
    }
  });

  test("an armed advisor makes the runtime profile read as a custom setup", () => {
    expect(
      getPromptInputRuntimeProfile([
        { id: "advisor", label: "Advisor", value: "Codex · GPT-5.6 Sol" },
      ]).label,
    ).toBe("Custom");
  });

  test("an off advisor leaves the profile alone", () => {
    expect(
      getPromptInputRuntimeProfile([
        { id: "advisor", label: "Advisor", value: "Off" },
      ]).label,
    ).toBe("Safe");
  });

  test("an armed advisor is never mistaken for elevated access", () => {
    expect(
      getPromptInputRuntimeProfile([
        { id: "advisor", label: "Advisor", value: "Codex · GPT-5.6 Sol" },
      ]).tone,
    ).not.toBe("warning");
  });
});
