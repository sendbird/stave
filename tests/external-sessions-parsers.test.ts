import { describe, expect, test } from "bun:test";
import {
  ClaudeTranscriptState,
  deriveAgentStatus,
  parseClaudeAgentMeta,
} from "../electron/main/external-sessions/claude-transcript";
import { CodexRolloutState, STAVE_CODEX_ORIGINATOR } from "../electron/main/external-sessions/codex-rollout";
import { describeClaudeTool, describeCodexCall } from "../electron/main/external-sessions/external-actions";

const CWD = "/tmp/project";
const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
const line = (value: unknown) => JSON.stringify(value);

function assistant(second: number, content: unknown[], extra: Record<string, unknown> = {}) {
  return line({ type: "assistant", timestamp: at(second), cwd: CWD, gitBranch: "feat/x", message: { model: "claude-test", content, ...extra } });
}

describe("ClaudeTranscriptState", () => {
  test("reads title, folder, branch, current action, steps and context, and waits after a final answer", () => {
    const state = new ClaudeTranscriptState();
    state.feed([
      line({ type: "user", timestamp: at(0), cwd: CWD, message: { role: "user", content: "Fix the sidebar badge" } }),
      assistant(1, [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: `${CWD}/src/app.ts` } }], { stop_reason: "tool_use" }),
      line({ type: "user", timestamp: at(2), message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } }),
      assistant(3, [{ type: "tool_use", id: "t2", name: "Bash", input: { command: "npm test" } }], {
        stop_reason: "tool_use",
        usage: { input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, output_tokens: 40 },
      }),
    ]);
    expect(state.title).toBe("Fix the sidebar badge");
    expect(state.cwd).toBe(CWD);
    expect(state.branch).toBe("feat/x");
    expect(state.action).toEqual({ verb: "run", target: "npm test" });
    expect(state.steps).toBe(2);
    expect(state.contextTokens).toBe(1250);
    expect(state.final).toBe(false);

    state.feed([assistant(4, [{ type: "text", text: "Done." }], { stop_reason: "end_turn" })]);
    expect(state.final).toBe(true);
    // A new prompt starts work again.
    state.feed([line({ type: "user", timestamp: at(5), message: { content: "And the tooltip" } })]);
    expect(state.final).toBe(false);
    expect(state.title).toBe("Fix the sidebar badge");
  });

  test("prefers Claude Code's own title and ignores malformed, unknown and request-log lines", () => {
    const state = new ClaudeTranscriptState();
    state.feed([
      "{not json",
      "[]",
      line({ type: "api-request", body: "x".repeat(10) }),
      line({ type: "some-future-entry", payload: { anything: true } }),
      line({ type: "user", timestamp: at(0), message: { content: "<system-reminder>machine</system-reminder>" } }),
      line({ type: "user", timestamp: at(1), message: { content: "Real prompt" } }),
      line({ type: "ai-title", aiTitle: "Sidebar badge fix" }),
      line({ type: "assistant", timestamp: at(2), message: { content: "not an array", stop_reason: 42 } }),
      line({ type: "assistant", timestamp: at(3), message: null }),
    ]);
    expect(state.title).toBe("Sidebar badge fix");
    expect(state.firstPrompt).toBe("Real prompt");
    expect(state.steps).toBe(0);
  });

  test("an interrupted turn waits for the user", () => {
    const state = new ClaudeTranscriptState();
    state.feed([
      assistant(1, [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: `${CWD}/a.ts` } }], { stop_reason: "tool_use" }),
      line({ type: "user", timestamp: at(2), message: { content: [{ type: "text", text: "[Request interrupted by user]" }] } }),
    ]);
    expect(state.final).toBe(true);
    expect(state.action).toEqual({ verb: "edit", target: "a.ts" });
  });

  test("records sub-agent launches, their results and task notifications", () => {
    const state = new ClaudeTranscriptState();
    state.feed([
      assistant(1, [{ type: "tool_use", id: "agent-call", name: "Agent", input: { description: "Explore the IPC layer", subagent_type: "Explore", run_in_background: true } }], { stop_reason: "tool_use" }),
      line({ type: "user", timestamp: at(2), toolUseResult: { status: "async_launched" }, message: { content: [{ type: "tool_result", tool_use_id: "agent-call", content: [{ type: "text", text: "Async agent launched" }] }] } }),
      line({ type: "queue-operation", operation: "enqueue", timestamp: at(9), content: "<task-notification><task-id>a1</task-id><tool-use-id>agent-call</tool-use-id><status>completed</status></task-notification>" }),
    ]);
    expect(state.launches.get("agent-call")).toEqual({ description: "Explore the IPC layer", agentType: "Explore" });
    expect(state.results.get("agent-call")?.async).toBe(true);
    expect(state.notices.get("agent-call")?.status).toBe("completed");
  });

  test("redacts credentials in the step text", () => {
    const state = new ClaudeTranscriptState();
    state.feed([assistant(1, [{ type: "tool_use", id: "t", name: "Bash", input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop' https://x" } }])]);
    expect(state.action?.target).not.toContain("abcdefghijklmnop");
    expect(state.action?.target).toContain("<redacted>");
  });
});

describe("deriveAgentStatus", () => {
  const now = 1_000_000;
  const idleMs = 5 * 60_000;
  test("the session's notice or foreground result decides, unless the agent wrote again after it", () => {
    expect(deriveAgentStatus({ lastWriteAt: now - 1000, now, idleMs, final: false, markedFinished: false, notice: { status: "failed", ts: now - 500 } })).toBe("failed");
    expect(deriveAgentStatus({ lastWriteAt: now - 1000, now, idleMs, final: false, markedFinished: false, result: { error: false, async: false, ts: now - 900 } })).toBe("finished");
    expect(deriveAgentStatus({ lastWriteAt: now - 1000, now, idleMs, final: false, markedFinished: false, notice: { status: "completed", ts: now - 60_000 } })).toBe("running");
    expect(deriveAgentStatus({ lastWriteAt: now - 1000, now, idleMs, final: false, markedFinished: false, result: { error: false, async: true, ts: now - 900 } })).toBe("running");
  });
  test("a final answer or the side file's mark finishes it; a quiet agent is idle", () => {
    expect(deriveAgentStatus({ lastWriteAt: now - 1000, now, idleMs, final: true, markedFinished: false })).toBe("finished");
    expect(deriveAgentStatus({ lastWriteAt: now - idleMs - 1, now, idleMs, final: false, markedFinished: true })).toBe("finished");
    expect(deriveAgentStatus({ lastWriteAt: now - idleMs - 1, now, idleMs, final: false, markedFinished: false })).toBe("idle");
  });
  test("reads only the shown fields of the side file and survives a broken one", () => {
    expect(parseClaudeAgentMeta(JSON.stringify({ agentType: "Explore", description: "Map IPC", toolUseId: "t9", worktreePath: "/x", isBuiltIn: true, finished: true }))).toEqual({
      agentType: "Explore", description: "Map IPC", toolUseId: "t9", worktreePath: "/x", finished: true,
    });
    // Workspace cleanup matches worktrees by absolute path only.
    expect(parseClaudeAgentMeta(JSON.stringify({ worktreePath: "relative/agent-1" }))).toEqual({});
    expect(parseClaudeAgentMeta("{oops")).toEqual({});
    expect(parseClaudeAgentMeta("null")).toEqual({});
  });
});

describe("CodexRolloutState", () => {
  test("reads the session, its turn state, tokens and function calls", () => {
    const state = new CodexRolloutState();
    state.feed([
      line({ timestamp: at(0), type: "session_meta", payload: { id: "codex-1", originator: "codex-tui", cwd: CWD, timestamp: at(0), git: { branch: "main" } } }),
      line({ timestamp: at(1), type: "turn_context", payload: { cwd: CWD, model: "gpt-test" } }),
      line({ timestamp: at(1), type: "event_msg", payload: { type: "user_message", message: "Add a tooltip\nwith details" } }),
      line({ timestamp: at(2), type: "event_msg", payload: { type: "task_started" } }),
      "garbage",
      line({ timestamp: at(3), type: "response_item", payload: { type: "function_call", name: "exec_command", arguments: JSON.stringify({ cmd: "bun test" }) } }),
      line({ timestamp: at(4), type: "response_item", payload: { type: "custom_tool_call", name: "apply_patch", input: "*** Begin Patch\n*** Update File: /tmp/project/src/a.ts\n@@" } }),
      line({ timestamp: at(5), type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 900, output_tokens: 100, total_tokens: 1000 } } } }),
      line({ timestamp: at(6), type: "unknown_kind", payload: {} }),
    ]);
    expect(state.id).toBe("codex-1");
    expect(state.originator).toBe("codex-tui");
    expect(state.branch).toBe("main");
    expect(state.model).toBe("gpt-test");
    expect(state.title).toBe("Add a tooltip");
    expect(state.steps).toBe(2);
    expect(state.action).toEqual({ verb: "edit", target: "src/a.ts" });
    expect(state.contextTokens).toBe(1000);
    expect(state.final).toBe(false);
    state.feed([line({ timestamp: at(7), type: "event_msg", payload: { type: "task_complete" } })]);
    expect(state.final).toBe(true);
  });

  test("Stave's own App Server sessions carry the stave originator", () => {
    const state = new CodexRolloutState();
    state.feed([line({ type: "session_meta", payload: { id: "s", originator: STAVE_CODEX_ORIGINATOR } })]);
    expect(state.originator).toBe("stave");
  });
});

