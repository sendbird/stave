import { describe, expect, test } from "bun:test";
import { createHostTaskSteerCoordinator } from "../electron/host-service/host-task-steer";
import { createKeyedAsyncQueue } from "../electron/host-service/keyed-async-queue";
import { applyProviderEventsToWorkspaceSession } from "@/store/workspace-turn-replay";
import { buildSteeredUserMessageState } from "@/store/chat-state-helpers";
import { createEmptyWorkspaceState, type WorkspaceSessionState } from "@/store/workspace-session-state";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import { restoreActiveTurnStreaming } from "@/store/host-task-turn-sync";
import { ChatMessageSchema } from "@/lib/task-context/schemas";
import type { NormalizedProviderEvent, ProviderId, ProviderSteerTurnResponse } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";
import { mapClaudeMessageToEvents, type ClaudeIncomingMessage } from "../electron/providers/claude-event-mapping";

function harness(provider: ProviderId = "codex") {
  const turn = { turnId: "turn-1", workspaceId: "ws-1", workspaceName: "Workspace", taskId: "task-1", provider, model: "test-model" };
  const assistant: ChatMessage = {
    id: "assistant-before", role: "assistant", providerId: provider, model: turn.model,
    turnId: turn.turnId, nativeProviderSessionId: "session-1", nativeProviderTurnId: "native-turn-1",
    content: "Before steer", parts: [{ type: "text", text: "Before steer" }], isStreaming: true,
  };
  let session: WorkspaceSessionState = { ...createEmptyWorkspaceState(), workspaceInformation: createEmptyWorkspaceInformation(), nativeSessionReadyByTask: {}, messagesByTask: { [turn.taskId]: [assistant] }, messageCountByTask: { [turn.taskId]: 100 }, activeTurnIdsByTask: { [turn.taskId]: turn.turnId } };
  const queue = createKeyedAsyncQueue<string>();
  let sendCount = 0;
  let persistCount = 0;
  let response: ProviderSteerTurnResponse = { ok: true, delivery: "accepted" };
  let onSend = () => {};
  let failPersist = false;
  const coordinator = createHostTaskSteerCoordinator({
    send: async () => { sendCount += 1; onSend(); return response; },
    serialize: (workspaceId, operation) => queue.enqueue(workspaceId, operation),
    loadSession: async () => session,
    persist: async (_turn, next) => {
      if (failPersist) throw new Error("disk unavailable");
      persistCount += 1;
      session = next;
    },
  });
  coordinator.register(turn);
  const request = { turnId: turn.turnId, text: "Include the tests", enabled: true, clientMessageId: "client-1" };
  const emit = (event: NormalizedProviderEvent) => queue.enqueue(turn.workspaceId, async () => {
    session = applyProviderEventsToWorkspaceSession({ session, ...turn, events: [event] }).session;
  });
  return { turn, request, coordinator, queue, emit,
    rows: () => session.messagesByTask[turn.taskId] ?? [], session: () => session,
    counts: () => ({ sendCount, persistCount }),
    setResponse: (value: ProviderSteerTurnResponse) => { response = value; },
    onSend: (callback: () => void) => { onSend = callback; },
    failPersist: () => { failPersist = true; },
  };
}

