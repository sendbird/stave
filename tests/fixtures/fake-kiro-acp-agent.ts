import { createInterface } from "node:readline";

const scenario = process.argv[2] ?? "standard";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let pendingPromptId: unknown;
let pendingPermissionId: string | null = null;
let selectedModel = "auto";

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: unknown, value: unknown) {
  send({ jsonrpc: "2.0", id, result: value });
}

function update(value: Record<string, unknown>) {
  send({
    jsonrpc: "2.0",
    method: "session/notification",
    params: { sessionId: "kiro-fixture-session", update: value },
  });
}

function finishPrompt(stopReason = "end_turn") {
  result(pendingPromptId, {
    stopReason,
    usage: {
      total_tokens: 34,
      input_tokens: 21,
      output_tokens: 13,
      thought_tokens: 5,
      cached_read_tokens: 8,
      cached_write_tokens: 3,
    },
  });
  pendingPromptId = undefined;
  pendingPermissionId = null;
}

input.on("line", (line) => {
  const message = JSON.parse(line) as Record<string, unknown>;
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id;

  if (!method && pendingPermissionId && id === pendingPermissionId) {
    const response = message.result as Record<string, unknown> | undefined;
    update({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: `permission:${JSON.stringify(response?.outcome ?? {})}`,
      },
    });
    finishPrompt();
    return;
  }

  if (method === "initialize") {
    result(id, {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: true },
      },
      agentInfo: { name: "kiro-cli", version: "fixture" },
    });
    return;
  }
  if (method === "session/new") {
    result(id, { sessionId: "kiro-fixture-session" });
    return;
  }
  if (method === "session/load") {
    result(id, {});
    return;
  }
  if (method === "session/set_model") {
    const params = message.params as { modelId?: string } | undefined;
    selectedModel = params?.modelId ?? selectedModel;
    result(id, {});
    return;
  }
  if (method === "session/cancel") {
    finishPrompt("cancelled");
    return;
  }
  if (method !== "session/prompt") {
    return;
  }

  const params = message.params as Record<string, unknown> | undefined;
  // Verified against kiro-cli 2.20.1: `session/prompt` takes `prompt`, and a
  // request carrying `content` instead is never answered at all.
  if (!Array.isArray(params?.prompt)) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "prompt is required" },
    });
    return;
  }
  pendingPromptId = id;
  if (scenario === "cancel") {
    return;
  }
  if (scenario === "permission") {
    pendingPermissionId = "permission-kiro";
    send({
      jsonrpc: "2.0",
      id: pendingPermissionId,
      method: "session/request_permission",
      params: {
        sessionId: "kiro-fixture-session",
        toolCall: {
          toolCallId: "kiro-tool-permission",
          title: "Run Kiro fixture",
          kind: "execute",
          rawInput: { command: "fixture" },
        },
        options: [
          {
            optionId: "allow_once",
            name: "Allow once",
            kind: "allow_once",
          },
          {
            optionId: "reject_once",
            name: "Reject once",
            kind: "reject_once",
          },
        ],
      },
    });
    return;
  }

  update({
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Kiro thinking" },
  });
  update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: `Kiro response:${selectedModel}` },
    messageId: "kiro-message-1",
  });
  update({
    sessionUpdate: "usage_update",
    used: 144,
    size: 1024,
    cost: { amount: 0.002, currency: "USD" },
  });
  send({
    jsonrpc: "2.0",
    method: "_kiro.dev/compaction/status",
    params: {
      sessionId: "kiro-fixture-session",
      status: "completed",
      message: "Context compaction completed.",
    },
  });
  finishPrompt();
});
