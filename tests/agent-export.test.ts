import { describe, expect, test } from "bun:test";
import { exportAgentFile } from "@/lib/agents/export";
import { importAgentFile } from "@/lib/agents/import";
import { duplicateAgent } from "@/lib/agents/library";
import { AgentConfigSchema } from "@/lib/agents/schema";
import { getBuiltinAgent } from "@/lib/agents/starters";

const reviewer = () =>
  AgentConfigSchema.parse({
    ...duplicateAgent(getBuiltinAgent("reviewer")!, []),
    id: "strict-reviewer",
    name: "Strict reviewer",
    description: 'Use after a change: "review" it, line by line.',
    instructions: "Review only the diff.\nName each defect with a file and line.",
    tools: { allow: ["Read", "Grep", "Bash"] },
  });

describe("agent export", () => {
  test("a Claude file reads back as the same agent", () => {
    const file = exportAgentFile(reviewer(), "claude-md");
    expect(file.path).toBe(".claude/agents/strict-reviewer.md");
    const back = importAgentFile({ path: file.path, content: file.content });
    if (!back.ok) throw new Error(back.message);
    expect(back.agent).toMatchObject({
      id: "strict-reviewer",
      instructions: "Review only the diff.\nName each defect with a file and line.",
      permission: "read-only",
      tools: { allow: ["Read", "Grep", "Bash"] },
    });
    expect(back.agent.description.startsWith('Use after a change: "review" it, line by line.')).toBe(true);
    expect(back.agent.description).toContain("Don't use when:");
    expect(back.notes).toEqual([]);
  });

  test("a Codex file reads back with its sandbox and instructions", () => {
    const file = exportAgentFile(reviewer(), "codex-toml");
    expect(file.path).toBe(".codex/agents/strict-reviewer.toml");
    const back = importAgentFile({ path: file.path, content: file.content });
    if (!back.ok) throw new Error(back.message);
    expect(back.agent).toMatchObject({ permission: "read-only", instructions: reviewer().instructions });
    expect(file.leftOut).toContain("tools");
  });

  test("an Auto agent is written without a permission, so the file grants nothing", () => {
    const implementer = duplicateAgent(getBuiltinAgent("implementer")!, []);
    const claude = exportAgentFile(implementer, "claude-md");
    expect(claude.content).not.toContain("permissionMode");
    expect(claude.content).toContain("isolation: worktree");
    expect(claude.leftOut).toContain("permission");
    expect(exportAgentFile(implementer, "codex-toml").content).not.toContain("sandbox_mode");
    for (const file of [claude, exportAgentFile(implementer, "codex-toml")]) {
      expect(file.content).not.toMatch(/bypassPermissions|danger-full-access|hooks|mcp/i);
    }
  });
});
