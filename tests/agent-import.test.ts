import { describe, expect, test } from "bun:test";
import { detectAgentFileFormat, importAgentFile } from "@/lib/agents/import";
import { parseToml } from "@/lib/agents/toml-lite";

const CLAUDE_REVIEWER = `---
name: code-reviewer
description: Reviews code for quality and best practices. Use after writing code.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a senior code reviewer. Focus on correctness and security.
`;

const CLAUDE_WITH_HOOKS = `---
name: db-reader
description: Execute read-only database queries.
tools: Bash
permissionMode: bypassPermissions
memory: project
hooks:
  PreToolUse:
    - matcher: "Bash"
mcpServers:
  - github
isolation: worktree
---

You are a database analyst with read-only access.
`;

const CODEX_REVIEWER = `name = "reviewer"
description = "PR reviewer focused on correctness, security, and missing tests."
model = "gpt-6-sol"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"
developer_instructions = """
Review code like an owner.
Lead with concrete findings.
"""

[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
`;

describe("detectAgentFileFormat", () => {
  test("recognises each provider folder", () => {
    expect(detectAgentFileFormat(".claude/agents/review/security.md")).toBe("claude-md");
    expect(detectAgentFileFormat(".codex/agents/reviewer.toml")).toBe("codex-toml");
    expect(detectAgentFileFormat(".kiro/agents/ops.json")).toBe("kiro-json");
    expect(detectAgentFileFormat(".kiro/agents/ops.md")).toBe("kiro-md");
    expect(detectAgentFileFormat(".cursor/agents/ui.md")).toBe("cursor-md");
    expect(detectAgentFileFormat(".github/agents/test-specialist.agent.md")).toBe("copilot-md");
    expect(detectAgentFileFormat("docs/agents/readme.md")).toBeNull();
  });
});

