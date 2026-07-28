import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
  receivedMessages: Array<{
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
  }> = [];

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
              params?: Record<string, unknown>;
            },
        );

      for (const message of messages) {
        this.receivedMessages.push(message);
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
        if (message.method === "config/read" && message.id != null) {
          const cwd = String(message.params?.cwd ?? process.cwd());
          this.emitResponse(message.id, {
            config: {},
            origins: {},
            layers: [
              {
                name: {
                  type: "project",
                  dotCodexFolder: `${cwd}/.codex`,
                },
                config: {},
              },
            ],
          });
          continue;
        }
        if (message.method === "thread/start" && message.id != null) {
          this.emitResponse(message.id, { thread: { id: "thread-1" } });
          continue;
        }
        if (
          message.method === "mcpServerStatus/list" &&
          message.id != null
        ) {
          this.emitResponse(message.id, {
            data: [{ name: "functions" }, { name: "slack" }],
          });
          continue;
        }
        if (message.method === "thread/delete" && message.id != null) {
          this.emitResponse(message.id, {});
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
const fakeChildren: FakeChild[] = [];
const tempDirectories: string[] = [];

mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: () => {
    const child = new FakeChild(nextScenario);
    fakeChildren.push(child);
    return child;
  },
}));

afterEach(async () => {
  nextScenario = "full-lifecycle";
  fakeChildren.length = 0;
  mock.restore();
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
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
  }, 15_000);

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

  test("uses an ephemeral read-only thread and disables every MCP server for secondary execution", async () => {
    nextScenario = "completed-only";
    const runtime = await import(
      `../electron/providers/codex-app-server-runtime?secondary-policy-test=${Date.now()}-${Math.random()}`
    );

    await runtime.streamCodexWithAppServer({
      providerId: "codex",
      taskId: "secondary:execution-1",
      executionPolicy: "secondary-read-only",
      prompt: "Inspect the runtime",
      cwd: process.cwd(),
      runtimeOptions: {
        codexBinaryPath: "/tmp/fake-codex-secondary",
        codexApprovalPolicy: "on-request",
        codexFileAccess: "danger-full-access",
        codexNetworkAccess: true,
        codexWebSearch: "live",
      },
    });

    const child = fakeChildren[0]!;
    expect(
      child.receivedMessages.some(
        (message) => message.method === "config/read",
      ),
    ).toBe(true);
    const threadStart = child.receivedMessages.find(
      (message) => message.method === "thread/start",
    );
    const turnStart = child.receivedMessages.find(
      (message) => message.method === "turn/start",
    );

    expect(
      child.receivedMessages.some(
        (message) => message.method === "mcpServerStatus/list",
      ),
    ).toBe(true);
    expect(
      child.receivedMessages.some(
        (message) => message.method === "thread/resume",
      ),
    ).toBe(false);
    expect(threadStart?.params).toMatchObject({
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      config: {
        network_access: false,
        web_search: "disabled",
        'mcp_servers."functions".enabled': false,
        'mcp_servers."slack".enabled': false,
      },
    });
    expect(turnStart?.params).toMatchObject({
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });
    expect(
      child.receivedMessages.some(
        (message) => message.method === "thread/delete",
      ),
    ).toBe(true);
  });

  test("restarts App Server when project MCP config appears between turns", async () => {
    const cwd = await mkdtemp(
      path.join(tmpdir(), "stave-codex-project-refresh-"),
    );
    tempDirectories.push(cwd);
    const binaryPath = "/tmp/fake-codex-project-refresh";
    const runtime = await import(
      `../electron/providers/codex-app-server-runtime?project-refresh-test=${Date.now()}-${Math.random()}`
    );
    const stream = () =>
      runtime.streamCodexWithAppServer({
        providerId: "codex",
        taskId: "task-project-refresh",
        prompt: "Inspect the runtime",
        cwd,
        runtimeOptions: {
          codexBinaryPath: binaryPath,
        },
      });

    await stream();
    expect(fakeChildren).toHaveLength(1);

    const dotCodexFolder = path.join(cwd, ".codex");
    await mkdir(dotCodexFolder, { recursive: true });
    await writeFile(
      path.join(dotCodexFolder, "config.toml"),
      "[mcp_servers.crane]\nurl = 'http://one'\n",
    );
    await stream();

    expect(fakeChildren).toHaveLength(2);
    expect(fakeChildren[0]?.killed).toBe(true);
    expect(
      fakeChildren[1]?.receivedMessages.some(
        (message) => message.method === "thread/start",
      ),
    ).toBe(true);
    expect(
      fakeChildren[1]?.receivedMessages.some(
        (message) => message.method === "thread/resume",
      ),
    ).toBe(false);
  });
});
