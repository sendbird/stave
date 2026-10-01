import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { DelegationPolicyStore } from "../electron/persistence/delegation-policy-store";
import {
  resolveDelegationPermissionPolicy,
  DelegationPermissionSettingsSchema,
  permissionOptions,
  restrictPermissionOptions,
  normalizedPermissionOptions,
} from "@/lib/runs/delegation-policy";
import { buildDelegatedTaskRuntimeOptions } from "@/lib/runs/delegated-task-runtime";

const auto = {
  claudePermissionMode: "auto" as const,
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: true,
};
const manual = {
  claudePermissionMode: "default" as const,
  claudeAllowDangerouslySkipPermissions: false,
};
const codexAuto = {
  codexApprovalPolicy: "never" as const,
  codexFileAccess: "danger-full-access" as const,
  codexNetworkAccess: true,
  codexAutoApproveStaveLocalMcpTools: true,
};

describe("delegation permission policy", () => {
  test("omitted profile preserves the effective same-provider parent override", () => {
    const policy = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      parent: { providerId: "claude-code", options: auto },
      settings: manual,
    });
    expect(policy).toMatchObject({
      source: "parent-turn",
      requestedProfile: "inherit",
      options: auto,
    });
    expect(
      buildDelegatedTaskRuntimeOptions({
        providerId: "claude-code",
        model: "chosen",
        effort: "high",
        permissionPolicy: policy,
      }),
    ).toMatchObject({
      model: "chosen",
      claudeEffort: "high",
      claudePermissionMode: "auto",
      claudeAllowDangerouslySkipPermissions: false,
    });
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "claude-code",
        parent: { providerId: "claude-code", options: manual },
        settings: auto,
      }).options,
    ).toMatchObject(manual);
  });
  test("cross-provider uses target settings and never translates raw flags", () => {
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "claude-code",
        parent: { providerId: "codex", options: codexAuto },
        settings: auto,
      }),
    ).toMatchObject({ source: "provider-settings", options: auto });
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "codex",
        parent: { providerId: "claude-code", options: auto },
        settings: {
          codexApprovalPolicy: "untrusted",
          codexFileAccess: "read-only",
        },
      }).options,
    ).toMatchObject({
      codexApprovalPolicy: "untrusted",
      codexFileAccess: "read-only",
    });
  });
  test("model auto cannot promote a manual policy; explicit profiles only narrow", () => {
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "claude-code",
        permissionProfile: "auto",
        settings: manual,
      }).options,
    ).toMatchObject(manual);
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "claude-code",
        permissionProfile: "guided",
        settings: auto,
      }).options.claudePermissionMode,
    ).toBe("acceptEdits");
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "codex",
        permissionProfile: "manual",
        settings: codexAuto,
      }).options,
    ).toMatchObject({
      codexApprovalPolicy: "untrusted",
      codexFileAccess: "workspace-write",
      codexAutoApproveStaveLocalMcpTools: false,
    });
  });
  test("retry and follow-up keep the snapshot while applying newly strengthened restrictions", () => {
    const recorded = resolveDelegationPermissionPolicy({
      providerId: "codex",
      settings: codexAuto,
    });
    const tightened = resolveDelegationPermissionPolicy({
      providerId: "codex",
      recorded,
      settings: {
        codexApprovalPolicy: "on-request",
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexAutoApproveStaveLocalMcpTools: false,
      },
    });
    expect(tightened).toMatchObject({
      source: "recorded-delegation",
      options: {
        codexApprovalPolicy: "on-request",
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexAutoApproveStaveLocalMcpTools: false,
      },
    });
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "codex",
        recorded: tightened,
        settings: codexAuto,
      }).options,
    ).toEqual(tightened.options);
  });
  test("saved-agent read-only ceiling enforces file restriction and is reapplied", () => {
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "codex",
        settings: codexAuto,
        permissionCeiling: "read-only",
      }).options.codexFileAccess,
    ).toBe("read-only");
    const recorded = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      settings: auto,
    });
    const restricted = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      recorded,
      settings: auto,
      permissionCeiling: "read-only",
    });
    expect(restricted.options.claudeDisallowedTools).toContain("Write");
    expect(restricted.options.claudeAllowDangerouslySkipPermissions).toBe(
      false,
    );
  });
  test("unknown settings remain guarded and invalid settings are refused", () => {
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "codex",
        permissionProfile: "auto",
      }).options,
    ).toMatchObject({
      codexApprovalPolicy: "untrusted",
      codexNetworkAccess: false,
    });
    expect(
      DelegationPermissionSettingsSchema.safeParse({
        "claude-code": { claudePermissionMode: "unsafe" },
        codex: {},
      }).success,
    ).toBe(false);
  });
  test("policy persistence survives a host store recreation without saving secret/session fields", () => {
    const db = new Database(":memory:");
    db.exec(
      "CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    const store = new DelegationPolicyStore(db as never);
    store.saveSettings({ "claude-code": auto, codex: codexAuto });
    store.saveEffective("parent", "claude-code", {
      ...auto,
      boundSecretIds: ["vault-id"],
      claudeResumeSessionId: "private-session",
      providerBrowserAutoFallbackDomains: ["private-host"],
    });
    const policy = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      parent: store.loadEffective("parent"),
    });
    store.saveTask("child", policy);
    const restored = new DelegationPolicyStore(db as never);
    expect(restored.loadTask("child")).toEqual(policy);
    expect(restored.loadSettings()?.codex).toEqual(codexAuto);
    expect(
      JSON.stringify(db.prepare("SELECT value_json FROM app_state").all()),
    ).not.toMatch(/vault-id|private-session|private-host/);
    expect(
      permissionOptions("claude-code", {
        ...auto,
        codexApprovalPolicy: "never",
        boundSecretIds: ["id"],
      }),
    ).toEqual(auto);
    db.close();
  });
});

