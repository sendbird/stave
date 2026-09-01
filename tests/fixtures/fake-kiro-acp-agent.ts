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
    // MCP servers start while `session/new` is still in flight, so this
    // namespaced notification always precedes the session result.
    send({
      jsonrpc: "2.0",
      method: "_kiro.dev/mcp/server_initialized",
      params: {
        status: "completed",
        message: "MCP server ready.",
      },
    });
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
  if (method === "_session/steer") {
    if (scenario === "steer-unsupported") {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found: _session/steer" },
      });
      return;
    }
    const params = message.params as Record<string, unknown> | undefined;
    const prompt = params?.prompt;
    const text =
      Array.isArray(prompt) &&
      prompt[0] !== null &&
      typeof prompt[0] === "object" &&
      (prompt[0] as Record<string, unknown>).type === "text" &&
      typeof (prompt[0] as Record<string, unknown>).text === "string"
        ? ((prompt[0] as Record<string, unknown>).text as string)
        : "";
    if (params?.sessionId !== "kiro-fixture-session" || !text.trim()) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "invalid steer payload" },
      });
      return;
    }
    result(id, {});
    if (pendingPromptId !== undefined) {
      update({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `steered:${text}` },
        messageId: "kiro-steer-message-1",
      });
      finishPrompt();
    }
    return;
  }
  if (method !== "session/prompt") {
    if (id !== undefined) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
    return;
  }

  const params = message.params as Record<string, unknown> | undefined;
  // Verified against kiro-cli 2.20.1: `session/prompt` reads the spec-standard
  // `prompt` key and never answers a request that carries only `content`,
  // while older builds read only `content`. Requiring both here pins the
  // runtime to sending both.
  if (!Array.isArray(params?.content) || !Array.isArray(params?.prompt)) {
    send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32602,
        message: "prompt and content are required",
      },
    });
    return;
  }
  pendingPromptId = id;
  if (scenario === "steer" || scenario === "steer-unsupported") {
    update({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Kiro thinking" },
    });
    return;
  }
  if (scenario === "cancel") {
    return;
  }
  if (scenario === "image") {
    const prompt = params.prompt as unknown[];
    const content = params.content as unknown[];
    const hasValidImage = (blocks: unknown[]) =>
      blocks.some(
        (block) =>
          block !== null &&
          typeof block === "object" &&
          (block as Record<string, unknown>).type === "image" &&
          (block as Record<string, unknown>).mimeType === "image/png" &&
          (block as Record<string, unknown>).data === "aW1hZ2U=",
      );
    const textContainsDataUrl = (blocks: unknown[]) =>
      blocks.some(
        (block) =>
          block !== null &&
          typeof block === "object" &&
          (block as Record<string, unknown>).type === "text" &&
          typeof (block as Record<string, unknown>).text === "string" &&
          ((block as Record<string, unknown>).text as string).includes(
            "data:image/",
          ),
      );
    if (
      !hasValidImage(prompt) ||
      hasValidImage(content) ||
      textContainsDataUrl(prompt) ||
      textContainsDataUrl(content)
    ) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "invalid image prompt" },
      });
      return;
    }
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Kiro received image" },
      messageId: "kiro-image-message-1",
    });
    finishPrompt();
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
    method: "_kiro.dev/metadata",
    params: {
      sessionId: "kiro-fixture-session",
      contextUsagePercentage: 3.6710002422332764,
      meteringUsage: [
        { value: 0.05413, unit: "credit", unitPlural: "credits" },
      ],
      turnDurationMs: 2077,
    },
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
