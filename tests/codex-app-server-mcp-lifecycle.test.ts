import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { applyProviderTurnActivityEvents } from "@/lib/providers/turn-status";

const actualChildProcess = await import("node:child_process");

class FakeStream extends EventEmitter {
  setEncoding(_encoding: string) {}
}

type FakeScenario = "full-lifecycle" | "completed-only";

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  killed = false;

  constructor(private readonly scenario: FakeScenario) {
    super();
  }

  stdin = {
    write: (payload: string) => {
      const messages = payload
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as {
              id?: number;
              method?: string;
            },
        );

      for (const message of messages) {
        if (message.method === "initialize" && message.id != null) {
          this.emitResponse(message.id, { capabilities: {} });
          continue;
        }
        if (message.method === "account/read" && message.id != null) {
          this.emitResponse(message.id, {
            account: { type: "chatgpt" },
            requiresOpenaiAuth: true,
          });
          continue;
        }
        if (message.method === "thread/start" && message.id != null) {
          this.emitResponse(message.id, { thread: { id: "thread-1" } });
          continue;
        }
        if (message.method === "thread/goal/get" && message.id != null) {
          this.emitResponse(message.id, { goal: null });
          continue;
        }
        if (message.method === "turn/start" && message.id != null) {
          this.emitResponse(message.id, { turn: { id: "turn-1" } });
          queueMicrotask(() => this.emitMcpLifecycle());
        }
      }

      return true;
    },
  };

  kill() {
    this.killed = true;
    return true;
  }

  private emitResponse(id: number, result: unknown) {
    this.emitJson({ jsonrpc: "2.0", id, result });
  }

  private emitMcpLifecycle() {
    const item = {
      id: "mcp-item-1",
      type: "mcpToolCall",
      server: "functions",
      tool: "collaboration.spawn_agent",
      arguments: {
        task_name: "inspect_runtime",
        message: "Inspect the Codex runtime",
      },
      status: "inProgress",
    };
    const envelope = {
      threadId: "thread-1",
      turnId: "turn-1",
    };

    if (this.scenario === "full-lifecycle") {
      this.emitJson({
        jsonrpc: "2.0",
        method: "item/started",
        params: { ...envelope, item, startedAtMs: 1 },
      });
      // Replayed starts must not create duplicate activity rows/events.
      this.emitJson({
        jsonrpc: "2.0",
        method: "item/started",
        params: { ...envelope, item, startedAtMs: 1 },
      });
      this.emitJson({
        jsonrpc: "2.0",
        method: "item/mcpToolCall/progress",
        params: {
          ...envelope,
          itemId: item.id,
          message: "Agent is inspecting the runtime",
        },
      });
    }

    this.emitJson({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        ...envelope,
        item: {
          ...item,
          status: "completed",
          result: { content: [{ type: "text", text: "Inspection complete" }] },
        },
        completedAtMs: 2,
      },
    });
    this.emitJson({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        ...envelope,
        turn: { id: "turn-1", status: "completed" },
      },
    });
  }

  private emitJson(message: unknown) {
    this.stdout.emit("data", `${JSON.stringify(message)}\n`);
  }
}

let nextScenario: FakeScenario = "full-lifecycle";

mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: () => new FakeChild(nextScenario),
}));

afterEach(() => {
  nextScenario = "full-lifecycle";
  mock.restore();
});

async function streamScenario(scenario: FakeScenario) {
  nextScenario = scenario;
  const runtime = await import(
    `../electron/providers/codex-app-server-runtime?mcp-lifecycle-test=${Date.now()}-${Math.random()}`
  );
  const events = await runtime.streamCodexWithAppServer({
    providerId: "codex",
    taskId: `task-${scenario}`,
    prompt: "Inspect the runtime",
    cwd: process.cwd(),
    runtimeOptions: {
      codexBinaryPath: `/tmp/fake-codex-${scenario}`,
    },
  });
  return (events ?? []).filter((event) =>
    ["tool", "subagent_progress", "tool_result"].includes(event.type),
  );
}

describe("Codex App Server MCP lifecycle mapping", () => {
  test("emits MCP input at item start, then progress and one completion", async () => {
    const events = await streamScenario("full-lifecycle");

    expect(events).toEqual([
      {
        type: "tool",
        toolUseId: "mcp-item-1",
        toolName: "functions:collaboration.spawn_agent",
        input:
          '{"task_name":"inspect_runtime","message":"Inspect the Codex runtime"}',
        state: "input-available",
      },
      {
        type: "subagent_progress",
        toolUseId: "mcp-item-1",
        content: "Agent is inspecting the runtime",
      },
      {
        type: "tool_result",
        tool_use_id: "mcp-item-1",
        output: '{"content":[{"type":"text","text":"Inspection complete"}]}',
      },
    ]);

    const activity = applyProviderTurnActivityEvents({
      activityByTask: {},
      taskId: "task-full-lifecycle",
      turnId: "turn-1",
      providerId: "codex",
      now: 1_000,
      events,
    });
    expect(
      activity["task-full-lifecycle"]?.workItemsById["mcp-item-1"],
    ).toMatchObject({
      kind: "subagent",
      title: "inspect_runtime",
      detail: "Inspection complete",
      status: "completed",
    });
  });

  test("keeps the completed-only MCP fallback mapping", async () => {
    const events = await streamScenario("completed-only");

    expect(events.map((event) => event.type)).toEqual(["tool", "tool_result"]);
    expect(events[0]).toMatchObject({
      type: "tool",
      toolUseId: "mcp-item-1",
      toolName: "functions:collaboration.spawn_agent",
      state: "input-available",
    });
  });
});
