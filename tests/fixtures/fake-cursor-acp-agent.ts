import { createInterface } from "node:readline";

const scenario = process.argv[2] ?? "standard";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let pendingPromptId: unknown;
let pendingServerRequestId: string | null = null;

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: unknown, value: unknown) {
  send({ jsonrpc: "2.0", id, result: value });
}

function update(value: Record<string, unknown>) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId: "cursor-fixture-session", update: value },
  });
}

function finishPrompt(stopReason = "end_turn") {
  result(pendingPromptId, {
    stopReason,
    usage: {
      total_tokens: 55,
      input_tokens: 34,
      output_tokens: 21,
      thought_tokens: 7,
      cached_read_tokens: 13,
      cached_write_tokens: 5,
    },
  });
  pendingPromptId = undefined;
  pendingServerRequestId = null;
}

const modes = {
  currentModeId: "agent",
  availableModes: [
    { id: "agent", name: "Agent" },
    { id: "plan", name: "Plan" },
    { id: "ask", name: "Ask" },
  ],
};
const configOptions = [
  {
    id: "model",
    name: "Model",
    type: "select",
    currentValue: "auto",
    options: [
      { value: "auto", name: "Auto" },
      { value: "fixture-model", name: "Fixture Model" },
    ],
  },
];

function createParameterizedConfig() {
  return [
    {
      id: "model",
      name: "Model",
      type: "select",
      currentValue: "auto",
      options: [
        { value: "auto", name: "Auto" },
        { value: "gpt-5.6-sol", name: "gpt-5.6-sol" },
        { value: "grok-4.6", name: "grok-4.6" },
      ],
    },
    {
      id: "effort",
      name: "Effort",
      type: "select",
      currentValue: "medium",
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
        { value: "xhigh", name: "X-High" },
        { value: "max", name: "Max" },
      ],
    },
    {
      id: "fast",
      name: "Fast",
      type: "select",
      currentValue: "false",
      options: [
        { value: "true", name: "On" },
        { value: "false", name: "Off" },
      ],
    },
  ];
}

const sessionConfig =
  scenario === "parameterized" ? createParameterizedConfig() : configOptions;
const appliedConfig: { configId: string; value: string }[] = [];
let initializeMeta: unknown;
let sessionMcpServers: unknown[] = [];

function promptTextFromParams(params: Record<string, unknown> | undefined) {
  const prompt = Array.isArray(params?.prompt) ? params.prompt : [];
  return prompt
    .flatMap((block) => {
      if (
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        return [(block as Record<string, unknown>).text as string];
      }
      return [];
    })
    .join("\n");
}

