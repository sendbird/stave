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
