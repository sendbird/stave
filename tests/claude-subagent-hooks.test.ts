import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { PreToolUseHookInput, SubagentStartHookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION,
  claudeSubagentScratchId,
  createClaudeSubagentPreToolUseHook,
  createClaudeSubagentStartHook,
  resolveClaudeSubagentStartContext,
} from "../electron/providers/claude-subagent-hooks";
import { buildWorkspaceScratchSubagentInstruction } from "../src/lib/workspace-scratch";

const cwd = path.resolve("/tmp/stave-subagent-workspace");
const signal = new AbortController().signal;
function preToolUse(toolName: string, toolInput: unknown, permissionMode?: string): PreToolUseHookInput {
  return {
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "toolu_01ABC",
    session_id: "session",
    transcript_path: "/tmp/transcript.jsonl",
    cwd,
    ...(permissionMode ? { permission_mode: permissionMode } : {}),
  };
}

function subagentStart(agentId: string, agentType: string, subagentCwd = cwd): SubagentStartHookInput {
  return {
    hook_event_name: "SubagentStart",
    agent_id: agentId,
    agent_type: agentType,
    session_id: "session",
    transcript_path: "/tmp/transcript.jsonl",
    cwd: subagentCwd,
  };
}

describe("sub-agent foreground rewrite", () => {
  test("outside auto mode an Agent call that omits run_in_background runs in the foreground, brief unchanged", async () => {
    const hook = createClaudeSubagentPreToolUseHook({ permissionMode: "acceptEdits" });
    const input = { description: "Run the UI tests", prompt: "Run the tests and report.", subagent_type: "general-purpose" };
    const output = await hook(preToolUse("Agent", input, "acceptEdits"), "toolu_01ABC", { signal });
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        updatedInput: { ...input, run_in_background: false },
      },
    });
  });

  test("in auto mode no Agent call is changed, so auto mode's review still covers what runs", async () => {
    const hook = createClaudeSubagentPreToolUseHook({ permissionMode: "auto" });
    for (const toolInput of [
      { description: "Research", prompt: "Read and report." },
      { description: "Research", prompt: "Read and report.", run_in_background: true },
      { description: "Research", prompt: "Read and report.", run_in_background: false },
    ]) {
      expect(await hook(preToolUse("Agent", toolInput, "auto"), "toolu_01ABC", { signal })).toEqual({});
    }
  });

  test("the mode the CLI reports wins over the mode the query started with", async () => {
    const startedAuto = createClaudeSubagentPreToolUseHook({ permissionMode: "auto" });
    const switchedOut = await startedAuto(preToolUse("Agent", { prompt: "x" }, "default"), "toolu_01ABC", { signal });
    expect(switchedOut).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { prompt: "x", run_in_background: false } },
    });

    const startedDefault = createClaudeSubagentPreToolUseHook({ permissionMode: "default" });
    expect(await startedDefault(preToolUse("Agent", { prompt: "x" }, "auto"), "toolu_01ABC", { signal })).toEqual({});
    // A CLI that reports no mode falls back to the query's.
    expect(await startedAuto(preToolUse("Agent", { prompt: "x" }), "toolu_01ABC", { signal })).toEqual({});
  });

  test("never touches the brief or other tools", async () => {
    const hook = createClaudeSubagentPreToolUseHook();
    const prompt = "Find the owner.";
    const output = await hook(preToolUse("Agent", { prompt, run_in_background: false }), "toolu_01ABC", { signal });
    expect(output).toEqual({});
    expect(await hook(preToolUse("Bash", { command: "bun run dev", run_in_background: true }), "toolu_01ABC", { signal })).toEqual({});
    expect(await hook(preToolUse("Task", { prompt }), "toolu_01ABC", { signal })).toEqual({});
  });
});

describe("sub-agent start context", () => {
  test("names the sub-agent's own scratch folder under the workspace root and asks for foreground sub-agents", async () => {
    const hook = createClaudeSubagentStartHook({ scratchRoot: cwd });
    // A worktree-isolated sub-agent reports its own cwd; the folder still hangs off the workspace root.
    const output = await hook(subagentStart("agent-1", "researcher", "/tmp/elsewhere/worktree"), undefined, { signal });
    const id = claudeSubagentScratchId({ agentId: "agent-1", agentType: "researcher" });
    expect(id).toMatch(/^researcher-[0-9a-f]{6}$/);
    const folder = `${path.join(cwd, ".stave", "scratch", "agents", id)}${path.sep}`;
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: `${CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION}\n\n${buildWorkspaceScratchSubagentInstruction(folder)}`,
      },
    });
    expect(output).not.toHaveProperty("hookSpecificOutput.updatedInput");
  });

  test("read-only turns, a relative root or a missing agent id get only the foreground rule", async () => {
    const readOnly = await createClaudeSubagentStartHook()(subagentStart("agent-1", "Explore"), undefined, { signal });
    expect(readOnly).toEqual({
      hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION },
    });
    expect(resolveClaudeSubagentStartContext({ agentId: "a", scratchRoot: "relative" })).toBe(CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION);
    expect(resolveClaudeSubagentStartContext({ agentId: "", scratchRoot: cwd })).toBe(CLAUDE_SUBAGENT_FOREGROUND_INSTRUCTION);
  });

  test("ignores other hook events", async () => {
    const hook = createClaudeSubagentStartHook({ scratchRoot: cwd });
    expect(await hook(preToolUse("Agent", { prompt: "x" }), "toolu_01ABC", { signal })).toEqual({});
  });

  test("folder ids are short, path-safe and distinct per sub-agent", () => {
    expect(claudeSubagentScratchId({ agentId: "a" })).toMatch(/^[0-9a-f]{6}$/);
    expect(claudeSubagentScratchId({ agentId: "a", agentType: "테스트" })).toMatch(/^[0-9a-f]{6}$/);
    expect(claudeSubagentScratchId({ agentId: "a", agentType: "../../etc/passwd" })).toMatch(/^etc-passwd-[0-9a-f]{6}$/);
    expect(claudeSubagentScratchId({ agentId: "a", agentType: "plugin:very-long-agent-name-that-keeps-going" })).toMatch(
      /^plugin-very-long-agent-n-[0-9a-f]{6}$/,
    );
    expect(claudeSubagentScratchId({ agentId: "a", agentType: "researcher" })).not.toBe(
      claudeSubagentScratchId({ agentId: "b", agentType: "researcher" }),
    );
  });
});