input.on("line", (line) => {
  const message = JSON.parse(line) as Record<string, unknown>;
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id;

  if (!method && pendingServerRequestId && id === pendingServerRequestId) {
    const response = message.result as Record<string, unknown> | undefined;
    update({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: `response:${JSON.stringify(response?.outcome ?? {})}`,
      },
    });
    finishPrompt();
    return;
  }

  if (method === "initialize") {
    const params = message.params as Record<string, unknown> | undefined;
    const clientCapabilities =
      params?.clientCapabilities &&
      typeof params.clientCapabilities === "object"
        ? (params.clientCapabilities as Record<string, unknown>)
        : {};
    initializeMeta = clientCapabilities._meta;
    result(id, {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        ...(scenario === "image" || scenario === "image-mixed"
          ? { promptCapabilities: { image: true } }
          : {}),
      },
      authMethods: [{ id: "cursor_login", name: "Cursor login" }],
    });
    return;
  }
  if (method === "authenticate") {
    result(id, {});
    return;
  }
  if (method === "session/new") {
    const params = message.params as Record<string, unknown> | undefined;
    sessionMcpServers = Array.isArray(params?.mcpServers)
      ? params.mcpServers
      : [];
    result(id, {
      sessionId: "cursor-fixture-session",
      modes,
      configOptions: sessionConfig,
    });
    return;
  }
  if (method === "session/load") {
    // ACP v1 requires session/load to replay the prior conversation as
    // session/update notifications before answering. Distinct copy so a
    // leaked replay cannot be mistaken for this turn's prompt response.
    update({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text: "Previous user prompt" },
    });
    update({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Previous thinking" },
    });
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Previous turn response" },
      messageId: "previous-message-1",
    });
    update({
      sessionUpdate: "tool_call",
      toolCallId: "previous-tool-1",
      title: "Edit previous file",
      status: "completed",
      rawInput: { path: "/tmp/previous.txt" },
      content: [
        {
          type: "content",
          content: { type: "text", text: "Previous tool output" },
        },
      ],
    });
    send({
      jsonrpc: "2.0",
      method: "cursor/task",
      params: {
        toolCallId: "previous-task-1",
        description: "Previous subagent work",
        prompt: "Explore previous",
        subagentType: "explore",
        agentId: "previous-agent-1",
      },
    });
    result(id, { modes, configOptions: sessionConfig });
    return;
  }
  if (method === "session/set_mode") {
    result(id, {});
    return;
  }
  if (method === "session/set_config_option") {
    const params = message.params as Record<string, unknown> | undefined;
    const configId =
      typeof params?.configId === "string" ? params.configId : "";
    const value = typeof params?.value === "string" ? params.value : "";
    appliedConfig.push({ configId, value });
    const option = sessionConfig.find((entry) => entry.id === configId);
    if (option) {
      option.currentValue = value;
    }
    result(
      id,
      scenario === "parameterized" ? { configOptions: sessionConfig } : {},
    );
    return;
  }
  if (method === "session/cancel") {
    finishPrompt("cancelled");
    return;
  }
  if (method !== "session/prompt") {
    return;
  }

  pendingPromptId = id;
  if (scenario === "echo-session") {
    const params = message.params as Record<string, unknown> | undefined;
    update({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: `echo-session:${JSON.stringify({
          mcpServers: sessionMcpServers,
          prompt: promptTextFromParams(params),
        })}`,
      },
      messageId: "echo-session-message-1",
    });
    finishPrompt();
    return;
  }
  if (scenario === "stave-mcp-permission") {
    pendingServerRequestId = "stave-mcp-permission-1";
    send({
      jsonrpc: "2.0",
      id: pendingServerRequestId,
      method: "session/request_permission",
      params: {
        sessionId: "cursor-fixture-session",
        toolCall: {
          toolCallId: "stave-mcp-permission",
          title: "stave_get_workspace_information",
          kind: "other",
          rawInput: { workspaceId: "worktree:fixture" },
        },
        options: [
          {
            optionId: "allow-once",
            name: "Allow once",
            kind: "allow_once",
          },
          {
            optionId: "reject-once",
            name: "Reject once",
            kind: "reject_once",
          },
        ],
      },
    });
    return;
  }
  if (scenario === "parameterized") {
    update({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: `parameterized:${JSON.stringify({
          initializeMeta,
          applied: appliedConfig,
          current: Object.fromEntries(
            sessionConfig.map((option) => [option.id, option.currentValue]),
          ),
        })}`,
      },
      messageId: "parameterized-message-1",
    });
    finishPrompt();
    return;
  }
  if (scenario === "image-unsupported") {
    const params = message.params as Record<string, unknown> | undefined;
    const prompt = Array.isArray(params?.prompt) ? params.prompt : [];
    const hasImageBlock = prompt.some(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "image",
    );
    const hasTextFallback = prompt.some(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string" &&
        ((block as Record<string, unknown>).text as string).includes(
          "data:image/png;base64,aW1hZ2U=",
        ),
    );
    if (hasImageBlock || !hasTextFallback) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "invalid image fallback" },
      });
      return;
    }
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Cursor received image fallback" },
      messageId: "image-fallback-message-1",
    });
    finishPrompt();
    return;
  }
  if (scenario === "image") {
    const params = message.params as Record<string, unknown> | undefined;
    const prompt = Array.isArray(params?.prompt) ? params.prompt : [];
    const text = prompt.find(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text",
    ) as Record<string, unknown> | undefined;
    const image = prompt.find(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "image",
    );
    const validImage =
      image &&
      typeof image === "object" &&
      (image as Record<string, unknown>).mimeType === "image/png" &&
      (image as Record<string, unknown>).data === "aW1hZ2U=";
    const textContainsDataUrl =
      typeof text?.text === "string" && text.text.includes("data:image/");
    if (!validImage || textContainsDataUrl) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "invalid image prompt" },
      });
      return;
    }
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Cursor received image" },
      messageId: "image-message-1",
    });
    finishPrompt();
    return;
  }
  if (scenario === "image-mixed") {
    const params = message.params as Record<string, unknown> | undefined;
    const prompt = Array.isArray(params?.prompt) ? params.prompt : [];
    const text = prompt.find(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text",
    ) as Record<string, unknown> | undefined;
    const imageCount = prompt.filter(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "image",
    ).length;
    const textValue = typeof text?.text === "string" ? text.text : "";
    if (
      imageCount !== 1 ||
      textValue.includes("data:image/png;base64,aW1hZ2U=") ||
      !textValue.includes("data:image/svg+xml;base64,PHN2Zy8+")
    ) {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "invalid mixed image prompt" },
      });
      return;
    }
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Cursor received mixed images" },
      messageId: "mixed-image-message-1",
    });
    finishPrompt();
    return;
  }
  if (scenario === "cancel") {
    return;
  }
  if (scenario === "permission") {
    pendingServerRequestId = "permission-1";
    send({
      jsonrpc: "2.0",
      id: pendingServerRequestId,
      method: "session/request_permission",
      params: {
        sessionId: "cursor-fixture-session",
        toolCall: {
          toolCallId: "tool-permission",
          title: "Run fixture",
          kind: "execute",
          rawInput: { command: "fixture" },
        },
        options: [
          {
            optionId: "allow-once",
            name: "Allow once",
            kind: "allow_once",
          },
          {
            optionId: "allow-always",
            name: "Always allow",
            kind: "allow_always",
          },
          {
            optionId: "reject-once",
            name: "Reject once",
            kind: "reject_once",
          },
        ],
      },
    });
    return;
  }
  if (scenario === "question") {
    pendingServerRequestId = "question-1";
    send({
      jsonrpc: "2.0",
      id: pendingServerRequestId,
      method: "cursor/ask_question",
      params: {
        toolCallId: "tool-question",
        title: "Choose mode",
        questions: [
          {
            id: "mode",
            prompt: "Which mode?",
            options: [
              { id: "agent", label: "Agent" },
              { id: "plan", label: "Plan" },
            ],
          },
        ],
      },
    });
    return;
  }
  if (scenario === "plan") {
    pendingServerRequestId = "plan-1";
    send({
      jsonrpc: "2.0",
      id: pendingServerRequestId,
      method: "cursor/create_plan",
      params: {
        toolCallId: "tool-plan",
        name: "Fixture plan",
        plan: "1. Inspect\n2. Change",
        todos: [
          { id: "one", content: "Inspect", status: "completed" },
          { id: "two", content: "Change", status: "pending" },
        ],
      },
    });
    return;
  }

  update({
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Thinking" },
  });
  update({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "Fixture response" },
    messageId: "message-1",
  });
  update({
    sessionUpdate: "tool_call",
    toolCallId: "tool-1",
    title: "Edit file",
    status: "in_progress",
    rawInput: { path: "/tmp/fixture.txt" },
  });
  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "tool-1",
    status: "completed",
    content: [
      {
        type: "diff",
        path: "/tmp/fixture.txt",
        oldText: "before",
        newText: "after",
      },
      {
        type: "content",
        content: { type: "text", text: "Updated fixture" },
      },
    ],
  });
  update({
    sessionUpdate: "plan",
    entries: [
      { content: "Inspect", priority: "high", status: "completed" },
      { content: "Change", priority: "medium", status: "in_progress" },
    ],
  });
  send({
    jsonrpc: "2.0",
    method: "cursor/update_todos",
    params: {
      toolCallId: "todo-1",
      todos: [{ id: "one", content: "Finish", status: "pending" }],
      merge: false,
    },
  });
  send({
    jsonrpc: "2.0",
    method: "cursor/task",
    params: {
      toolCallId: "task-1",
      description: "Explored fixture",
      prompt: "Explore",
      subagentType: "explore",
      agentId: "agent-1",
    },
  });
  update({
    sessionUpdate: "usage_update",
    used: 233,
    size: 2048,
    cost: { amount: 0.003, currency: "USD" },
  });
  finishPrompt();
});
