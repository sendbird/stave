"use strict";
/**
 * A stand-in for the `claude` CLI in stream-json mode, for Electron e2e specs
 * that need a provider outcome no real account can produce on demand. It
 * answers the Agent SDK's control requests, and the first Agent run turn
 * ends at a usage limit whose window resets a few seconds later; every other
 * turn answers with plain text. `FAKE_CLAUDE_DIR` holds `turns.jsonl`, one
 * line per turn, so a spec can read what ran. The arguments are never
 * recorded: their MCP config can carry the developer's own credentials.
 *
 * `FAKE_CLAUDE_TOOL_PROGRESS` (comma-separated tool call ids) makes a turn
 * whose prompt contains `[tool-progress]` report progress for those calls
 * before it answers, so Turn Activity lists steps the turn never wrote.
 *
 * A turn whose prompt contains `[permissions]` makes two calls, an `Edit` of
 * `README.md` then the shell command `rm -rf build`, and asks Stave's
 * permission callback about each in turn (`can_use_tool`), so a spec can see
 * one decided by the permission mode and answer the other itself.
 *
 * The first turn whose prompt contains `[fail]` ends with an execution error,
 * so a spec can read how Stave records a failed turn. Later turns answer
 * normally even when the earlier prompt is carried in their history.
 *
 * Launch it through a wrapper on `STAVE_CLAUDE_CLI_PATH` (see
 * `agent-run-usage-limit.electron.e2e.ts`).
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { randomUUID } = require("node:crypto");

const dir = process.env.FAKE_CLAUDE_DIR;
const args = process.argv.slice(2);
// Stave reads the CLI version to decide what it supports (auto permission
// mode needs a recent CLI); report one newer than any real release.
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write("99.0.0 (Claude Code)\n");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  process.stdout.write(`${JSON.stringify({ loggedIn: true, email: "e2e@example.invalid", orgName: "Stave e2e" })}\n`);
  process.exit(0);
}
if (!dir || !args.includes("stream-json")) process.exit(0);

const turnsFile = path.join(dir, "turns.jsonl");
const sessionId = randomUUID();
const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

// An Agent run turn carries its run key on Stave's MCP server; other turns (a
// warm-up, a title) leave it empty. Only the key's presence is read.
const runTurn = /"x-stave-agent-run-key":"[^"]+"/.test(args.join(" "));
const progressToolIds = (process.env.FAKE_CLAUDE_TOOL_PROGRESS ?? "").split(",").filter(Boolean);
const resumed = args.some((arg) => arg.startsWith("--resume"));

/** The number of this Agent run turn among the run turns so far; 0 for any other turn. */
function recordTurn() {
  const previous = fs.existsSync(turnsFile) ? fs.readFileSync(turnsFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
  fs.appendFileSync(turnsFile, `${JSON.stringify({ at: new Date().toISOString(), runTurn, resumed })}\n`);
  return runTurn ? previous.filter((entry) => entry.runTurn).length + 1 : 0;
}

/** Permission requests sent to the SDK, answered by its `control_response`. */
const pendingDecisions = new Map();

function askPermission(call) {
  const requestId = randomUUID();
  write({ type: "control_request", request_id: requestId,
    request: { subtype: "can_use_tool", tool_name: call.name, input: call.input, tool_use_id: call.id } });
  return new Promise((resolve) => pendingDecisions.set(requestId, resolve));
}

function finish(text) {
  write({ type: "assistant", session_id: sessionId, uuid: randomUUID(), parent_tool_use_id: null,
    message: { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model: "claude-sonnet-fake",
      content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage } });
  write({ type: "result", subtype: "success", is_error: false, result: text, duration_ms: 5, duration_api_ms: 1, num_turns: 1,
    stop_reason: "end_turn", session_id: sessionId, total_cost_usd: 0, usage, modelUsage: {}, permission_denials: [], uuid: randomUUID() });
}

async function answerPermissionsTurn() {
  const calls = [
    { id: "toolu_e2e_edit", name: "Edit", input: { file_path: "README.md", old_string: "validation", new_string: "validation" } },
    { id: "toolu_e2e_asked", name: "Bash", input: { command: "rm -rf build" } },
  ];
  write({ type: "assistant", session_id: sessionId, uuid: randomUUID(), parent_tool_use_id: null,
    message: { id: "msg_permissions", type: "message", role: "assistant", model: "claude-sonnet-fake",
      content: calls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.input })),
      stop_reason: "tool_use", stop_sequence: null, usage } });
  const outcomes = [];
  for (const call of calls) {
    const decision = await askPermission(call);
    const allowed = decision?.behavior === "allow";
    outcomes.push(`${call.name} ${allowed ? "allowed" : "denied"}`);
    write({ type: "user", session_id: sessionId, uuid: randomUUID(), parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: call.id, content: allowed ? "ok" : "Permission denied", is_error: !allowed }] } });
  }
  finish(`Permissions: ${outcomes.join(", ")}.`);
}

