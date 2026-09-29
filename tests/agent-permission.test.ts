import { describe, expect, test } from "bun:test";
import { AGENT_PERMISSIONS } from "@/lib/agents/schema";
import { agentPermissionOverrides, CLAUDE_EDIT_TOOLS } from "@/lib/agents/permission";
import { taskAgentRuntimeOptions } from "@/lib/agents/runtime-options";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

const WIDE: ProviderRuntimeOptions = {
  claudePermissionMode: "bypassPermissions",
  claudeAllowDangerouslySkipPermissions: true,
  claudeDisallowedTools: ["WebFetch"],
  codexFileAccess: "danger-full-access",
  codexApprovalPolicy: "never",
  cursorMode: "agent",
  cursorApprovalMode: "auto",
  kiroApprovalMode: "auto",
};

const NARROW: ProviderRuntimeOptions = {
  claudePermissionMode: "plan",
  claudeDisallowedTools: [...CLAUDE_EDIT_TOOLS],
  codexFileAccess: "read-only",
  codexApprovalPolicy: "untrusted",
  cursorMode: "ask",
  cursorApprovalMode: "manual",
  kiroApprovalMode: "manual",
};

describe("agent permission ceiling", () => {
  test("read only lowers every provider's widest settings", () => {
    const at = (providerId: Parameters<typeof agentPermissionOverrides>[0]["providerId"]) =>
      agentPermissionOverrides({ permission: "read-only", providerId, options: WIDE });
    expect(at("claude-code")).toEqual({
      claudePermissionMode: "default",
      claudeAllowDangerouslySkipPermissions: false,
      claudeDisallowedTools: ["WebFetch", ...CLAUDE_EDIT_TOOLS],
    });
    expect(at("codex")).toEqual({ codexFileAccess: "read-only", codexApprovalPolicy: "on-request" });
    expect(at("cursor")).toEqual({ cursorApprovalMode: "manual", cursorMode: "ask" });
    expect(at("kiro")).toEqual({ kiroApprovalMode: "manual" });
  });

  test("unset settings count as the provider default, so Codex's default writes are capped too", () => {
    expect(agentPermissionOverrides({ permission: "read-only", providerId: "codex", options: {} })).toEqual({
      codexFileAccess: "read-only",
      codexApprovalPolicy: "on-request",
    });
    expect(agentPermissionOverrides({ permission: "guided", providerId: "claude-code", options: {} })).toEqual({});
  });

  test("manual and guided cap approvals and keep writes", () => {
    expect(agentPermissionOverrides({ permission: "manual", providerId: "claude-code", options: WIDE })).toMatchObject({
      claudePermissionMode: "default",
    });
    expect(agentPermissionOverrides({ permission: "guided", providerId: "claude-code", options: WIDE })).toMatchObject({
      claudePermissionMode: "acceptEdits",
    });
    expect(agentPermissionOverrides({ permission: "guided", providerId: "codex", options: WIDE })).toEqual({
      codexFileAccess: "workspace-write",
      codexApprovalPolicy: "untrusted",
    });
    expect(agentPermissionOverrides({ permission: "manual", providerId: "claude-code", options: WIDE }).claudeDisallowedTools).toBeUndefined();
  });

  test("never widens: settings already inside the ceiling are left as they are, and auto changes nothing", () => {
    for (const permission of AGENT_PERMISSIONS) {
      for (const providerId of listProviderIds()) {
        expect(agentPermissionOverrides({ permission, providerId, options: NARROW })).toEqual({});
      }
    }
    for (const providerId of listProviderIds()) {
      expect(agentPermissionOverrides({ permission: "auto", providerId, options: WIDE })).toEqual({});
    }
  });

  test("every turn of a read-only task runs inside the ceiling, the first one included", () => {
    const researcher = getBuiltinAgent("researcher")!;
    const first = taskAgentRuntimeOptions({ agent: researcher, providerId: "codex", base: { ...WIDE, agentInstructions: "x" } });
    expect(first).toEqual({ codexFileAccess: "read-only", codexApprovalPolicy: "on-request" });
    const later = taskAgentRuntimeOptions({ agent: researcher, providerId: "claude-code", base: WIDE });
    expect(later.agentInstructions).toContain("# Agent: Researcher");
    expect(later.claudePermissionMode).toBe("default");
    expect(later.claudeDisallowedTools).toEqual(expect.arrayContaining([...CLAUDE_EDIT_TOOLS, "WebFetch"]));
  });
});

describe("what it received", () => {
  test("lists each source and field, and says when the agent changed after the start", async () => {
    const { describeAssignmentReceived } = await import("@/lib/agents/agents-view");
    const { compileAgent, snapshotAgent } = await import("@/lib/agents/compile");
    const researcher = getBuiltinAgent("researcher")!;
    const snapshot = snapshotAgent(researcher);
    const compiled = compileAgent({ snapshot, role: "primary", providerId: "kiro" });
    if (!compiled.ok) throw new Error(compiled.message);
    const base = {
      agentName: "Researcher",
      agentContentHash: snapshot.contentHash,
      received: compiled.compiled.received,
      support: compiled.compiled.support,
    };
    const same = describeAssignmentReceived({ ...base, current: researcher });
    expect(same.changedSince).toBeNull();
    expect(same.version).toBe(snapshot.contentHash.slice(0, 8));
    expect(same.lines).toContainEqual({ label: "Researcher instructions", detail: "Included" });
    expect(same.lines.find((line) => line.label === "Permission")?.detail).toContain("Asked in instructions");
    const edited = describeAssignmentReceived({ ...base, current: { ...researcher, instructions: "Something else." } });
    expect(edited.changedSince).toContain("edited after this task started");
    // Archiving is not an edit to what the agent does.
    expect(describeAssignmentReceived({ ...base, current: { ...researcher, archived: true } }).changedSince).toBeNull();
  });
});
