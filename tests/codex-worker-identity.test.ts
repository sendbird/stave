import { expect, test } from "bun:test";
import { createCodexWorkerActivityMapper } from "../electron/providers/codex-worker-activity";
import { selectTaskSubagents } from "../src/lib/delegation/subagent-summary";
import { appendProviderEventToAssistant } from "../src/lib/session/provider-event-replay";
import { createWorkGraph, reduceWorkGraphEvent } from "../src/lib/work-graph/work-graph-reducer";
import type { BridgeEvent } from "../electron/providers/types";
import type { ChatMessage } from "../src/types/chat";

test("links a worker whose identity first arrives when its spawn completes", () => {
  const mapper = createCodexWorkerActivityMapper({
    inputMaxBytes: 10_000,
    outputMaxBytes: 10_000,
  });
  let message: ChatMessage = {
    id: "assistant", role: "assistant", providerId: "codex", model: "model",
    content: "", turnId: "turn", parts: [],
  };
  let graph = createWorkGraph({ turnId: "turn", providerId: "codex", startedAt: 0 });
  const replay = (events: BridgeEvent[]) => {
    for (const event of events) {
      message = appendProviderEventToAssistant({ message, event });
      graph = reduceWorkGraphEvent(graph, event, 1);
    }
  };
  const spawn = {
    id: "spawn", type: "collabAgentToolCall", tool: "spawnAgent",
    receiverThreadIds: [], prompt: "Implementer\nRun focused checks.",
  };
  replay(mapper.mapStarted(spawn).events);
  // Completion may omit the original prompt; the displayed assignment survives.
  replay(mapper.mapCompleted({ ...spawn, prompt: null,
    receiverThreadIds: ["worker"], status: "completed" }).events);
  replay(mapper.mapForeignNotification({ method: "turn/plan/updated",
    threadId: "worker", params: { turnId: "child-turn", plan: [
      { step: "Run focused checks", status: "inProgress" },
    ] } }).events);
  for (const workGraph of [undefined, graph]) {
    const rows = selectTaskSubagents({ messages: [message], workGraph });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome.progress?.at(-1)).toBe("Run focused checks");
  }
  const spawnPart = message.parts.find((part) => part.type === "tool_use" && part.toolUseId === "spawn");
  expect(spawnPart).toMatchObject({ agentId: "worker" });
  if (spawnPart?.type === "tool_use") expect(spawnPart.input).toContain("Implementer");
  replay(mapper.mapForeignNotification({ method: "item/completed",
    threadId: "worker", params: { item: { type: "agentMessage",
      phase: "final_answer", text: "Checks passed." } } }).events);
  for (const workGraph of [undefined, graph]) {
    const rows = selectTaskSubagents({ messages: [message], workGraph });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome.status).toBe("returned");
    expect(rows[0]?.outcome.result).toBe("Checks passed.");
  }
});

test("an updated worker plan supplies its current step after another tool has completed", () => {
  let message: ChatMessage = {
    id: "assistant", role: "assistant", providerId: "codex", model: "model",
    content: "", turnId: "turn", parts: [],
  };
  let graph = createWorkGraph({ turnId: "turn", providerId: "codex", startedAt: 0 });
  const replay = (event: BridgeEvent) => {
    message = appendProviderEventToAssistant({ message, event });
    graph = reduceWorkGraphEvent(graph, event, 1);
  };
  replay({ type: "tool", toolUseId: "spawn", toolName: "collaboration:spawn_agent",
    input: '{"description":"Implementer"}', state: "input-available", agentId: "worker" });
  const plan = (content: string): BridgeEvent => ({ type: "tool", toolUseId: "worker-plan",
    toolName: "TodoWrite", state: "output-available", ownerAgentId: "worker", parentToolUseId: "spawn",
    input: JSON.stringify({ todos: [{ content, status: "in_progress" }] }) });
  replay(plan("Inspect the cause"));
  replay({ type: "tool", toolUseId: "check", toolName: "bash", input: "bun test",
    state: "input-available", ownerAgentId: "worker", parentToolUseId: "spawn" });
  replay({ type: "tool_result", tool_use_id: "check", output: "Checks passed." });
  replay(plan("Verify the fix"));
  for (const workGraph of [undefined, graph]) {
    expect(selectTaskSubagents({ messages: [message], workGraph })[0]?.outcome.progress?.at(-1))
      .toBe("Verify the fix");
  }
});