function answerTurn(line) {
  const turn = recordTurn();
  write({ type: "system", subtype: "init", session_id: sessionId, uuid: randomUUID(), cwd: process.cwd(), tools: [], mcp_servers: [],
    model: "claude-sonnet-fake", permissionMode: "default", slash_commands: [], apiKeySource: "none", claude_code_version: "99.0.0",
    output_style: "default", agents: [], skills: [], plugins: [] });
  if (line.includes("[permissions]")) {
    void answerPermissionsTurn();
    return;
  }
  if (turn === 1) {
    // The account's five-hour window is spent and resets in five seconds.
    write({ type: "rate_limit_event", session_id: sessionId, uuid: randomUUID(),
      rate_limit_info: { status: "rejected", rateLimitType: "five_hour", resetsAt: Math.floor(Date.now() / 1000) + 5 } });
    write({ type: "result", subtype: "error_during_execution", is_error: true, duration_ms: 5, duration_api_ms: 0, num_turns: 0,
      stop_reason: null, session_id: sessionId, total_cost_usd: 0, usage, modelUsage: {}, permission_denials: [],
      errors: ["Claude AI usage limit reached"], uuid: randomUUID() });
    return;
  }
  const failedOnce = path.join(dir, "failed-once");
  if (line.includes("[fail]") && !fs.existsSync(failedOnce)) {
    fs.writeFileSync(failedOnce, "");
    write({ type: "result", subtype: "error_during_execution", is_error: true, duration_ms: 5, duration_api_ms: 0, num_turns: 0,
      stop_reason: null, session_id: sessionId, total_cost_usd: 0, usage, modelUsage: {}, permission_denials: [],
      errors: ["Simulated provider failure"], uuid: randomUUID() });
    return;
  }
  if (line.includes("[tool-progress]")) {
    for (const toolUseId of progressToolIds) {
      write({ type: "tool_progress", tool_use_id: toolUseId, tool_name: "Read", parent_tool_use_id: null,
        elapsed_time_seconds: 1, session_id: sessionId, uuid: randomUUID() });
    }
  }
  const text = turn ? `Run turn ${turn} ran after the usage reset.` : "Done.";
  write({ type: "assistant", session_id: sessionId, uuid: randomUUID(), parent_tool_use_id: null,
    message: { id: `msg_${turn}`, type: "message", role: "assistant", model: "claude-sonnet-fake",
      content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage } });
  write({ type: "result", subtype: "success", is_error: false, result: text, duration_ms: 5, duration_api_ms: 1, num_turns: 1,
    stop_reason: "end_turn", session_id: sessionId, total_cost_usd: 0, usage, modelUsage: {}, permission_denials: [], uuid: randomUUID() });
}

const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.type === "control_response") {
    const requestId = message.response?.request_id;
    const resolve = pendingDecisions.get(requestId);
    pendingDecisions.delete(requestId);
    resolve?.(message.response?.response);
    return;
  }
  if (message.type === "control_request") {
    const response = message.request?.subtype === "initialize"
      ? { commands: [], agents: [], output_style: "default", available_output_styles: ["default"],
        models: [{ value: "sonnet", displayName: "Sonnet", description: "Fake model" }], account: {} }
      : {};
    write({ type: "control_response", response: { subtype: "success", request_id: message.request_id, response } });
    return;
  }
  if (message.type === "user") answerTurn(line);
});
input.on("close", () => process.exit(0));
