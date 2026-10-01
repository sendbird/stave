import { describe, expect, test } from "bun:test";
import { SUBAGENT_PRESETS } from "@/lib/agents/subagent-presets";
import { compileNativeSubagents } from "@/lib/agents/native-subagents";
import { AgentConfigListSchema, AgentConfigSchema, type AgentConfig } from "@/lib/agents/schema";
import { BUILTIN_AGENTS, getBuiltinAgent } from "@/lib/agents/starters";
import { compileAgent, hashAgentContent, snapshotAgent } from "@/lib/agents/compile";

function customAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return AgentConfigSchema.parse({
    version: 1,
    id: "ui-maintainer",
    source: "custom",
    name: "UI Maintainer",
    description: "Fixes settings screen bugs. Use for renderer UI fixes.",
    instructions: "Keep changes small and verify in the running app.",
    model: { mode: "fixed", providerId: "claude-code", model: "claude-sonnet-5", effort: "high" },
    tools: { deny: ["WebFetch"] },
    permission: "auto",
    workspace: "new-worktree",
    report: ["summary", "changes", "verification"],
    usableAs: ["primary", "worker", "delegate"],
    ...overrides,
  });
}

describe("agent config schema", () => {
  test("Can call is optional, may be empty, and lists each agent once", () => {
    expect(customAgent().canCall).toBeUndefined();
    expect(customAgent({ canCall: [] }).canCall).toEqual([]);
    expect(customAgent({ canCall: ["reviewer"] }).canCall).toEqual(["reviewer"]);
    expect(() => customAgent({ canCall: ["reviewer", "reviewer"] })).toThrow();
  });

  test("every built-in parses and ids are unique", () => {
    expect(AgentConfigListSchema.safeParse(BUILTIN_AGENTS).success).toBe(true);
    expect(BUILTIN_AGENTS.every((spec) => spec.source === "builtin")).toBe(true);
  });

  test("rejects an id with path characters", () => {
    expect(AgentConfigSchema.safeParse({ ...customAgent(), id: "../x" }).success).toBe(false);
  });

  test("rejects a read-only agent in its own worktree", () => {
    const result = AgentConfigSchema.safeParse({ ...customAgent(), permission: "read-only", workspace: "new-worktree" });
    expect(result.success).toBe(false);
  });

  test("a repository agent must record its origin file", () => {
    expect(AgentConfigSchema.safeParse({ ...customAgent(), source: "repository" }).success).toBe(false);
  });

  test("rejects a tool that is both allowed and denied", () => {
    const result = AgentConfigSchema.safeParse({ ...customAgent(), tools: { allow: ["Read"], deny: ["Read"] } });
    expect(result.success).toBe(false);
  });

  test("rejects instructions over the length limit and unknown fields", () => {
    expect(AgentConfigSchema.safeParse({ ...customAgent(), instructions: "x".repeat(8_001) }).success).toBe(false);
    expect(AgentConfigSchema.safeParse({ ...customAgent(), grantsAdmin: true }).success).toBe(false);
  });

  test("rejects duplicate ids in a list", () => {
    expect(AgentConfigListSchema.safeParse([customAgent(), customAgent()]).success).toBe(false);
  });
});

describe("built-in subagents", () => {
  test("each subagent preset has an in-turn-only built-in with the same id and text", () => {
    for (const preset of SUBAGENT_PRESETS) {
      const spec = getBuiltinAgent(preset.id);
      expect(spec).toBeDefined();
      expect(spec!.usableAs).toEqual(["worker"]);
      expect(spec!.workerPresetId).toBe(preset.id);
      expect(spec!.instructions).toBe(preset.instructions);
      expect(spec!.tools.allow).toEqual(preset.tools ? [...preset.tools] : undefined);
    }
  });

  test("compiling a built-in as an in-turn subagent carries its own text and tools", () => {
    const snapshot = snapshotAgent(getBuiltinAgent("scout")!);
    const result = compileAgent({ snapshot, role: "worker", providerId: "claude-code" });
    expect(result.ok).toBe(true);
    if (!result.ok || result.compiled.role !== "worker") throw new Error("expected worker");
    expect(result.compiled.subagent).toMatchObject({ name: "scout", label: "Scout", tools: ["Read", "Grep", "Glob"] });
    expect(result.compiled.subagent.instructions).toContain("change nothing");
  });

  test("a lead's canCall list decides its in-turn subagents; absent means any", () => {
    const lead = customAgent({ id: "lead", canCall: ["scout", "second-pair"] });
    const library = [lead, ...["scout", "sweep", "second-pair"].map((id) => getBuiltinAgent(id)!)];
    expect(compileNativeSubagents({ lead, library, providerId: "codex" }).map((entry) => entry.name)).toEqual(["scout", "second-pair"]);
    const open = compileNativeSubagents({ lead: { ...lead, canCall: undefined }, library, providerId: "codex" });
    expect(open.map((entry) => entry.name)).toEqual(["scout", "sweep", "second-pair"]);
  });

  test("a mirror refuses main-agent and delegated work", () => {
    const snapshot = snapshotAgent(getBuiltinAgent("patch-hand")!);
    const result = compileAgent({ snapshot, role: "primary", providerId: "claude-code" });
    expect(result).toMatchObject({ ok: false, code: "role-not-allowed" });
  });
});