test("new settings never add approval grants and plan-scope changes only tighten", () => {
  expect(
    restrictPermissionOptions({}, { claudeAllowedTools: ["Bash"] }),
  ).not.toHaveProperty("claudeAllowedTools");
  expect(
    restrictPermissionOptions(
      { claudeAllowedTools: ["Read"] },
      { claudeAllowedTools: ["Read", "Bash"] },
    ).claudeAllowedTools,
  ).toEqual(["Read"]);
  expect(
    restrictPermissionOptions(
      { claudeAllowedTools: ["Read", "Bash"] },
      { claudeAllowedTools: ["Read"] },
    ).claudeAllowedTools,
  ).toEqual(["Read"]);
  expect(
    restrictPermissionOptions(
      { claudePlanModeApprovalScope: "bashTaskAndMcp" },
      { claudePlanModeApprovalScope: "bash" },
    ).claudePlanModeApprovalScope,
  ).toBe("bash");
  expect(
    restrictPermissionOptions(
      { claudePlanModeApprovalScope: "strict" },
      { claudePlanModeApprovalScope: "bashTaskAndMcp" },
    ).claudePlanModeApprovalScope,
  ).toBe("strict");
});
test("deny-by-default and plan are preserved rather than ranked as wider modes", () => {
  for (const next of ["auto", "bypassPermissions"] as const) {
    expect(
      restrictPermissionOptions(
        { claudePermissionMode: "dontAsk" },
        { claudePermissionMode: next },
      ).claudePermissionMode,
    ).toBe("dontAsk");
    expect(
      restrictPermissionOptions(
        { claudePermissionMode: next },
        { claudePermissionMode: "dontAsk" },
      ).claudePermissionMode,
    ).toBe("dontAsk");
  }
  for (const previous of ["plan", "dontAsk"] as const) {
    for (const next of [
      "default",
      "acceptEdits",
      previous === "plan" ? "dontAsk" : "plan",
    ] as const) {
      expect(() =>
        restrictPermissionOptions(
          { claudePermissionMode: previous },
          { claudePermissionMode: next },
        ),
      ).toThrow("cannot be combined safely");
    }
  }
});

test("explicit guarded profiles cannot undo deny mode or retain approval-skip grants", () => {
  for (const permissionProfile of ["manual", "guided"] as const) {
    expect(() =>
      resolveDelegationPermissionPolicy({
        providerId: "claude-code",
        permissionProfile,
        settings: {
          claudePermissionMode: "dontAsk",
          claudeAllowedTools: ["Bash"],
        },
      }),
    ).toThrow("cannot be combined safely");
  }
});

test("a newly guarded saved-agent policy also removes local tool auto-approval", () => {
  const recorded = resolveDelegationPermissionPolicy({
    providerId: "codex",
    settings: codexAuto,
  });
  expect(
    resolveDelegationPermissionPolicy({
      providerId: "codex",
      recorded,
      settings: codexAuto,
      permissionCeiling: "manual",
    }).options.codexAutoApproveStaveLocalMcpTools,
  ).toBe(false);
});