describe("importAgentFile", () => {
  test("Claude reviewer: tools without write tools become a read-only agent", () => {
    const result = importAgentFile({ path: ".claude/agents/code-reviewer.md", content: CLAUDE_REVIEWER });
    if (!result.ok) throw new Error(result.message);
    expect(result.agent).toMatchObject({
      id: "code-reviewer",
      source: "repository",
      permission: "read-only",
      workspace: "same-workspace",
      model: { mode: "fixed", providerId: "claude-code", model: "sonnet" },
      tools: { allow: ["Read", "Grep", "Glob", "Bash"] },
      origin: { path: ".claude/agents/code-reviewer.md", format: "claude-md" },
    });
    expect(result.agent.instructions).toBe("You are a senior code reviewer. Focus on correctness and security.");
    expect(result.notes).toEqual([]);
  });

  test("Claude: hooks, MCP servers and bypass are refused; unknown fields are listed", () => {
    const result = importAgentFile({ path: ".claude/agents/db-reader.md", content: CLAUDE_WITH_HOOKS });
    if (!result.ok) throw new Error(result.message);
    const byField = Object.fromEntries(result.notes.map((note) => [note.field, note.outcome]));
    expect(byField).toMatchObject({
      hooks: "refused",
      mcpServers: "refused",
      permissionMode: "refused",
      memory: "dropped",
    });
    // Bash alone is not a write tool, so the agent is read-only and the
    // worktree request is changed rather than honoured.
    expect(result.agent.permission).toBe("read-only");
    expect(result.agent.workspace).toBe("same-workspace");
    expect(byField.isolation).toBe("changed");
  });

  test("Claude: isolation worktree is kept for an agent that edits", () => {
    const content = CLAUDE_WITH_HOOKS.replace("tools: Bash", "tools: Bash, Edit").replace("permissionMode: bypassPermissions\n", "");
    const result = importAgentFile({ path: ".claude/agents/db-writer.md", content });
    if (!result.ok) throw new Error(result.message);
    expect(result.agent.permission).toBe("guided");
    expect(result.agent.workspace).toBe("new-worktree");
  });

  test("Codex TOML: instructions, model, effort and sandbox map; MCP tables are refused", () => {
    const result = importAgentFile({ path: ".codex/agents/reviewer.toml", content: CODEX_REVIEWER });
    if (!result.ok) throw new Error(result.message);
    expect(result.agent).toMatchObject({
      id: "reviewer",
      permission: "read-only",
      model: { mode: "fixed", providerId: "codex", model: "gpt-6-sol", effort: "medium" },
    });
    expect(result.agent.instructions).toBe("Review code like an owner.\nLead with concrete findings.");
    expect(result.notes).toContainEqual(expect.objectContaining({ field: "mcp_servers.openaiDeveloperDocs", outcome: "refused" }));
  });

  test("Codex: danger-full-access is refused and falls back to guided", () => {
    const content = CODEX_REVIEWER.replace('sandbox_mode = "read-only"', 'sandbox_mode = "danger-full-access"');
    const result = importAgentFile({ path: ".codex/agents/reviewer.toml", content });
    if (!result.ok) throw new Error(result.message);
    expect(result.agent.permission).toBe("guided");
    expect(result.notes).toContainEqual(expect.objectContaining({ field: "sandbox_mode", outcome: "refused" }));
  });

  test("Kiro JSON: prompt text imports; file references, auto-approved tools and hooks do not", () => {
    const inline = importAgentFile({
      path: ".kiro/agents/ops.json",
      content: JSON.stringify({
        name: "ops",
        description: "Operations helper.",
        prompt: "Keep production safe.",
        tools: ["fs_read", "execute_bash"],
        allowedTools: ["fs_read"],
        hooks: { agentSpawn: [{ command: "echo hi" }] },
      }),
    });
    if (!inline.ok) throw new Error(inline.message);
    expect(inline.agent.instructions).toBe("Keep production safe.");
    expect(inline.notes.map((note) => [note.field, note.outcome])).toEqual(
      expect.arrayContaining([["allowedTools", "dropped"], ["hooks", "refused"]]),
    );

    const fileRef = importAgentFile({
      path: ".kiro/agents/ops.json",
      content: JSON.stringify({ name: "ops", prompt: "file://./prompts/ops.md" }),
    });
    expect(fileRef).toMatchObject({ ok: false, code: "missing-instructions" });
  });

  test("Cursor: readonly maps to read-only", () => {
    const result = importAgentFile({
      path: ".cursor/agents/auditor.md",
      content: "---\nname: auditor\ndescription: Audits changes.\nreadonly: true\n---\nAudit the diff.\n",
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.agent.permission).toBe("read-only");
    expect(result.agent.model).toEqual({ mode: "auto" });
  });

  test("Copilot: name falls back to the file name and a model without a Stave provider follows auto-routing", () => {
    const result = importAgentFile({
      path: ".github/agents/test-specialist.agent.md",
      content: "---\ndescription: Writes tests.\nmodel: some-model\n---\nWrite focused tests.\n",
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.agent.id).toBe("test-specialist");
    expect(result.agent.model).toEqual({ mode: "auto" });
    expect(result.notes).toContainEqual(expect.objectContaining({ field: "model", outcome: "changed" }));
  });

  test("refuses files outside agent folders, without instructions, or too long", () => {
    expect(importAgentFile({ path: "README.md", content: "x" })).toMatchObject({ ok: false, code: "unknown-format" });
    expect(importAgentFile({ path: ".claude/agents/a.md", content: "---\nname: a\n---\n" })).toMatchObject({
      ok: false,
      code: "missing-instructions",
    });
    expect(
      importAgentFile({ path: ".claude/agents/a.md", content: `---\nname: a\n---\n${"x".repeat(8_001)}` }),
    ).toMatchObject({ ok: false, code: "too-long" });
  });

  test("the origin hash changes with the file", () => {
    const a = importAgentFile({ path: ".claude/agents/code-reviewer.md", content: CLAUDE_REVIEWER });
    const b = importAgentFile({ path: ".claude/agents/code-reviewer.md", content: `${CLAUDE_REVIEWER}\nMore.` });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.agent.origin!.contentHash).not.toBe(b.agent.origin!.contentHash);
  });
});

describe("parseToml", () => {
  test("strings, literals, numbers, booleans, arrays and tables", () => {
    const parsed = parseToml(
      [
        'a = "x\\ty"',
        "b = 'raw\\n'",
        "c = 1_000",
        "d = true",
        'e = ["one", 2, false] # comment',
        "[tbl]",
        'inner = "ignored"',
        "[[list.item]]",
      ].join("\n"),
    );
    expect(parsed.values).toEqual({ a: "x\ty", b: "raw\\n", c: 1000, d: true, e: ["one", 2, false] });
    expect(parsed.tables).toEqual(["tbl", "list.item"]);
    expect(parsed.errors).toEqual([]);
  });

  test("reports what it cannot read instead of guessing", () => {
    const parsed = parseToml('x = { inline = 1 }\nnot a line\ny = """open');
    expect(parsed.values).toEqual({});
    expect(parsed.errors).toHaveLength(3);
  });
});
