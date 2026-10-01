import { expect, test } from "bun:test";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-event-mapping";
import { buildCodexCommandResult } from "../electron/providers/codex-command-result";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";
import { NormalizedProviderEventSchema } from "../src/lib/providers/schemas";
import { ChatMessageSchema } from "../src/lib/task-context/schemas";
import { extractStageFacts } from "../src/lib/missions/facts";
import { classifyStageEvidence } from "../src/lib/missions/evidence";
import { COMPLETE_REPORT } from "./fixtures/mission-fixtures";

function restoredFacts(result: unknown) {
  const replay = replayProviderEventsToTaskState({ taskId: "task", messages: [], provider: "codex", model: "model", turnId: "turn-1", events: [
    NormalizedProviderEventSchema.parse({ type: "tool", toolUseId: "shell-1", toolName: "bash", input: "bun test", state: "input-available" }),
    NormalizedProviderEventSchema.parse(result), { type: "done", stop_reason: "end_turn" },
  ] });
  const messages = replay.messages.map((message) => ChatMessageSchema.parse(JSON.parse(JSON.stringify(message))));
  return extractStageFacts({ messages, turnIds: new Set(["turn-1"]), currentTurnId: "turn-1", diff: null });
}
function evidence(facts: ReturnType<typeof restoredFacts>, turnId = "turn-1") {
  return classifyStageEvidence({ ...COMPLETE_REPORT, turnId, evidence: [{ kind: "check", label: "Tests", command: "bun test", toolCallId: "shell-1" }] }, facts)[0]!;
}

test("Claude raw tool failure survives normalized replay and persisted messages without a synthetic exit code", () => {
  const events = mapClaudeMessageToEvents({ claudeDebugStream: false, message: { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "shell-1", content: "Tests failed, claimed exit 0", is_error: true }] } } as never });
  const result = events.find((event) => event.type === "tool_result");
  expect(result).toMatchObject({ isError: true });
  const facts = restoredFacts(result);
  expect(facts.commands[0]).toMatchObject({ outcome: "failed", exitCode: null });
  expect(evidence(facts)).toMatchObject({ source: "provider", outcome: "failed", exitCode: null, freshness: "unknown" });
});

test("Codex actual process codes survive the provider mapping, replay and facts; output text supplies no status", () => {
  for (const exitCode of [0, 7, null, undefined]) {
    const facts = restoredFacts(buildCodexCommandResult({ id: "shell-1", status: "completed", exitCode }, "exit 0; all tests passed"));
    expect(facts.commands[0]).toMatchObject({ exitCode: exitCode ?? null, outcome: exitCode === 0 ? "succeeded" : exitCode === 7 ? "failed" : "unknown" });
    expect(evidence(facts).source).not.toBe("stave");
    expect(evidence(facts).freshness).toBe("unknown");
  }
  const contradiction = restoredFacts(buildCodexCommandResult({ id: "shell-1", status: "failed", exitCode: 0 }, "failed"));
  expect(evidence(contradiction)).toMatchObject({ outcome: "failed", source: "provider" });
});

test("older turns, reused tool ids and legacy facts cannot authenticate the current report", () => {
  const facts = restoredFacts(buildCodexCommandResult({ id: "shell-1", exitCode: 0 }, "passed"));
  expect(evidence(facts, "turn-2").source).toBe("agent");
  const twoTurns = extractStageFacts({ messages: ["turn-1", "turn-2"].map((turnId) => ({ turnId, parts: [{ type: "tool_use", toolUseId: "shell-1", toolName: "bash", input: "bun test", state: "output-available", exitCode: turnId === "turn-1" ? 0 : 3 }] })), turnIds: new Set(["turn-1", "turn-2"]), currentTurnId: "turn-2", diff: null });
  expect(twoTurns.commands).toHaveLength(2);
  expect(evidence(twoTurns, "turn-2")).toMatchObject({ outcome: "failed", exitCode: 3 });
  expect(evidence({ ...facts, commands: [{ command: "bun test", toolCallId: "shell-1", turnId: "turn-1", exitCode: 0 }] })).toMatchObject({ source: "agent", outcome: "unknown", exitCode: null });
});
