import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import { normalizeProviderTimeoutMs } from "@/store/editor.utils";
import {
  applyRepositoryBasePromptToRuntimeOptions,
  buildProviderRuntimeOptions,
  normalizeCodexApprovalPolicy,
} from "@/store/provider-runtime-options";

const settings = {
  chatStreamingEnabled: true,
  providerDebugStream: false,
  providerTimeoutMs: 3600000,
  claudeBinaryPath: "",
  providerBrowserAutoFallback: false,
  providerBrowserAutoFallbackDomains: "",
  claudePermissionMode: "acceptEdits",
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: true,
  claudeAllowUnsandboxedCommands: true,
  claudeSandboxCredentialFiles: "",
  claudeSandboxCredentialEnvVars: "",
  claudeEffort: "medium",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: true,
  claudePromptSuggestions: true,
  claudeForwardSubagentText: false,
  claudeEnableFileCheckpointing: false,
  claudeForkSession: false,
  claudeStrictMcpConfig: false,
  claudeFastMode: false,
  claudeSkills: "",
  claudePluginPaths: "",
  claudePluginMode: "claude-config",
  claudePluginOverrides: {},
  claudeAgentName: "",
  claudeFallbackModel: "",
  claudeResumeSessionAt: "",
  codexFileAccess: "workspace-write",
  codexNetworkAccess: false,
  codexApprovalPolicy: "untrusted",
  codexBinaryPath: "",
  codexReasoningEffort: "medium",
  codexWebSearch: "cached",
  codexAppToolApprovalMode: "inherit",
  codexShowRawReasoning: false,
  codexReasoningSummary: "auto",
  codexReasoningSummarySupport: "auto",
  codexFastMode: true,
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
  test("supports 12 and 24 hour provider timeout windows with 12 hours as default", () => {
    expect(DEFAULT_PROVIDER_TIMEOUT_MS).toBe(43_200_000);
    expect(PROVIDER_TIMEOUT_OPTIONS).toContain(43_200_000);
    expect(PROVIDER_TIMEOUT_OPTIONS).toContain(86_400_000);
    expect(normalizeProviderTimeoutMs({ value: 43_200_000 })).toBe(43_200_000);
    expect(normalizeProviderTimeoutMs({ value: 86_400_000 })).toBe(86_400_000);
    expect(normalizeProviderTimeoutMs({ value: 86_400_001 })).toBe(43_200_000);
  });

  test("prepends the project base prompt ahead of an existing system prompt", () => {
    expect(
      applyRepositoryBasePromptToRuntimeOptions({
        runtimeOptions: {
          model: "claude-sonnet-4-6",
          claudeSystemPrompt: "Existing system prompt",
        },
        repositoryBasePrompt: "Project rules",
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
      applyRepositoryBasePromptToRuntimeOptions({
        runtimeOptions,
        repositoryBasePrompt: "   ",
      }),
    ).toBe(runtimeOptions);
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
          claudeSandboxCredentialFiles:
            "/tmp/service-token, /tmp/service-token\n/tmp/oauth-token",
          claudeSandboxCredentialEnvVars:
            "SERVICE_TOKEN, SERVICE_TOKEN\nOAUTH_TOKEN",
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
      claudeSandboxCredentialFiles: ["/tmp/service-token", "/tmp/oauth-token"],
      claudeSandboxCredentialEnvVars: ["SERVICE_TOKEN", "OAUTH_TOKEN"],
    });
  });

  test("forwards the Claude plugin policy and per-plugin overrides", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings: {
          ...settings,
          claudePluginMode: "all",
          claudePluginOverrides: {
            "eli5@claude-community": false,
            " padded@shop ": true,
            "bogus@shop": "yes",
          },
        },
        providerSession: null,
      }),
    ).toMatchObject({
      claudePluginMode: "all",
      claudePluginOverrides: {
        "eli5@claude-community": false,
        "padded@shop": true,
      },
    });
  });

  test("falls back to the Claude-config plugin policy for unknown values", () => {
    const options = buildProviderRuntimeOptions({
      provider: "claude-code",
      model: "claude-sonnet-4-6",
      settings: {
        ...settings,
        claudePluginMode: "bogus",
        claudePluginOverrides: {},
      },
      providerSession: null,
    });

    expect(options.claudePluginMode).toBe("claude-config");
    expect(options).not.toHaveProperty("claudePluginOverrides");
  });

  test("uses Opus 4.8 as the automatic fallback for Opus 5", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-opus-5",
        settings,
        providerSession: null,
      }),
    ).toMatchObject({
      model: "claude-opus-5",
      claudeFallbackModel: "claude-opus-4-8",
    });
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-opus-5[1m]",
        settings,
        providerSession: null,
      }),
    ).toMatchObject({
      model: "claude-opus-5[1m]",
      claudeFallbackModel: "claude-opus-4-8[1m]",
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
          codexWebSearch: "indexed",
          codexAppToolApprovalMode: "writes",
        },
        providerSession: null,
      }),
    ).toMatchObject({
      codexApprovalPolicy: "on-failure",
      codexWebSearch: "indexed",
      codexAppToolApprovalMode: "writes",
    });
  });

  test("marks regular Codex Auto turns for Stave Local MCP auto-approval", () => {
    const autoOptions = buildProviderRuntimeOptions({
      provider: "codex",
      model: "gpt-5.6-terra",
      settings: {
        ...settings,
        codexApprovalPolicy: "never",
        codexFileAccess: "danger-full-access",
      },
      providerSession: null,
    });
    const guidedOptions = buildProviderRuntimeOptions({
      provider: "codex",
      model: "gpt-5.6-terra",
      settings,
      providerSession: null,
    });

    expect(autoOptions).toMatchObject({
      codexAutoApproveStaveLocalMcpTools: true,
      codexApprovalPolicy: "never",
      codexFileAccess: "danger-full-access",
    });
    expect(guidedOptions).not.toHaveProperty(
      "codexAutoApproveStaveLocalMcpTools",
    );
  });

  test("sends no Advisor or Worker runtime option", () => {
    const options = buildProviderRuntimeOptions({ provider: "claude-code", model: "claude-sonnet-4-6", settings });
    expect(options).not.toHaveProperty("advisorTarget");
    expect(options).not.toHaveProperty("workerIntent");
    expect(options).not.toHaveProperty("nativeSubagents");
  });

  test("limits resume ids to the active provider in direct turns", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings,
        providerSession: {
          "claude-code": "claude-session-1",
          codex: {
            nativeSessionId: "codex-thread-1",
            syncedThroughMessageId: "task-1-m-8",
          },
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
          codex: {
            nativeSessionId: "codex-thread-1",
            syncedThroughMessageId: "task-1-m-8",
          },
        },
      }),
    ).toMatchObject({
      model: "gpt-5.4",
      codexResumeThreadId: "codex-thread-1",
      codexFileAccess: "workspace-write",
    });
  });
});

describe("provider browser automatic fallback runtime options", () => {
  test("forwards the fallback setting and host list to both providers", () => {
    for (const provider of ["claude-code", "codex"] as const) {
      expect(
        buildProviderRuntimeOptions({
          provider,
          model: provider === "codex" ? "gpt-5-codex" : "claude-sonnet-4-6",
          settings: {
            ...settings,
            providerBrowserAutoFallback: true,
            providerBrowserAutoFallbackDomains: "wiki.corp.example",
          },
        }),
      ).toMatchObject({
        providerBrowserAutoFallback: true,
        providerBrowserAutoFallbackDomains: "wiki.corp.example",
      });
    }
  });

  test("leaves the fallback off by default", () => {
    expect(
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        settings,
      }),
    ).toMatchObject({ providerBrowserAutoFallback: false });
  });
});
