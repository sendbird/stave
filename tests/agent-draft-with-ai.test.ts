import { describe, expect, test } from "bun:test";
import { buildAgentDraftPrompt, parseAgentDraft } from "@/lib/agents/draft-with-ai";

describe("describe to create", () => {
  test("the prompt carries the description and the allowed values", () => {
    const prompt = buildAgentDraftPrompt("  Reviews PRs for missing tests.  ");
    expect(prompt).toContain("Reviews PRs for missing tests.");
    expect(prompt).toContain('"read-only"');
    expect(prompt).toContain('"new-worktree"');
    expect(prompt).toContain('"ci-fix"');
  });

  test("a drafted agent gets the shared reply style once and a task class", () => {
    const result = parseAgentDraft(
      '{"name":"Docs writer","instructions":"You write docs.","permission":"read-only","taskClass":"docs"}',
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.instructions).toContain("You write docs.");
    expect(result.agent.instructions.match(/Separate facts from inference/g)).toHaveLength(1);
    expect(result.agent.model).toEqual({ mode: "auto", taskClass: "docs" });
    expect(result.agent.report).toEqual(["summary", "findings", "limitations"]);
    const again = parseAgentDraft(JSON.stringify({ name: "Docs writer", instructions: result.agent.instructions }), []);
    expect(again.ok && again.agent.instructions.match(/Separate facts from inference/g)).toHaveLength(1);
  });

  test("an answer becomes an unsaved custom agent with a unique id", () => {
    const result = parseAgentDraft(
      '```json\n{"name":"Test reviewer","useWhen":"Use when a PR needs a test review.","instructions":"You review tests.\\nYou never edit files.","permission":"auto","workspace":"new-worktree","color":"cyan"}\n```',
      ["test-reviewer"],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.source).toBe("custom");
    expect(result.agent.id).toBe("test-reviewer-2");
    expect(result.agent.name).toBe("Test reviewer");
    expect(result.agent.description).toBe("Use when a PR needs a test review.");
    expect(result.agent.appearance?.color).toBe("cyan");
  });

  test("a read-only agent is kept in the current workspace instead of refused", () => {
    const result = parseAgentDraft(
      '{"name":"Researcher","instructions":"You read and report.","permission":"read-only","workspace":"new-worktree"}',
      [],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.permission).toBe("read-only");
    expect(result.agent.workspace).toBe("same-workspace");
  });

  test("unknown values fall back to the blank defaults", () => {
    const result = parseAgentDraft('{"name":"Helper","instructions":"You help.","permission":"root","color":"plaid"}', []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agent.permission).toBe("auto");
    expect(result.agent.appearance).toBeUndefined();
  });

  test("an answer without a name or instructions is refused", () => {
    expect(parseAgentDraft("no json here", []).ok).toBe(false);
    expect(parseAgentDraft('{"name":"Only a name"}', []).ok).toBe(false);
  });
});
