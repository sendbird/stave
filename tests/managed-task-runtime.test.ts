import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { DelegationPolicyStore } from "../electron/persistence/delegation-policy-store";
import {
  resolveManagedTaskRuntimeOptions,
  userSettingsPermissionOptions,
} from "@/lib/providers/managed-task-runtime";
import { DEFAULT_PROVIDER_TIMEOUT_MS } from "@/lib/providers/runtime-option-contract";

describe("resolveManagedTaskRuntimeOptions", () => {
  test("adds timeout without granting permissions when omitted", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
    });
    expect(options.claudePermissionMode).toBeUndefined();
    expect(options.claudeAllowDangerouslySkipPermissions).toBeUndefined();
    expect(options.claudeAllowUnsandboxedCommands).toBeUndefined();
    expect(options.claudeSandboxEnabled).toBeUndefined();
    expect(options.providerTimeoutMs).toBe(DEFAULT_PROVIDER_TIMEOUT_MS);
  });

  test("uses the regular-task provider timeout when the caller omits one", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "codex",
      runtimeOptions: { model: "gpt-5" },
    });
    expect(options.providerTimeoutMs).toBe(DEFAULT_PROVIDER_TIMEOUT_MS);
  });

  test("keeps an explicit caller provider timeout", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: { providerTimeoutMs: 86_400_000 },
    });
    expect(options.providerTimeoutMs).toBe(86_400_000);
  });

  test("uses the Settings-synced default when the caller omits a timeout", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "codex",
      defaultProviderTimeoutMs: 86_400_000,
    });
    expect(options.providerTimeoutMs).toBe(86_400_000);
  });

  test("keeps an explicit caller timeout over the Settings default", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: { providerTimeoutMs: 3_600_000 },
      defaultProviderTimeoutMs: 86_400_000,
    });
    expect(options.providerTimeoutMs).toBe(3_600_000);
  });

  test("preserves native auto without turning it into bypass", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: { claudePermissionMode: "auto", claudeEffort: "high" },
    });
    expect(options.claudePermissionMode).toBe("auto");
    expect(options.claudeEffort).toBe("high");
  });

  test("keeps an explicit caller permission mode", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: { claudePermissionMode: "dontAsk" },
    });
    expect(options.claudePermissionMode).toBe("dontAsk");
    expect(options.claudeAllowDangerouslySkipPermissions).toBeUndefined();
  });

  test("does not override caller sandbox choices", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: {
        claudeSandboxEnabled: true,
        claudeAllowUnsandboxedCommands: false,
      },
    });
    expect(options.claudeSandboxEnabled).toBe(true);
    expect(options.claudeAllowUnsandboxedCommands).toBe(false);
  });

  test("leaves omitted Codex permissions to the provider defaults", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "codex",
      runtimeOptions: { model: "gpt-5" },
    });
    expect(options.codexApprovalPolicy).toBeUndefined();
    expect(options.codexFileAccess).toBeUndefined();
    expect(options.codexAutoApproveStaveLocalMcpTools).toBeUndefined();
    expect(options.model).toBe("gpt-5");
  });

  test("keeps an explicit Codex approval policy", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "codex",
      runtimeOptions: { codexApprovalPolicy: "on-request" },
    });
    expect(options.codexApprovalPolicy).toBe("on-request");
  });
});

describe("userSettingsPermissionOptions", () => {
  const settings = {
    "claude-code": {
      claudePermissionMode: "auto" as const,
      claudeSandboxEnabled: false,
      claudeAllowUnsandboxedCommands: true,
      claudeSandboxCredentialFiles: ["~/.config/service/credentials.json"],
    },
    codex: {
      codexApprovalPolicy: "never" as const,
      codexFileAccess: "danger-full-access" as const,
      codexNetworkAccess: true,
      codexAutoApproveStaveLocalMcpTools: true,
    },
  };

  test("uses the synced Claude settings over the guarded defaults", () => {
    expect(userSettingsPermissionOptions("claude-code", settings)).toEqual({
      claudePermissionMode: "auto",
      claudeAllowDangerouslySkipPermissions: false,
      claudeSandboxEnabled: false,
      claudeAllowUnsandboxedCommands: true,
      claudeAllowedTools: [],
      claudeSandboxCredentialFiles: ["~/.config/service/credentials.json"],
    });
  });

  test("uses the synced Codex settings over the guarded defaults", () => {
    expect(userSettingsPermissionOptions("codex", settings)).toEqual({
      codexApprovalPolicy: "never",
      codexFileAccess: "danger-full-access",
      codexNetworkAccess: true,
      codexAutoApproveStaveLocalMcpTools: true,
    });
  });

  test("falls back to guarded defaults, not runtime fallbacks, when nothing was synced", () => {
    expect(userSettingsPermissionOptions("claude-code", null)).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeAllowedTools: [],
    });
    expect(userSettingsPermissionOptions("codex", undefined)).toEqual({
      codexApprovalPolicy: "untrusted",
      codexFileAccess: "workspace-write",
      codexNetworkAccess: false,
      codexAutoApproveStaveLocalMcpTools: false,
    });
  });

  test("reads what the renderer synced into the host store, and guarded defaults before any sync", () => {
    const db = new Database(":memory:");
    db.exec(
      "CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    const store = new DelegationPolicyStore(db as never);
    expect(store.loadSettings()).toBeNull();
    expect(userSettingsPermissionOptions("claude-code", store.loadSettings())?.claudePermissionMode).toBe("default");
    expect(userSettingsPermissionOptions("codex", store.loadSettings())?.codexApprovalPolicy).toBe("untrusted");

    store.saveSettings(settings);
    expect(userSettingsPermissionOptions("claude-code", store.loadSettings())).toMatchObject(settings["claude-code"]);
    expect(userSettingsPermissionOptions("codex", store.loadSettings())).toEqual(settings.codex);
  });

  test("leaves providers without synced permission settings to their runtime", () => {
    expect(userSettingsPermissionOptions("cursor", settings)).toBeUndefined();
  });
});