test("credential deny lists are preserved and new restrictions are additive", () => {
  expect(
    restrictPermissionOptions(
      {
        claudeSandboxCredentialFiles: ["/tmp/blocked-old"],
        claudeSandboxCredentialEnvVars: ["OLD_KEY"],
      },
      {
        claudeSandboxCredentialFiles: ["/tmp/blocked-new"],
        claudeSandboxCredentialEnvVars: ["NEW_KEY"],
      },
    ),
  ).toMatchObject({
    claudeSandboxCredentialFiles: ["/tmp/blocked-old", "/tmp/blocked-new"],
    claudeSandboxCredentialEnvVars: ["OLD_KEY", "NEW_KEY"],
  });
});

test("target-provider filtering occurs before parsing sibling settings representations", () => {
  expect(
    permissionOptions("codex", {
      codexApprovalPolicy: "never",
      claudeSandboxCredentialFiles: "deny-one,deny-two",
    }),
  ).toEqual({ codexApprovalPolicy: "never" });
});

test("omitted recorded fields are defaults rather than unbounded permissions", () => {
  expect(
    restrictPermissionOptions(
      {},
      {
        claudePermissionMode: "auto",
        claudePlanModeApprovalScope: "bashTaskAndMcp",
        codexApprovalPolicy: "never",
        codexFileAccess: "danger-full-access",
        codexNetworkAccess: true,
        claudeAllowedTools: ["Bash"],
      },
    ),
  ).toMatchObject({
    claudePermissionMode: "default",
    claudePlanModeApprovalScope: "strict",
    codexApprovalPolicy: "untrusted",
    codexFileAccess: "workspace-write",
  });
  const recorded = resolveDelegationPermissionPolicy({
    providerId: "codex",
    settings: codexAuto,
  });
  expect(
    resolveDelegationPermissionPolicy({
      providerId: "codex",
      recorded,
      settings: {},
    }).options,
  ).toMatchObject({
    codexApprovalPolicy: "untrusted",
    codexNetworkAccess: false,
  });
});

test("switching the parent to Cursor or Kiro invalidates a previous supported-provider snapshot", () => {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
  );
  const store = new DelegationPolicyStore(db as never);
  for (const providerId of ["cursor", "kiro"] as const) {
    store.saveEffective("parent", "codex", codexAuto);
    expect(store.loadEffective("parent")?.providerId).toBe("codex");
    store.saveEffective("parent", providerId, {});
    expect(store.loadEffective("parent")).toBeNull();
    expect(
      resolveDelegationPermissionPolicy({
        providerId: "codex",
        parent: store.loadEffective("parent"),
        settings: {
          codexApprovalPolicy: "untrusted",
          codexFileAccess: "read-only",
        },
      }),
    ).toMatchObject({
      source: "provider-settings",
      options: {
        codexApprovalPolicy: "untrusted",
        codexFileAccess: "read-only",
      },
    });
  }
  db.close();
});

test("undefined option properties cannot erase guarded snapshot defaults", () => {
  expect(
    normalizedPermissionOptions("claude-code", {
      claudePermissionMode: undefined,
      claudeSandboxEnabled: undefined,
    }),
  ).toMatchObject({
    claudePermissionMode: "default",
    claudeSandboxEnabled: true,
  });
  expect(
    normalizedPermissionOptions("codex", {
      codexApprovalPolicy: undefined,
      codexFileAccess: undefined,
    }),
  ).toMatchObject({
    codexApprovalPolicy: "untrusted",
    codexFileAccess: "workspace-write",
  });
  expect(() =>
    restrictPermissionOptions(
      { claudePermissionMode: "auto" },
      { claudePermissionMode: "plan" },
    ),
  ).toThrow("cannot be combined safely");
});

test("removing previously saved approval-skip tools tightens a subsequent attempt", () => {
  const recorded = resolveDelegationPermissionPolicy({
    providerId: "claude-code",
    settings: {
      claudePermissionMode: "default",
      claudeAllowedTools: ["Bash"],
    },
  });
  expect(
    resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      recorded,
      settings: {},
    }).options.claudeAllowedTools,
  ).toEqual([]);
});
