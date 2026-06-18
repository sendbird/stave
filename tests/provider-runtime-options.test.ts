import { describe, expect, test } from "bun:test";
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
  claudePromptSuggestions: true,
  claudeForwardSubagentText: false,
  claudeEnableFileCheckpointing: false,
  claudeForkSession: false,
  claudeStrictMcpConfig: false,
  claudeFastMode: false,
  claudeFastModeVisible: true,
  claudeSkills: "",
  claudePluginPaths: "",
  claudeAgentName: "",
  claudeFallbackModel: "",
  claudeResumeSessionAt: "",
  codexFileAccess: "workspace-write",
  codexNetworkAccess: false,
  codexApprovalPolicy: "untrusted",
  codexBinaryPath: "",
  codexReasoningEffort: "medium",
  codexWebSearch: "cached",
  codexShowRawReasoning: false,
  codexReasoningSummary: "auto",
  codexReasoningSummarySupport: "auto",
  codexAdditionalReadableRoots: "",
  codexFastMode: true,
  codexPlanMode: false,
  codexFastModeVisible: true,
  trustedTools: [],
} as const;

describe("normalizeCodexApprovalPolicy", () => {
  test("falls back to the safe default when persisted data is invalid", () => {
    expect(normalizeCodexApprovalPolicy({ value: "bogus" })).toBe("untrusted");
  });

  test("preserves the Codex on-failure approval mode", () => {
    expect(normalizeCodexApprovalPolicy({ value: "on-failure" })).toBe(
      "on-failure",
    );
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

  test("forwards latest Claude Agent SDK controls into runtime options", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings: {
          ...settings,
          claudePromptSuggestions: false,
          claudeForwardSubagentText: true,
          claudeEnableFileCheckpointing: true,
          claudeForkSession: true,
          claudeStrictMcpConfig: true,
          claudeSkills: "all",
          claudePluginPaths: "/tmp/plugin-a, /tmp/plugin-b",
          claudeAgentName: "code-reviewer",
          claudeFallbackModel: "claude-haiku-4-5",
          claudeResumeSessionAt: "message-uuid",
        },
        providerSession: null,
      }),
    ).toMatchObject({
      claudePromptSuggestions: false,
      claudeForwardSubagentText: true,
      claudeEnableFileCheckpointing: true,
      claudeForkSession: true,
      claudeStrictMcpConfig: true,
      claudeSkills: "all",
      claudePluginPaths: ["/tmp/plugin-a", "/tmp/plugin-b"],
      claudeAgentName: "code-reviewer",
      claudeFallbackModel: "claude-haiku-4-5",
      claudeResumeSessionAt: "message-uuid",
    });
  });

  test("forwards trusted approval tools and maps Claude non-Bash entries", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings: {
          ...settings,
          trustedTools: ["Edit", "bash:bun test", "edit"],
        },
        providerSession: null,
      }),
    ).toMatchObject({
      trustedTools: ["Edit", "bash:bun test"],
      claudeAllowedTools: ["Edit"],
    });
  });

  test("forwards latest Codex App Server controls into runtime options", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "codex",
        model: "gpt-5.5",
        settings: {
          ...settings,
          codexApprovalPolicy: "on-failure",
          codexAdditionalReadableRoots: "/tmp/context-a\n/tmp/context-b",
        },
        providerSession: null,
      }),
    ).toMatchObject({
      codexApprovalPolicy: "on-failure",
      codexAdditionalReadableRoots: ["/tmp/context-a", "/tmp/context-b"],
    });
  });

  test.each([
    {
      sourceModel: "claude-haiku-4-5",
      expectedAdvisorModel: "claude-sonnet-4-6",
    },
    {
      sourceModel: "claude-sonnet-4-6",
      expectedAdvisorModel: "claude-opus-4-8",
    },
    {
      sourceModel: "claude-opus-4-6",
      expectedAdvisorModel: "claude-opus-4-8",
    },
    {
      sourceModel: "claude-opus-4-7",
      expectedAdvisorModel: "claude-opus-4-8",
    },
    {
      sourceModel: "claude-sonnet-4-6[1m]",
      expectedAdvisorModel: "claude-opus-4-8",
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
