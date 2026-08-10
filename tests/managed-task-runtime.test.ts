import { describe, expect, test } from "bun:test";
import { resolveManagedTaskRuntimeOptions } from "@/lib/providers/managed-task-runtime";

describe("resolveManagedTaskRuntimeOptions", () => {
  test("bypasses permissions when the caller specifies nothing", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
    });
    expect(options.claudePermissionMode).toBe("bypassPermissions");
    expect(options.claudeAllowDangerouslySkipPermissions).toBe(true);
    expect(options.claudeAllowUnsandboxedCommands).toBe(true);
    expect(options.claudeSandboxEnabled).toBe(false);
  });

  test("resolves the auto autonomy preset to a real bypass", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: { claudePermissionMode: "auto", claudeEffort: "high" },
    });
    expect(options.claudePermissionMode).toBe("bypassPermissions");
    expect(options.claudeEffort).toBe("high");
  });

  test("keeps an explicit caller permission mode", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "claude-code",
      runtimeOptions: { claudePermissionMode: "plan" },
    });
    expect(options.claudePermissionMode).toBe("plan");
    expect(options.claudeAllowDangerouslySkipPermissions).toBe(false);
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

  test("gives Codex a non-interactive approval policy by default", () => {
    const options = resolveManagedTaskRuntimeOptions({
      providerId: "codex",
      runtimeOptions: { model: "gpt-5" },
    });
    expect(options.codexApprovalPolicy).toBe("never");
    expect(options.codexFileAccess).toBe("workspace-write");
    expect(options.codexAutoApproveStaveLocalMcpTools).toBe(true);
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