describe("actions", () => {
  test("Claude tools become a verb and a folder-relative object", () => {
    expect(describeClaudeTool("Grep", { pattern: "useStore" })).toEqual({ verb: "search", target: "useStore" });
    expect(describeClaudeTool("mcp__github__create_issue", { title: "x" })).toEqual({ verb: "tool", tool: "create_issue" });
    expect(describeClaudeTool("Read", { file_path: "/elsewhere/a.ts" }, CWD)).toEqual({ verb: "read", target: "/elsewhere/a.ts" });
    expect(describeClaudeTool("Read", { file_path: `${CWD}/${"d/".repeat(80)}file.ts` }, CWD).target?.endsWith("file.ts")).toBe(true);
  });
  test("Codex calls survive arguments that are not JSON", () => {
    expect(describeCodexCall("exec_command", "{oops")).toEqual({ verb: "run" });
    expect(describeCodexCall("shell", JSON.stringify({ command: ["git", "status"] }))).toEqual({ verb: "run", target: "git status" });
    expect(describeCodexCall("update_plan", "{}")).toEqual({ verb: "plan" });
  });
});

test("live Claude progress bounds retained summaries and links a failed result without retaining its output", () => {
  const state = new ClaudeTranscriptState();
  state.progress.enabled = true;
  state.feed(Array.from({ length: 36 }, (_, i) => assistant(i, [{ type: "text", text: "note " + i }])));
  state.feed([
    assistant(37, [{ type: "tool_use", id: "read", name: "Read", input: { file_path: CWD + "/file.ts" } }]),
    line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "read", is_error: true, content: "raw output" }] } }),
    assistant(38, [{ type: "text", text: "password=exampleValue" }]),
  ]);
  const entries = state.progress.snapshot();
  expect(entries).toHaveLength(32);
  expect(entries.at(-2)).toMatchObject({ kind: "tool", action: { verb: "read", target: "file.ts" }, status: "error" });
  expect(JSON.stringify(entries)).not.toMatch(/raw output|exampleValue/);
});

test("Codex progress includes event-only prompts and collapses the item and event for the same prompt", () => {
  const state = new CodexRolloutState();
  state.progress.enabled = true;
  state.feed([
    line({ type: "event_msg", payload: { type: "user_message", message: "First prompt" } }),
    line({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "First prompt" }] } }),
    line({ type: "event_msg", payload: { type: "user_message", message: "Follow up" } }),
    line({ type: "response_item", payload: { type: "function_call", name: "exec_command", call_id: "c", arguments: '{"cmd":"ls"}' } }),
    line({ type: "response_item", payload: { type: "function_call_output", call_id: "c", output: "raw output" } }),
  ]);
  expect(state.progress.snapshot()).toMatchObject([
    { kind: "user", text: "First prompt" }, { kind: "user", text: "Follow up" }, { kind: "tool", status: "done" },
  ]);
});
