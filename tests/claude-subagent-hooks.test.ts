import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  claudeForegroundSubagentPreToolUseHook,
  claudeScratchSubagentPreToolUseHook,
  claudeSubagentScratchId,
  resolveClaudeSubagentScratchInput,
} from "../electron/providers/claude-subagent-hooks";
import { buildWorkspaceScratchSubagentInstruction } from "../src/lib/workspace-scratch";

const cwd = path.resolve("/tmp/stave-subagent-workspace");

function preToolUse(toolName: string, toolInput: unknown, toolUseId = "toolu_01ABC") {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: toolUseId,
    session_id: "session",
    transcript_path: "/tmp/transcript.jsonl",
    cwd,
  } as unknown as Parameters<typeof claudeScratchSubagentPreToolUseHook>[0];
}

const signal = new AbortController().signal;

describe("sub-agent scratch folder", () => {
  test("the Agent brief gains one line naming the sub-agent's own folder, and runs in the foreground", async () => {
    const output = await claudeScratchSubagentPreToolUseHook(
      preToolUse("Agent", { description: "Run the UI tests", prompt: "Run the tests and report.", subagent_type: "general-purpose" }),
      "toolu_01ABC",
      { signal },
    );
    const updated = (output as { hookSpecificOutput: { updatedInput: Record<string, unknown> } }).hookSpecificOutput.updatedInput;
    const id = claudeSubagentScratchId({ toolUseId: "toolu_01ABC", description: "Run the UI tests" });
    expect(id).toMatch(/^run-the-ui-tests-[0-9a-f]{6}$/);
    const folder = `${path.join(cwd, ".stave", "scratch", "agents", id)}${path.sep}`;
    expect(updated.run_in_background).toBe(false);
    expect(updated.subagent_type).toBe("general-purpose");
    expect(updated.prompt).toBe(`Run the tests and report.\n\n${buildWorkspaceScratchSubagentInstruction(folder)}`);
    expect(String(updated.prompt)).toContain("Stave scratch folder for this sub-agent");
    expect(String(updated.prompt)).toContain("never write secrets");
  });

  test("the older Task tool gets the folder line without the foreground rewrite", async () => {
    const output = await claudeScratchSubagentPreToolUseHook(
      preToolUse("Task", { description: "Review", prompt: "Review the diff." }, "toolu_task"),
      "toolu_task",
      { signal },
    );
    const updated = (output as { hookSpecificOutput: { updatedInput: Record<string, unknown> } }).hookSpecificOutput.updatedInput;
    expect(updated.run_in_background).toBeUndefined();
    expect(String(updated.prompt)).toContain(`${path.join(".stave", "scratch", "agents", "review-")}`);
  });

  test("read-only turns keep the brief as written", async () => {
    const output = await claudeForegroundSubagentPreToolUseHook(
      preToolUse("Agent", { description: "Explore", prompt: "Find the owner." }),
      "toolu_01ABC",
      { signal },
    );
    const updated = (output as { hookSpecificOutput: { updatedInput: Record<string, unknown> } }).hookSpecificOutput.updatedInput;
    expect(updated.prompt).toBe("Find the owner.");
    expect(updated.run_in_background).toBe(false);
  });

  test("no line for other tools, a missing brief, a relative cwd, or a brief that already names a folder", () => {
    const base = { toolUseId: "toolu_1", cwd };
    expect(resolveClaudeSubagentScratchInput({ ...base, toolName: "Bash", input: { prompt: "x" } })).toBeUndefined();
    expect(resolveClaudeSubagentScratchInput({ ...base, toolName: "Agent", input: { description: "x" } })).toBeUndefined();
    expect(resolveClaudeSubagentScratchInput({ ...base, toolName: "Agent", input: { prompt: "   " } })).toBeUndefined();
    expect(resolveClaudeSubagentScratchInput({ ...base, toolName: "Agent", input: null })).toBeUndefined();
    expect(resolveClaudeSubagentScratchInput({ toolUseId: "t", cwd: "relative", toolName: "Agent", input: { prompt: "x" } })).toBeUndefined();
    expect(
      resolveClaudeSubagentScratchInput({ ...base, toolName: "Agent", input: { prompt: "Save to .stave/scratch/agents/mine/." } }),
    ).toBeUndefined();
  });

  test("folder ids are short, path-safe and distinct per call", () => {
    expect(claudeSubagentScratchId({ toolUseId: "a" })).toMatch(/^[0-9a-f]{6}$/);
    expect(claudeSubagentScratchId({ toolUseId: "a", description: "테스트 실행" })).toMatch(/^[0-9a-f]{6}$/);
    expect(claudeSubagentScratchId({ toolUseId: "a", description: "../../etc/passwd" })).toMatch(/^etc-passwd-[0-9a-f]{6}$/);
    expect(claudeSubagentScratchId({ toolUseId: "a", description: "A very long description that keeps going" })).toMatch(
      /^a-very-long-description-[0-9a-f]{6}$/,
    );
    expect(claudeSubagentScratchId({ toolUseId: "a", description: "Same" })).not.toBe(
      claudeSubagentScratchId({ toolUseId: "b", description: "Same" }),
    );
  });
});