describe("host task steering", () => {
  test("Claude SDK deltas, turn events and tool results retain their segments through steering and restore", async () => {
    const h = harness("claude-code");
    const mapped = (message: ClaudeIncomingMessage) => mapClaudeMessageToEvents({ message, claudeDebugStream: false });
    const delta = (type: "thinking_delta" | "text_delta", text: string) => mapped({
      type: "stream_event", uuid: "delta", session_id: "session-1", parent_tool_use_id: null,
      event: { type: "content_block_delta", index: 0, delta: type === "thinking_delta" ? { type, thinking: text } : { type, text } },
    } as ClaudeIncomingMessage);
    const tool = (id: string, uuid: string) => mapped({
      type: "assistant", uuid, session_id: "session-1", parent_tool_use_id: null,
      message: { content: [{ type: "tool_use", id, name: "Bash", input: { command: "bun test" } }] },
    } as ClaudeIncomingMessage);
    const emitMany = async (events: NormalizedProviderEvent[]) => {
      for (const event of events) await h.emit(event);
    };

    await emitMany(tool("tool-before", "native-before"));
    await emitMany(delta("thinking_delta", "Before steer reasoning"));
    // The SDK can emit deltas immediately after accepting streamed input.
    h.onSend(() => {
      for (const event of delta("thinking_delta", "After steer reasoning")) void h.emit(event);
    });
    expect(await h.coordinator.steer(h.request)).toMatchObject({ ok: true });
    await h.queue.drain();
    expect(h.rows()[0]?.parts.at(-1)).toMatchObject({ type: "thinking", text: "Before steer reasoning", isStreaming: false });

    await emitMany(mapped({
      type: "system", subtype: "task_progress", summary: "Worker is checking tests",
    } as ClaudeIncomingMessage));
    await emitMany(mapped({
      type: "tool_progress", tool_use_id: "tool-before", tool_name: "Bash", elapsed_time_seconds: 5,
    } as ClaudeIncomingMessage));
    await emitMany(mapped({
      type: "user", uuid: "tool-result", session_id: "session-1", parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tool-before", content: "Tests passed" }] },
    } as ClaudeIncomingMessage));
    await emitMany(delta("text_delta", "After steer answer"));
    await emitMany(tool("tool-after", "native-after"));

    const [before, user, after] = h.rows();
    expect(before).toMatchObject({ isStreaming: false, providerBoundary: { nativeId: "native-before" } });
    expect(before?.parts).toContainEqual(expect.objectContaining({ toolUseId: "tool-before", output: "Tests passed", elapsedSeconds: 5, state: "output-available" }));
    expect(before?.parts.some((part) => part.type === "system_event")).toBe(false);
    expect(user).toMatchObject({ id: "client-1", steeredIntoTurnId: h.turn.turnId });
    expect(after).toMatchObject({ id: "client-1-assistant", turnId: h.turn.turnId, providerId: "claude-code", content: "After steer answer", providerBoundary: { nativeId: "native-after" } });
    expect(after?.parts).toEqual([
      expect.objectContaining({ type: "thinking", text: "After steer reasoning", isStreaming: false }),
      expect.objectContaining({ type: "system_event", content: "Subagent progress: Worker is checking tests" }),
      expect.objectContaining({ type: "text", text: "After steer answer" }),
      expect.objectContaining({ type: "tool_use", toolUseId: "tool-after" }),
    ]);
    const restored = restoreActiveTurnStreaming({
      messages: h.rows().map((message) => ChatMessageSchema.parse(JSON.parse(JSON.stringify(message)))), activeTurnId: h.turn.turnId,
    });
    expect(restored).toEqual(h.rows());
    await h.emit({ type: "done", stop_reason: "user_abort" });
    expect(h.rows().filter((message) => message.role === "assistant").every((message) => !message.isStreaming)).toBe(true);
    expect(h.rows().at(-1)).toMatchObject({ terminalStopReason: "user_abort" });
  });

  test("persists the steer before concurrent events, survives reload and a second steer for every provider", async () => {
    for (const provider of ["codex", "claude-code", "cursor", "kiro"] as const) {
      const h = harness(provider);
      h.onSend(() => { void h.emit({ type: "text", text: "After steer", segmentId: "after-1" }); });
      expect(await h.coordinator.steer(h.request)).toMatchObject({ ok: true });
      await h.queue.drain();
      expect(h.rows().map((message) => message.content)).toEqual(["Before steer", "Include the tests", "After steer"]);
      expect(h.rows().at(-1)).toMatchObject({ id: "client-1-assistant", turnId: "turn-1", nativeProviderSessionId: "session-1", isStreaming: true });

      const restored = restoreActiveTurnStreaming({ messages: h.rows().map((message) => ChatMessageSchema.parse(JSON.parse(JSON.stringify(message)))), activeTurnId: h.turn.turnId });
      expect(restored).toEqual(h.rows());
      // A renderer update arriving before the acknowledgement must be a no-op.
      const duplicate = buildSteeredUserMessageState({ ...h.session(), taskId: h.turn.taskId, content: h.request.text, steeredIntoTurnId: h.turn.turnId, clientMessageId: h.request.clientMessageId, provider, activeModel: h.turn.model, turnStillActive: true });
      expect(duplicate.messagesByTask).toBe(h.session().messagesByTask);
      expect(await h.coordinator.steer(h.request)).toMatchObject({ ok: true });
      expect(h.counts()).toEqual({ sendCount: 1, persistCount: 1 });

      await h.coordinator.steer({ ...h.request, clientMessageId: "client-2", text: "Keep the scope" });
      await h.queue.drain();
      await h.emit({ type: "done", stop_reason: "end_turn" });
      expect(h.rows()).toHaveLength(5);
      expect(h.rows().filter((message) => message.role === "assistant").every((message) => message.content && !message.isStreaming && message.turnId === h.turn.turnId)).toBe(true);
      expect(h.session().messageCountByTask[h.turn.taskId]).toBe(104);
    }
  });

  test("rejects without changing history and retains unknown delivery without resending", async () => {
    const h = harness();
    const before = h.rows();
    h.setResponse({ ok: false, delivery: "rejected" });
    await h.coordinator.steer(h.request);
    expect(h.rows()).toBe(before);
    h.setResponse({ ok: false, delivery: "unknown" });
    await h.coordinator.steer(h.request);
    await h.coordinator.steer(h.request);
    expect(h.rows()).toBe(before);
    expect(h.counts()).toEqual({ sendCount: 2, persistCount: 0 });
  });

  test("a persistence failure after delivery stays unknown and cannot resend the same request", async () => {
    const h = harness();
    h.failPersist();
    expect(await h.coordinator.steer(h.request)).toMatchObject({ ok: false, delivery: "unknown" });
    await h.coordinator.steer(h.request);
    expect(h.counts()).toEqual({ sendCount: 1, persistCount: 0 });
  });

  test("records a late accepted steer after completion without an unfinished assistant", async () => {
    const h = harness();
    void h.emit({ type: "done", stop_reason: "end_turn" });
    await h.coordinator.steer(h.request);
    expect(h.rows().map((message) => message.role)).toEqual(["assistant", "user"]);
    expect(h.rows().some((message) => message.isStreaming)).toBe(false);
  });

  test("renderer-owned or retired turns only call the provider responder", async () => {
    const h = harness();
    h.coordinator.unregister(h.turn.turnId);
    await h.coordinator.steer(h.request);
    expect(h.counts()).toEqual({ sendCount: 1, persistCount: 0 });
  });

  test("a start that throws or fails releases the turn's steer route", async () => {
    const h = harness();
    h.coordinator.unregister(h.turn.turnId);
    expect(() => h.coordinator.startTurn(h.turn, () => {
      throw new Error("Workspace execution is stopped.");
    })).toThrow("stopped");
    await h.coordinator.steer(h.request);
    expect(h.counts()).toEqual({ sendCount: 1, persistCount: 0 });

    expect(h.coordinator.startTurn(h.turn, () => ({ ok: false }))).toEqual({ ok: false });
    await h.coordinator.steer({ ...h.request, clientMessageId: "client-2" });
    expect(h.counts()).toEqual({ sendCount: 2, persistCount: 0 });
  });

  test("a started turn keeps its steer route", async () => {
    const h = harness();
    h.coordinator.unregister(h.turn.turnId);
    expect(h.coordinator.startTurn(h.turn, () => ({ ok: true }))).toEqual({ ok: true });
    await h.coordinator.steer(h.request);
    expect(h.counts()).toEqual({ sendCount: 1, persistCount: 1 });
  });
});
