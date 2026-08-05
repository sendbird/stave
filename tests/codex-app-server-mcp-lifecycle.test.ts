import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyProviderTurnActivityEvents } from "@/lib/providers/turn-status";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";

const actualChildProcess = await import("node:child_process");

class FakeStream extends EventEmitter {
  setEncoding(_encoding: string) {}
}

type FakeScenario = "full-lifecycle" | "completed-only" | "native-collab";

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  killed = false;
  receivedMessages: Array<{
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly scenario: FakeScenario,
    readonly spawnEnv: NodeJS.ProcessEnv,
  ) {
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
          queueMicrotask(() =>
            this.scenario === "native-collab"
              ? this.emitCollabLifecycle()
              : this.emitMcpLifecycle(),
          );
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

  private emitCollabLifecycle() {
    const envelope = { threadId: "thread-1", turnId: "turn-1" };
    const item = {
      id: "collab-item-1",
      type: "subAgentActivity",
      kind: "started",
      agentThreadId: "thread-worker-1",
      agentPath: "/root/terra_ack",
    };
    this.emitJson({
      jsonrpc: "2.0",
      method: "item/started",
      params: { ...envelope, item, startedAtMs: 1 },
    });
    this.emitJson({
      jsonrpc: "2.0",
      method: "item/completed",
      params: { ...envelope, item, completedAtMs: 2 },
    });
    this.emitJson({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        threadId: "thread-worker-1",
        turnId: "turn-worker-1",
        item: {
          id: "worker-progress-1",
          type: "agentMessage",
          phase: "commentary",
          text: "Checking the requested result",
        },
      },
    });
    this.emitJson({
      jsonrpc: "2.0",
      method: "item/completed",
      params: {
        threadId: "thread-worker-1",
        turnId: "turn-worker-1",
        item: {
          id: "worker-message-1",
          type: "agentMessage",
          phase: "final_answer",
          text: "WORKER_TERRA_OK",
        },
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
let nextBoundSecretEnv: Record<string, string> = {};
let resolvedSecretRequestCount = 0;
const fakeChildren: FakeChild[] = [];
const tempDirectories: string[] = [];

mock.module("../electron/main/browser/secret-service", () => ({
  resolveBoundSecretEnv: async () => {
    resolvedSecretRequestCount += 1;
    return { ...nextBoundSecretEnv };
  },
}));

mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: (
    _command: string,
    _args: string[],
    options?: { env?: NodeJS.ProcessEnv },
  ) => {
    const child = new FakeChild(nextScenario, options?.env ?? {});
    fakeChildren.push(child);
    return child;
  },
}));

afterEach(async () => {
  nextScenario = "full-lifecycle";
  nextBoundSecretEnv = {};
  resolvedSecretRequestCount = 0;
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

async function streamScenario(
  scenario: FakeScenario,
  runtimeOptions: ProviderRuntimeOptions = {},
) {
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
      ...runtimeOptions,
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

  test("records a Sol medium to Terra max Worker execution receipt", async () => {
    const events = await streamScenario("native-collab", {
      model: "gpt-5.6-sol",
      codexReasoningEffort: "medium",
      workerIntent: {
        mode: "task-executor",
        presetId: "verified-patch",
        workerModel: "gpt-5.6-terra",
        workerEffort: "max",
      },
    });

    expect(events).toEqual([
      {
        type: "tool",
        toolUseId: "collab-item-1",
        toolName: "collaboration:spawn_agent",
        input: '{"task_name":"terra_ack","agentThreadId":"thread-worker-1"}',
        state: "input-available",
        workerExecution: {
          providerId: "codex",
          primaryModel: "gpt-5.6-sol",
          presetId: "verified-patch",
          workerModel: "gpt-5.6-terra",
          workerEffort: "max",
        },
      },
      {
        type: "subagent_progress",
        toolUseId: "collab-item-1",
        content: "Checking the requested result",
      },
      {
        type: "tool_result",
        tool_use_id: "collab-item-1",
        output: "WORKER_TERRA_OK",
      },
    ]);

    const child = fakeChildren[0]!;
    const threadStart = child.receivedMessages.find(
      (message) => message.method === "thread/start",
    );
    const turnStart = child.receivedMessages.find(
      (message) => message.method === "turn/start",
    );
    expect(threadStart?.params).toMatchObject({
      model: "gpt-5.6-sol",
      config: {
        "agents.default_subagent_model": "gpt-5.6-terra",
        "agents.default_subagent_reasoning_effort": "max",
        "agents.max_concurrent_threads_per_session": 2,
        "agents.max_depth": 1,
      },
    });
    expect(turnStart?.params).toMatchObject({
      model: "gpt-5.6-sol",
      effort: "medium",
    });

    const activity = applyProviderTurnActivityEvents({
      activityByTask: {},
      taskId: "task-native-collab",
      turnId: "turn-1",
      providerId: "codex",
      now: 1_000,
      events,
    });
    expect(
      activity["task-native-collab"]?.workItemsById["collab-item-1"],
    ).toMatchObject({
      kind: "subagent",
      title: "Worker · terra_ack",
      badge: "Verified patch · GPT-5.6 Terra · max",
      status: "completed",
      workerExecution: {
        workerModel: "gpt-5.6-terra",
        workerEffort: "max",
      },
    });
  });

  test("uses an ephemeral read-only thread and disables every MCP server for secondary execution", async () => {
    nextScenario = "completed-only";
    nextBoundSecretEnv = {
      STAVE_TEST_BOUND_MCP_TOKEN: "must-not-reach-secondary",
    };
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
        boundSecretIds: ["00000000-0000-4000-8000-000000000001"],
      },
    });

    const child = fakeChildren[0]!;
    expect(resolvedSecretRequestCount).toBe(0);
    expect(child.spawnEnv.STAVE_TEST_BOUND_MCP_TOKEN).toBe(
      process.env.STAVE_TEST_BOUND_MCP_TOKEN,
    );
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

  test("scopes bound secrets to a disposable App Server process for MCP auth", async () => {
    const envName = "STAVE_TEST_BOUND_MCP_TOKEN";
    const secretValue = "test-only-mcp-token";
    nextScenario = "completed-only";
    nextBoundSecretEnv = { [envName]: secretValue };
    const runtime = await import(
      `../electron/providers/codex-app-server-runtime?secret-mcp-env-test=${Date.now()}-${Math.random()}`
    );

    const secretEvents = await runtime.streamCodexWithAppServer({
      providerId: "codex",
      taskId: "task-secret-mcp-env",
      prompt: "Use the authenticated MCP server",
      cwd: process.cwd(),
      runtimeOptions: {
        codexBinaryPath: "/tmp/fake-codex-secret-mcp-env",
        boundSecretIds: ["00000000-0000-4000-8000-000000000001"],
      },
    });

    expect(resolvedSecretRequestCount).toBe(1);
    expect(fakeChildren).toHaveLength(2);
    expect(fakeChildren[0]?.spawnEnv[envName]).toBe(process.env[envName]);
    expect(fakeChildren[0]?.killed).toBe(false);
    expect(fakeChildren[1]?.spawnEnv[envName]).toBe(secretValue);
    expect(fakeChildren[1]?.killed).toBe(true);
    expect(JSON.stringify(secretEvents)).not.toContain(secretValue);

    nextBoundSecretEnv = {};
    await runtime.streamCodexWithAppServer({
      providerId: "codex",
      taskId: "task-without-secret",
      prompt: "Continue without the secret",
      cwd: process.cwd(),
      runtimeOptions: {
        codexBinaryPath: "/tmp/fake-codex-secret-mcp-env",
      },
    });

    expect(fakeChildren).toHaveLength(2);
    expect(fakeChildren[0]?.spawnEnv[envName]).toBe(process.env[envName]);
    expect(fakeChildren[0]?.killed).toBe(false);
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
