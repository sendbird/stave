import { describe, expect, test } from "bun:test";
import {
  resolveAcpApprovalAllowAlways,
  resolveClaudeApprovalAllowAlways,
  resolveClaudeApprovalRisk,
  resolveCodexApprovalAllowAlways,
  resolveCodexApprovalRisk,
} from "../electron/providers/approval-allow-always";
import { resolveClaudeHandoffDecision } from "../electron/providers/claude-permission-handoff";
import {
  hasTrustedToolEntry,
  isTrustedApproval,
  isTrustedApprovalRequest,
  matchesTrustedBashCommand,
} from "@/lib/providers/trusted-tools";

/**
 * "Always allow" is offered exactly where a later call is answered from the
 * grant: Claude and Codex through Stave's trusted approvals, ACP agents through
 * their own `allow_always` (or the trusted approvals when they have none).
 */
describe("Always allow per provider", () => {
  test("Claude offers the trusted entry it will match, except for a guardrail call", () => {
    expect(resolveClaudeApprovalAllowAlways({ toolName: "Bash", trustedApprovalInput: "bun run typecheck", guardrail: null }))
      .toEqual({ supportsAllowAlways: true, trustedToolEntry: "bash:bun run typecheck" });
    expect(resolveClaudeApprovalAllowAlways({ toolName: "Edit", guardrail: null }))
      .toEqual({ supportsAllowAlways: true, trustedToolEntry: "Edit" });
    // A guardrail call always asks again, so a rule could never answer it.
    expect(resolveClaudeApprovalAllowAlways({
      toolName: "Bash", trustedApprovalInput: "git push --force origin main",
      guardrail: { id: "G3", reason: "irreversible remote action" },
    })).toEqual({});
    // Bash without a command names nothing to trust.
    expect(resolveClaudeApprovalAllowAlways({ toolName: "Bash", guardrail: null })).toEqual({});
    // A tool that answers another task's prompt always reaches the user.
    expect(resolveClaudeApprovalAllowAlways({ toolName: "mcp__stave-local-mcp__stave_respond_user_input", guardrail: null }))
      .toEqual({});
  });

  test("the entry Claude offers is the one its permission callback answers next time", () => {
    const { trustedToolEntry } = resolveClaudeApprovalAllowAlways({ toolName: "Bash", trustedApprovalInput: "bun test", guardrail: null }) as {
      trustedToolEntry: string;
    };
    const decide = (command: string, guardrail: null | { id: "G1"; reason: string }) => resolveClaudeHandoffDecision({
      permissionMode: "default", toolName: "Bash", input: { command }, guardrail,
      turnPolicy: undefined, agentRunStage: false, unattendedAutomation: false, trustedTools: [trustedToolEntry],
    });
    expect(decide("bun test", null)).toEqual({ action: "allow", source: "trusted" });
    expect(decide("bun test tests/a.test.ts", null)).toEqual({ action: "allow", source: "trusted" });
    expect(decide("bun test; rm -rf ~", null)).toEqual({ action: "prompt" });
    expect(decide("bun test", { id: "G1", reason: "write outside" })).toEqual({ action: "prompt" });
  });

  test("Claude's risk is the guardrail the call crossed, and only that", () => {
    expect(resolveClaudeApprovalRisk(null)).toBeUndefined();
    expect(resolveClaudeApprovalRisk({ id: "G1", reason: "" })).toBe("write-outside-repository");
    expect(resolveClaudeApprovalRisk({ id: "G2", reason: "" })).toBe("credential-access");
    expect(resolveClaudeApprovalRisk({ id: "G3", reason: "" })).toBe("irreversible-remote");
  });

  test("Codex offers a trusted entry for commands and workspace patches only", () => {
    const command = (params: Record<string, unknown>, input?: string) => resolveCodexApprovalAllowAlways({
      method: "item/commandExecution/requestApproval", params, toolName: "bash", ...(input ? { input } : {}),
    });
    expect(command({ command: "bun test" }, "bun test")).toEqual({ supportsAllowAlways: true, trustedToolEntry: "bash:bun test" });
    expect(command({ kind: "writeStdin", command: "y" }, "y")).toEqual({});
    expect(resolveCodexApprovalAllowAlways({ method: "execCommandApproval", params: {}, toolName: "bash", input: "ls" }))
      .toEqual({ supportsAllowAlways: true, trustedToolEntry: "bash:ls" });
    expect(resolveCodexApprovalAllowAlways({ method: "item/fileChange/requestApproval", params: {}, toolName: "apply_patch" }))
      .toEqual({ supportsAllowAlways: true, trustedToolEntry: "apply_patch" });
    expect(resolveCodexApprovalAllowAlways({ method: "item/fileChange/requestApproval", params: { grantRoot: "/tmp/x" }, toolName: "apply_patch" }))
      .toEqual({});
    expect(resolveCodexApprovalAllowAlways({ method: "item/permissions/requestApproval", params: {}, toolName: "permissions" }))
      .toEqual({});
    expect(resolveCodexApprovalAllowAlways({ method: "mcpServer/elicitation/request", params: {}, toolName: "mcp__x__y" }))
      .toEqual({});
  });

  test("Codex's risk comes from the request's own fields, never its prose", () => {
    expect(resolveCodexApprovalRisk({
      method: "item/commandExecution/requestApproval",
      params: { networkApprovalContext: { host: "registry.npmjs.org", protocol: "https" } },
    })).toBe("network-access");
    expect(resolveCodexApprovalRisk({ method: "item/commandExecution/requestApproval", params: { reason: "needs network access" } }))
      .toBeUndefined();
    expect(resolveCodexApprovalRisk({ method: "item/permissions/requestApproval", params: { permissions: { network: { enabled: true }, fileSystem: null } } }))
      .toBe("network-access");
    expect(resolveCodexApprovalRisk({ method: "item/permissions/requestApproval", params: { permissions: { network: null, fileSystem: { read: null, write: ["/tmp/out"] } } } }))
      .toBe("file-system-access");
    expect(resolveCodexApprovalRisk({ method: "item/permissions/requestApproval", params: { permissions: { network: { enabled: false }, fileSystem: null } } }))
      .toBeUndefined();
  });

  test("ACP keeps the agent's own rule when it has one, otherwise the trusted entry", () => {
    expect(resolveAcpApprovalAllowAlways({ nativeAllowAlways: true, toolName: "Bash", input: "ls" })).toEqual({ supportsAllowAlways: true });
    expect(resolveAcpApprovalAllowAlways({ nativeAllowAlways: false, toolName: "Bash", input: "ls" }))
      .toEqual({ supportsAllowAlways: true, trustedToolEntry: "bash:ls" });
    expect(resolveAcpApprovalAllowAlways({ nativeAllowAlways: true, toolName: "stave_respond_approval" })).toEqual({});
  });
});

