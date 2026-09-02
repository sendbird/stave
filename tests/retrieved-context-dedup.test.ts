import { describe, expect, test } from "bun:test";
import {
  dedupeRetrievedContextForSession,
  RetrievedContextDedupStore,
} from "../electron/providers/retrieved-context-dedup";
import { STAVE_WORKSPACE_INFORMATION_SOURCE_ID } from "../src/lib/task-context/current-task-awareness";
import type { CanonicalConversationRequest } from "../src/lib/providers/provider.types";

function buildConversation(args: {
  information: string;
  taskId?: string;
}): CanonicalConversationRequest {
  return {
    taskId: args.taskId ?? "task-1",
    workspaceId: "ws-1",
    target: { providerId: "claude-code" },
    mode: "chat",
    history: [],
    input: {
      role: "user",
      providerId: "user",
      model: "user",
      content: "go",
      parts: [{ type: "text", text: "go" }],
    },
    contextParts: [
      {
        type: "retrieved_context",
        sourceId: STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
        title: "Stave Workspace Information",
        content: args.information,
      },
      {
        type: "retrieved_context",
        sourceId: "stave:current-task-awareness",
        title: "Current Stave Task Context",
        content: "identity block",
      },
    ],
  };
}

function informationContent(conversation?: CanonicalConversationRequest) {
  const part = conversation?.contextParts.find(
    (candidate) =>
      candidate.type === "retrieved_context" &&
      candidate.sourceId === STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
  );
  return part && part.type === "retrieved_context" ? part.content : "";
}

describe("dedupeRetrievedContextForSession", () => {
  test("never replaces content on a fresh session", () => {
    const store = new RetrievedContextDedupStore();
    const conversation = buildConversation({ information: "Todos: a" });

    const first = dedupeRetrievedContextForSession({
      conversation,
      activeResumeSessionId: null,
      store,
    });
    first.commit();

    expect(first.replacedSourceIds).toEqual([]);
    expect(informationContent(first.conversation)).toBe("Todos: a");
    // A session-less turn must not poison the store either.
    expect(store.size).toBe(0);
  });

  test("replaces an unchanged block on the next primed turn", () => {
    const store = new RetrievedContextDedupStore();

    const first = dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-1",
      store,
    });
    expect(first.replacedSourceIds).toEqual([]);
    first.commit();

    const second = dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-1",
      store,
    });

    expect(second.replacedSourceIds).toEqual([
      STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
    ]);
    expect(informationContent(second.conversation)).toContain(
      "unchanged since the previous turn",
    );
    // Blocks outside the dedup set are untouched.
    expect(
      second.conversation?.contextParts.some(
        (part) =>
          part.type === "retrieved_context" &&
          part.sourceId === "stave:current-task-awareness" &&
          part.content === "identity block",
      ),
    ).toBe(true);
  });

  test("resends the block after its content changes", () => {
    const store = new RetrievedContextDedupStore();
    dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-1",
      store,
    }).commit();

    const changed = dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a, b" }),
      activeResumeSessionId: "session-1",
      store,
    });

    expect(changed.replacedSourceIds).toEqual([]);
    expect(informationContent(changed.conversation)).toBe("Todos: a, b");
  });

  test("an uncommitted turn does not suppress the next one", () => {
    const store = new RetrievedContextDedupStore();
    // Dispatch failed: commit() is never called.
    dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-1",
      store,
    });

    const retry = dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-1",
      store,
    });

    expect(retry.replacedSourceIds).toEqual([]);
    expect(informationContent(retry.conversation)).toBe("Todos: a");
  });

  test("scopes hashes per task and per session id", () => {
    const store = new RetrievedContextDedupStore();
    dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-1",
      store,
    }).commit();

    const otherTask = dedupeRetrievedContextForSession({
      conversation: buildConversation({
        information: "Todos: a",
        taskId: "task-2",
      }),
      activeResumeSessionId: "session-1",
      store,
    });
    const otherSession = dedupeRetrievedContextForSession({
      conversation: buildConversation({ information: "Todos: a" }),
      activeResumeSessionId: "session-2",
      store,
    });

    expect(otherTask.replacedSourceIds).toEqual([]);
    expect(otherSession.replacedSourceIds).toEqual([]);
  });

  test("evicts the least recently used entry past the cap", () => {
    const store = new RetrievedContextDedupStore(2);
    store.set("a", "1");
    store.set("b", "2");
    store.get("a");
    store.set("c", "3");

    expect(store.size).toBe(2);
    expect(store.get("a")).toBe("1");
    expect(store.get("b")).toBeUndefined();
    expect(store.get("c")).toBe("3");
  });
});
