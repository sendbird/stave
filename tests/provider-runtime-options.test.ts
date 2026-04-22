import { describe, expect, test } from "bun:test";
import { createDefaultStaveAutoRoleRuntimeOverrides } from "@/lib/providers/stave-auto-profile";
import {
  applyProjectBasePromptToRuntimeOptions,
  buildProviderRuntimeOptions,
  normalizeCodexApprovalPolicy,
} from "@/store/provider-runtime-options";

const settings = {
  chatStreamingEnabled: true,
  providerDebugStream: false,
  providerTimeoutMs: 3600000,
  claudeBinaryPath: "",
  claudePermissionMode: "acceptEdits",
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: true,
  claudeAllowUnsandboxedCommands: true,
  claudeAdvisorModel: "",
  claudeEffort: "medium",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: true,
  claudeFastMode: false,
  claudeFastModeVisible: true,
  codexFileAccess: "workspace-write",
  codexNetworkAccess: false,
  codexApprovalPolicy: "untrusted",
  codexBinaryPath: "",
  codexReasoningEffort: "medium",
  codexWebSearch: "cached",
  codexShowRawReasoning: false,
  codexReasoningSummary: "auto",
  codexReasoningSummarySupport: "auto",
  codexFastMode: true,
  codexPlanMode: false,
  codexFastModeVisible: true,
  staveAutoClassifierModel: "claude-haiku-4-5",
  staveAutoSupervisorModel: "claude-sonnet-4-6",
  staveAutoPlanModel: "claude-opus-4-6",
  staveAutoAnalyzeModel: "claude-sonnet-4-6",
  staveAutoImplementModel: "gpt-5.4",
  staveAutoQuickEditModel: "gpt-5.4",
  staveAutoGeneralModel: "claude-sonnet-4-6",
  staveAutoVerifyModel: "claude-haiku-4-5",
  staveAutoOrchestrationMode: "auto",
  staveAutoMaxSubtasks: 3,
  staveAutoMaxParallelSubtasks: 2,
  staveAutoAllowCrossProviderWorkers: true,
  staveAutoFastMode: false,
  staveAutoRoleRuntimeOverrides: createDefaultStaveAutoRoleRuntimeOverrides(),
} as const;

describe("normalizeCodexApprovalPolicy", () => {
  test("falls back to the safe default when persisted data is invalid", () => {
    expect(normalizeCodexApprovalPolicy({ value: "bogus" })).toBe("untrusted");
  });
});

describe("buildProviderRuntimeOptions", () => {
  test("prepends the project base prompt ahead of an existing system prompt", () => {
    expect(
      applyProjectBasePromptToRuntimeOptions({
        runtimeOptions: {
          model: "claude-sonnet-4-6",
          claudeSystemPrompt: "Existing system prompt",
        },
        projectBasePrompt: "Project rules",
      }),
    ).toMatchObject({
      claudeSystemPrompt: "Project rules\n\nExisting system prompt",
    });
  });

  test("leaves runtime options unchanged when the project base prompt is empty", () => {
    const runtimeOptions = {
      model: "gpt-5.4",
      codexFileAccess: "workspace-write" as const,
    };

    expect(
      applyProjectBasePromptToRuntimeOptions({
        runtimeOptions,
        projectBasePrompt: "   ",
      }),
    ).toBe(runtimeOptions);
  });

  test("forces Codex plan turns onto a read-only sandbox", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "codex",
        model: "gpt-5.4",
        settings: {
          ...settings,
          codexFileAccess: "danger-full-access",
          codexPlanMode: true,
        },
        providerSession: null,
      }),
    ).toMatchObject({
      model: "gpt-5.4",
      codexApprovalPolicy: "never",
      codexFileAccess: "read-only",
      codexPlanMode: true,
    });
  });

  test("forwards the Claude binary override into runtime options", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings: {
          ...settings,
          claudeBinaryPath: "/tmp/claude",
        },
        providerSession: null,
      }),
    ).toMatchObject({
      model: "claude-sonnet-4-6",
      claudeBinaryPath: "/tmp/claude",
    });
  });

  test("forwards Claude xhigh effort into runtime options", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings: {
          ...settings,
          claudeEffort: "xhigh",
        },
        providerSession: null,
      }),
    ).toMatchObject({
      model: "claude-sonnet-4-6",
      claudeEffort: "xhigh",
    });
  });

  test.each([
    {
      sourceModel: "claude-haiku-4-5",
      expectedAdvisorModel: "claude-sonnet-4-6",
    },
    {
      sourceModel: "claude-sonnet-4-6",
      expectedAdvisorModel: "claude-opus-4-7",
    },
    {
      sourceModel: "claude-opus-4-6",
      expectedAdvisorModel: "claude-opus-4-7",
    },
    {
      sourceModel: "claude-opus-4-7",
      expectedAdvisorModel: "claude-opus-4-7",
    },
    {
      sourceModel: "claude-sonnet-4-6[1m]",
      expectedAdvisorModel: "claude-opus-4-7",
    },
  ])(
    "maps advisor source model `$sourceModel` to `$expectedAdvisorModel`",
    ({ sourceModel, expectedAdvisorModel }) => {
      expect(
        buildProviderRuntimeOptions({
          provider: "claude-code",
          model: "claude-sonnet-4-6",
          settings: {
            ...settings,
            claudeAdvisorModel: sourceModel,
          },
          providerSession: null,
        }),
      ).toMatchObject({
        model: "claude-sonnet-4-6",
        claudeAdvisorModel: expectedAdvisorModel,
      });
    },
  );

  test("omits advisorModel when advisor forwarding is disabled", () => {
    const runtimeOptions = buildProviderRuntimeOptions({
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      settings: {
        ...settings,
        claudeAdvisorModel: "",
      },
      providerSession: null,
    });

    expect(runtimeOptions).not.toHaveProperty("claudeAdvisorModel");
  });

  test("forwards both resume ids when Stave routes across providers", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "stave",
        model: "stave-auto",
        settings,
        providerSession: {
          "claude-code": "claude-session-1",
          codex: "codex-thread-1",
        },
      }),
    ).toMatchObject({
      model: "stave-auto",
      claudeResumeSessionId: "claude-session-1",
      codexResumeThreadId: "codex-thread-1",
      codexFastMode: true,
      codexPlanMode: false,
    });
  });

  test("limits resume ids to the active provider in direct turns", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings,
        providerSession: {
          "claude-code": "claude-session-1",
          codex: "codex-thread-1",
        },
      }),
    ).toMatchObject({
      model: "claude-sonnet-4-6",
      claudeResumeSessionId: "claude-session-1",
    });

    expect(
      buildProviderRuntimeOptions({
        provider: "codex",
        model: "gpt-5.4",
        settings,
        providerSession: {
          "claude-code": "claude-session-1",
          codex: "codex-thread-1",
        },
      }),
    ).toMatchObject({
      model: "gpt-5.4",
      codexResumeThreadId: "codex-thread-1",
      codexFileAccess: "workspace-write",
      codexPlanMode: false,
    });
  });
});