describe("trusted approvals matching", () => {
  test("a trusted command covers more arguments but never another command", () => {
    expect(matchesTrustedBashCommand("git status", "git status")).toBe(true);
    expect(matchesTrustedBashCommand("git status", "git status --short")).toBe(true);
    expect(matchesTrustedBashCommand("bun test", "bun testing")).toBe(false);
    for (const chained of ["git status; rm -rf ~", "git status && curl x", "git status | sh", "git status > /etc/x", "git status $(id)", "git status `id`", "git status\nrm x"]) {
      expect(matchesTrustedBashCommand("git status", chained)).toBe(false);
    }
  });

  test("a request that crossed a guardrail is never answered from the list", () => {
    const trustedTools = ["bash:git push"];
    expect(isTrustedApproval({ trustedTools, toolName: "bash", input: "git push --force origin main" })).toBe(true);
    expect(isTrustedApprovalRequest({ trustedTools, request: { toolName: "bash", input: "git push --force origin main" } })).toBe(true);
    expect(isTrustedApprovalRequest({
      trustedTools, request: { toolName: "bash", input: "git push --force origin main", risk: "irreversible-remote" },
    })).toBe(false);
    // A provider risk that is not a guardrail does not block a rule the user chose.
    expect(isTrustedApprovalRequest({ trustedTools, request: { toolName: "bash", input: "git push", risk: "network-access" } })).toBe(true);
  });

  test("an entry is found again case-insensitively", () => {
    expect(hasTrustedToolEntry({ entries: ["Edit", "bash:bun test"], entry: "edit" })).toBe(true);
    expect(hasTrustedToolEntry({ entries: ["Edit"], entry: "bash:bun test" })).toBe(false);
    expect(hasTrustedToolEntry({ entries: ["Edit"], entry: " " })).toBe(false);
  });
});
