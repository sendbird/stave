import { describe, expect, test } from "bun:test";
import { buildClaudeSystemPrompt } from "../electron/providers/claude-sdk-runtime";
import { buildCodexDeveloperInstructions } from "../electron/providers/codex-runtime-config";
import { PROVIDER_RUNTIME_OPTION_KEYS } from "@/lib/providers/runtime-option-contract";
import { compileAgent, snapshotAgent, type CompiledPrimary } from "@/lib/agents/compile";
import { agentRuntimeOptions } from "@/lib/agents/runtime-options";
import { getBuiltinAgent } from "@/lib/agents/starters";

function primary(providerId: "claude-code" | "codex" | "kiro"): CompiledPrimary {
  const main = compileAgent({ snapshot: snapshotAgent(getBuiltinAgent("researcher")!), role: "primary", providerId });
  if (!main.ok || main.compiled.role !== "primary") throw new Error("expected primary");
  return main.compiled;
}

describe("agent instructions reach the provider instruction channel", () => {
  test("agentInstructions is a declared runtime option", () => {
    expect(PROVIDER_RUNTIME_OPTION_KEYS).toContain("agentInstructions");
  });

  test("Claude puts them in the per-session part of the system prompt, not the cached prefix", () => {
    const [cached, , dynamic] = buildClaudeSystemPrompt({ cwd: "/tmp/ws", agentInstructions: "# Agent: Researcher\n\nAnswer." });
    expect(cached).not.toContain("# Agent: Researcher");
    expect(dynamic).toContain("# Agent: Researcher");
  });

  test("Codex adds them to developer instructions for the task's own turns only", () => {
    const runtimeOptions = { agentInstructions: "# Agent: Researcher\n\nAnswer." };
    expect(buildCodexDeveloperInstructions({ runtimeOptions })).toContain("# Agent: Researcher");
    expect(buildCodexDeveloperInstructions({ runtimeOptions, secondaryReadOnly: true })).not.toContain("# Agent: Researcher");
  });

  test("without an agent, both prompts are unchanged", () => {
    expect(buildClaudeSystemPrompt({ cwd: "/tmp/ws", agentInstructions: "  " })).toEqual(buildClaudeSystemPrompt({ cwd: "/tmp/ws" }));
    expect(buildCodexDeveloperInstructions({ runtimeOptions: {} })).toBe(buildCodexDeveloperInstructions({}));
  });
});

describe("agentRuntimeOptions", () => {
  test("Claude: instructions plus a denylist merged into existing disallowed tools", () => {
    const options = agentRuntimeOptions(primary("claude-code"), { claudeDisallowedTools: ["WebFetch", "Edit"] });
    expect(options.agentInstructions).toContain("# Agent: Researcher");
    expect(options.claudeDisallowedTools).toEqual(["WebFetch", "Edit", "Write", "NotebookEdit"]);
  });

  test("Codex: instructions only; the denylist is already written into them", () => {
    const options = agentRuntimeOptions(primary("codex"));
    expect(options.claudeDisallowedTools).toBeUndefined();
    expect(options.agentInstructions).toContain("Do not use these tools: Edit, Write, NotebookEdit.");
  });

  test("Kiro: nothing on the runtime options; the first message carries the preamble", () => {
    const compiled = primary("kiro");
    expect(compiled.promptPreamble).toBeDefined();
    expect(agentRuntimeOptions(compiled)).toEqual({});
  });
});

describe("a task agent's in-turn subagents", () => {
  const subagents = [
    { name: "scout", label: "Scout", description: "Answers one question.", instructions: "Change nothing.", tools: ["Read"], maxTurns: 25, effort: "high" },
    { name: "deep", label: "Deep", description: "Owns one unit.", instructions: "Finish it.", effort: "ultra" },
  ];

  test("Claude registers them as foreground agents under the lead's permission mode", async () => {
    const { buildClaudeNativeSubagentAgents } = await import("../electron/providers/claude-sdk-runtime");
    const agents = buildClaudeNativeSubagentAgents({ runtimeOptions: { nativeSubagents: subagents }, permissionMode: "dontAsk" });
    expect(agents?.scout).toMatchObject({ description: "Answers one question.", prompt: "Change nothing.", tools: ["Read"], maxTurns: 25, effort: "high", permissionMode: "dontAsk" });
    expect(agents?.deep).not.toHaveProperty("effort");
    expect(agents?.scout).not.toHaveProperty("background");
    expect(buildClaudeNativeSubagentAgents({ runtimeOptions: {}, permissionMode: "default" })).toBeUndefined();
  });

  test("Codex reads them in its developer instructions and bounds the fan-out", async () => {
    const { buildCodexSubagentConfigOverrides } = await import("../electron/providers/codex-runtime-config");
    const instructions = buildCodexDeveloperInstructions({ runtimeOptions: { nativeSubagents: subagents } });
    expect(instructions).toContain("## Subagents");
    expect(instructions).toContain("### Scout (`scout`)");
    expect(instructions).toContain("Change nothing.");
    expect(buildCodexDeveloperInstructions({ runtimeOptions: { nativeSubagents: subagents }, secondaryReadOnly: true })).not.toContain("## Subagents");
    expect(buildCodexSubagentConfigOverrides({ runtimeOptions: { nativeSubagents: subagents } })).toEqual({
      "agents.max_concurrent_threads_per_session": 5,
      "agents.max_depth": 1,
    });
    expect(buildCodexSubagentConfigOverrides({ runtimeOptions: {} })).toEqual({});
  });
});

test("a host-owned empty helper list disables native spawning in both adapters", async () => {
  const { buildClaudeQueryOptions } = await import("../electron/providers/claude-sdk-runtime");
  const { buildCodexConfigOverrides } = await import("../electron/providers/codex-app-server-params");
  const runtimeOptions = { nativeSubagents: [], claudeDisallowedTools: ["Write"] };
  expect(buildClaudeQueryOptions({ cwd: "/tmp/ws", claudeExecutablePath: "", runtimeOptions }).disallowedTools)
    .toEqual(expect.arrayContaining(["Agent", "Task", "Write"]));
  expect(buildCodexConfigOverrides({ runtimeOptions, configOverrides: { "features.multi_agent": true, "features.multi_agent_v2": true } }))
    .toMatchObject({ "features.multi_agent": false, "features.multi_agent_v2": false });
  expect(buildCodexConfigOverrides({ runtimeOptions: {} })).not.toHaveProperty("features.multi_agent");
});