describe("snapshot", () => {
  test("hash is stable across key order and ignores archive state", () => {
    const spec = customAgent();
    const reordered = Object.fromEntries(Object.entries(spec).reverse()) as AgentConfig;
    expect(snapshotAgent(reordered).contentHash).toBe(snapshotAgent(spec).contentHash);
    expect(snapshotAgent({ ...spec, concurrency: 5 }).contentHash).toBe(snapshotAgent(spec).contentHash);
  });

  test("hash changes when behaviour changes", () => {
    const spec = customAgent();
    expect(snapshotAgent({ ...spec, instructions: "Different." }).contentHash).not.toBe(
      snapshotAgent(spec).contentHash,
    );
  });

  test("snapshot is a copy: later edits do not reach it", () => {
    const spec = customAgent();
    const snapshot = snapshotAgent(spec);
    spec.skills.push("late-skill");
    expect(snapshot.agent.skills).toEqual([]);
  });

  test("hash format", () => {
    expect(hashAgentContent({ a: 1 })).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});

describe("compileAgent", () => {
  test("archived agents take no new work", () => {
    const snapshot = snapshotAgent(customAgent({ archived: true }));
    expect(compileAgent({ snapshot, role: "primary", providerId: "claude-code" })).toMatchObject({
      ok: false,
      code: "archived",
    });
  });

  test("main agent on Claude uses the instruction channel and enforces the denylist", () => {
    const result = compileAgent({ snapshot: snapshotAgent(customAgent()), role: "primary", providerId: "claude-code" });
    if (!result.ok || result.compiled.role !== "primary") throw new Error("expected lead");
    expect(result.compiled.promptPreamble).toBeUndefined();
    expect(result.compiled.disallowedTools).toEqual(["WebFetch"]);
    expect(result.compiled.model).toEqual({ source: "fixed", model: "claude-sonnet-5", effort: "high" });
    expect(result.compiled.support).toContainEqual({ field: "tools", level: "enforced" });
    expect(result.compiled.instructions).not.toContain("Do not use these tools");
  });

  test("main agent on Codex states the denylist instead of claiming enforcement", () => {
    const spec = customAgent({ model: { mode: "auto", taskClass: "implement" } });
    const result = compileAgent({ snapshot: snapshotAgent(spec), role: "primary", providerId: "codex" });
    if (!result.ok || result.compiled.role !== "primary") throw new Error("expected lead");
    expect(result.compiled.disallowedTools).toBeUndefined();
    expect(result.compiled.instructions).toContain("Do not use these tools: WebFetch.");
    expect(result.compiled.support.find((entry) => entry.field === "tools")?.level).toBe("instructed");
    expect(result.compiled.model).toEqual({ source: "auto-routing", taskClass: "implement" });
  });

  test("main agent on Kiro and Cursor prepends instructions and marks them instructed", () => {
    for (const providerId of ["kiro", "cursor"] as const) {
      const spec = customAgent({ model: { mode: "auto" } });
      const result = compileAgent({ snapshot: snapshotAgent(spec), role: "primary", providerId });
      if (!result.ok || result.compiled.role !== "primary") throw new Error("expected lead");
      expect(result.compiled.promptPreamble).toBe(result.compiled.instructions);
      expect(result.compiled.support.find((entry) => entry.field === "instructions")?.level).toBe("instructed");
    }
  });

  test("a model pinned to another provider is reported, not applied", () => {
    const result = compileAgent({ snapshot: snapshotAgent(customAgent()), role: "primary", providerId: "codex" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.compiled.model).toEqual({ source: "provider-mismatch", requestedProviderId: "claude-code" });
    expect(result.compiled.support.find((entry) => entry.field === "model")?.level).toBe("unavailable");
  });

  test("delegate maps workspace and permission and refuses unsupported providers", () => {
    const result = compileAgent({ snapshot: snapshotAgent(customAgent()), role: "delegate", providerId: "claude-code" });
    if (!result.ok || result.compiled.role !== "delegate") throw new Error("expected delegated");
    expect(result.compiled.delegate).toEqual({
      providerId: "claude-code",
      permissionProfile: "auto",
      model: "claude-sonnet-5",
      effort: "high",
      workspaceMode: "new-worktree",
    });
    expect(result.compiled.promptPreamble).toContain("# Agent: UI Maintainer");

    const kiro = compileAgent({ snapshot: snapshotAgent(customAgent()), role: "delegate", providerId: "kiro" });
    expect(kiro).toMatchObject({ ok: false, code: "provider-unavailable" });
  });

  test("read-only reviewer delegates in the same workspace with the manual profile", () => {
    const result = compileAgent({
      snapshot: snapshotAgent(getBuiltinAgent("reviewer")!),
      role: "delegate",
      providerId: "codex",
    });
    if (!result.ok || result.compiled.role !== "delegate") throw new Error("expected delegated");
    expect(result.compiled.delegate.workspaceMode).toBe("same-workspace");
    expect(result.compiled.delegate.permissionProfile).toBe("manual");
    expect(result.compiled.promptPreamble).toContain("Do not modify files.");
  });

  test("a user agent as an in-turn subagent states its denylist and keeps its model", () => {
    const result = compileAgent({ snapshot: snapshotAgent(customAgent()), role: "worker", providerId: "claude-code" });
    if (!result.ok || result.compiled.role !== "worker") throw new Error("expected worker");
    expect(result.compiled.subagent.description).toBe(customAgent().description);
    expect(result.compiled.subagent.instructions).toContain("Do not use these tools: WebFetch.");
    expect(result.compiled.subagent.model).toBe("claude-sonnet-5");
  });

  test("received instructions name the snapshot hash and each skill", () => {
    const snapshot = snapshotAgent(customAgent({ skills: ["accessibility"] }));
    const result = compileAgent({ snapshot, role: "primary", providerId: "claude-code" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.compiled.received).toEqual([
      { sourceId: "agent:ui-maintainer", kind: "agent", hash: snapshot.contentHash, included: true },
      { sourceId: "skill:accessibility", kind: "skill", included: true },
    ]);
  });
});
