import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { DelegationPolicyStore } from "../electron/persistence/delegation-policy-store";
import {
  isReadOnlyDelegationPolicy,
  resolveDelegationPermissionPolicy,
} from "@/lib/runs/delegation-policy";
import {
  CLAUDE_READ_ONLY_DELEGATION_ALLOWED_TOOLS,
  CLAUDE_READ_ONLY_DELEGATION_DISALLOWED_TOOLS,
  DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS,
  READ_ONLY_DELEGATION_STAVE_TOOLS,
  READ_ONLY_STAVE_METADATA_TOOLS,
} from "@/lib/runs/read-only-delegation";
import { buildDelegatedTaskRuntimeOptions } from "@/lib/runs/delegated-task-runtime";
import { AGENT_RUN_TOOL_NAMES } from "@/lib/agent-runs/briefing";

const claudeAuto = {
  claudePermissionMode: "auto" as const,
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeAllowedTools: ["Bash"],
};
const codexAuto = {
  codexApprovalPolicy: "never" as const,
  codexFileAccess: "danger-full-access" as const,
  codexNetworkAccess: true,
  codexAutoApproveStaveLocalMcpTools: true,
};

describe("read-only delegation access", () => {
  test("Claude resolves to deny-by-default reads in a sandbox that cannot write", () => {
    const policy = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      access: "read-only",
      parent: { providerId: "claude-code", options: claudeAuto },
    });
    expect(policy).toMatchObject({
      providerId: "claude-code",
      source: "parent-turn",
      access: "read-only",
      requestedProfile: "inherit",
      options: {
        claudePermissionMode: "dontAsk",
        claudeAllowDangerouslySkipPermissions: false,
        claudeSandboxEnabled: true,
        claudeSandboxReadOnly: true,
        claudeAllowUnsandboxedCommands: false,
      },
    });
    const allowed = policy.options.claudeAllowedTools ?? [];
    expect(allowed).toEqual(expect.arrayContaining(["Read", "Grep", "Glob", "LS", "NotebookRead", "WebFetch", "WebSearch", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)"]));
    // The parent's blanket Bash approval is not inherited.
    expect(allowed).not.toContain("Bash");
    expect(allowed).toContain("mcp__stave-local-mcp__stave_get_workspace_information");
    // Stave's own records of the work stay open: notes, todos, plan files, stage reports.
    for (const tool of ["stave_append_workspace_notes", "stave_add_workspace_todo", "stave_write_plan_file",
      "stave_report_stage", "stave_block_stage"])
      expect(allowed).toContain(`mcp__stave-local-mcp__${tool}`);
    const denied = policy.options.claudeDisallowedTools ?? [];
    for (const tool of ["Edit", "Write", "MultiEdit", "NotebookEdit", "AskUserQuestion",
      "mcp__stave-local-mcp__stave_delegate_task", "mcp__stave-local-mcp__stave_run_task",
      "mcp__stave-local-mcp__stave_respond_user_input", "mcp__stave-local-mcp__stave_clear_workspace_notes",
      "mcp__stave-local-mcp__stave_replace_workspace_notes", "mcp__stave-local-mcp__stave_remove_workspace_todo",
      "mcp__stave-local-mcp__stave_create_automation", "mcp__stave-local-mcp__stave_remember"])
      expect(denied).toContain(tool);
    expect(isReadOnlyDelegationPolicy("claude-code", policy)).toBe(true);
    expect(buildDelegatedTaskRuntimeOptions({ providerId: "claude-code", permissionPolicy: policy })).toMatchObject({
      claudePermissionMode: "dontAsk",
      claudeSandboxReadOnly: true,
      claudeAllowedTools: allowed,
    });
  });

  test("Codex resolves to a read-only sandbox that never asks", () => {
    const policy = resolveDelegationPermissionPolicy({
      providerId: "codex",
      access: "read-only",
      settings: codexAuto,
    });
    expect(policy).toMatchObject({
      source: "provider-settings",
      access: "read-only",
      options: {
        codexFileAccess: "read-only",
        codexApprovalPolicy: "never",
        codexNetworkAccess: false,
        codexAutoApproveStaveLocalMcpTools: false,
      },
    });
    expect(isReadOnlyDelegationPolicy("codex", policy)).toBe(true);
  });

  test("plan and deny-by-default parents delegate read-only without throwing", () => {
    for (const mode of ["plan", "dontAsk", "default", "bypassPermissions"] as const) {
      const policy = resolveDelegationPermissionPolicy({
        providerId: "claude-code",
        access: "read-only",
        parent: { providerId: "claude-code", options: { claudePermissionMode: mode, claudeAllowedTools: [] } },
      });
      expect(policy.options.claudePermissionMode).toBe("dontAsk");
      expect(isReadOnlyDelegationPolicy("claude-code", policy)).toBe(true);
    }
  });

  test("agent ceilings and profiles never widen or break the read-only posture", () => {
    for (const permissionCeiling of ["read-only", "manual", "guided", "auto"] as const) {
      for (const permissionProfile of ["inherit", "auto", "guided", "manual"] as const) {
        const claude = resolveDelegationPermissionPolicy({
          providerId: "claude-code", access: "read-only", permissionProfile, permissionCeiling,
          parent: { providerId: "claude-code", options: { claudePermissionMode: "plan" } },
        });
        expect(claude.options).toMatchObject({ claudePermissionMode: "dontAsk", claudeSandboxReadOnly: true, claudeAllowDangerouslySkipPermissions: false });
        const codex = resolveDelegationPermissionPolicy({
          providerId: "codex", access: "read-only", permissionProfile, permissionCeiling, settings: codexAuto,
        });
        expect(codex.options).toMatchObject({ codexFileAccess: "read-only", codexApprovalPolicy: "never" });
      }
    }
  });

  test("inherited and recorded restrictions carry over; the read-only choice is pinned", () => {
    const policy = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      access: "read-only",
      settings: {
        claudeDisallowedTools: ["WebFetch"],
        claudeSandboxCredentialFiles: ["/tmp/credential"],
        claudeSandboxCredentialEnvVars: ["SERVICE_TOKEN"],
      },
    });
    expect(policy.options.claudeAllowedTools).not.toContain("WebFetch");
    expect(policy.options.claudeDisallowedTools).toContain("WebFetch");
    expect(policy.options).toMatchObject({
      claudeSandboxCredentialFiles: ["/tmp/credential"],
      claudeSandboxCredentialEnvVars: ["SERVICE_TOKEN"],
    });
    // A follow-up or retry that does not repeat the choice stays read-only.
    const later = resolveDelegationPermissionPolicy({
      providerId: "claude-code",
      recorded: policy,
      parent: { providerId: "claude-code", options: claudeAuto },
    });
    expect(later).toMatchObject({ source: "recorded-delegation", access: "read-only" });
    expect(later.options.claudeAllowedTools).not.toContain("WebFetch");
    expect(isReadOnlyDelegationPolicy("claude-code", later)).toBe(true);
    // An inherit delegation may still narrow to read-only on a later start.
    const recorded = resolveDelegationPermissionPolicy({ providerId: "codex", settings: codexAuto });
    expect(recorded.access).toBe("inherit");
    expect(resolveDelegationPermissionPolicy({ providerId: "codex", recorded, access: "read-only", settings: codexAuto }).options.codexFileAccess).toBe("read-only");
  });

  test("a legacy profile is recorded as provenance without restricting the inherited policy", () => {
    const inherited = resolveDelegationPermissionPolicy({ providerId: "claude-code", settings: claudeAuto });
    const legacy = resolveDelegationPermissionPolicy({ providerId: "claude-code", requestedProfile: "guided", settings: claudeAuto });
    expect(legacy).toMatchObject({ requestedProfile: "guided", access: "inherit" });
    expect(legacy.options).toEqual(inherited.options);
  });

  test("only a resolved read-only posture proves a reader", () => {
    const plan = resolveDelegationPermissionPolicy({ providerId: "claude-code", settings: { claudePermissionMode: "plan" } });
    const guided = resolveDelegationPermissionPolicy({ providerId: "claude-code", permissionProfile: "guided", settings: claudeAuto });
    const agentReadOnly = resolveDelegationPermissionPolicy({ providerId: "claude-code", permissionCeiling: "read-only", settings: claudeAuto });
    for (const policy of [plan, guided, agentReadOnly]) expect(isReadOnlyDelegationPolicy("claude-code", policy)).toBe(false);
    const codexReader = resolveDelegationPermissionPolicy({ providerId: "codex", access: "read-only" });
    // A policy resolved for another provider proves nothing about this child.
    expect(isReadOnlyDelegationPolicy("claude-code", codexReader)).toBe(false);
    expect(isReadOnlyDelegationPolicy("codex", null)).toBe(false);
  });

  test("every Stave Local MCP tool is classified for read-only children", () => {
    const sources = [
      "electron/main/stave-mcp-server.ts",
      "electron/main/browser/browser-tools.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    const registered = new Set([
      ...[...sources.matchAll(/registerTool\(\s*"(stave_[a-z_]+)"/g)].map((match) => match[1]!),
      ...Object.values(AGENT_RUN_TOOL_NAMES),
    ]);
    expect(registered.size).toBeGreaterThan(60);
    const allowed = new Set<string>([...READ_ONLY_DELEGATION_STAVE_TOOLS, ...READ_ONLY_STAVE_METADATA_TOOLS]);
    const denied = new Set<string>(DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS);
    // Read, record or denied: exactly one, for every registered tool.
    expect(READ_ONLY_STAVE_METADATA_TOOLS.filter((tool) => (READ_ONLY_DELEGATION_STAVE_TOOLS as readonly string[]).includes(tool))).toEqual([]);
    for (const tool of registered) expect([tool, allowed.has(tool) !== denied.has(tool)]).toEqual([tool, true]);
    for (const tool of [...allowed, ...denied]) expect(registered.has(tool)).toBe(true);
    const allowRules = new Set(CLAUDE_READ_ONLY_DELEGATION_ALLOWED_TOOLS);
    expect(CLAUDE_READ_ONLY_DELEGATION_DISALLOWED_TOOLS.filter((rule) => allowRules.has(rule))).toEqual([]);
  });

  test("the parent's latest turn supplies the provider and effort defaults", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
    const store = new DelegationPolicyStore(db as never);
    expect(store.loadParentTurnDefaults("parent")).toBeNull();
    store.saveEffective("parent", "claude-code", { claudeEffort: "high" });
    expect(store.loadParentTurnDefaults("parent")).toEqual({ providerId: "claude-code", effort: "high" });
    store.saveEffective("parent", "codex", { codexReasoningEffort: "minimal" });
    expect(store.loadParentTurnDefaults("parent")).toEqual({ providerId: "codex", effort: "low" });
    store.saveEffective("parent", "claude-code", {});
    expect(store.loadParentTurnDefaults("parent")).toEqual({ providerId: "claude-code" });
    store.saveEffective("parent", "cursor", {});
    expect(store.loadParentTurnDefaults("parent")).toBeNull();
    db.close();
  });
});
