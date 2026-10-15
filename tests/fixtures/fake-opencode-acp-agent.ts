import { createInterface } from "node:readline";

/**
 * Speaks the `opencode acp` shapes recorded from OpenCode 1.19.0 and 2.0.29:
 * config options instead of ACP modes, a per-model `effort` option, camelCase
 * prompt usage, `once`/`always`/`reject` permission option ids, and
 * `-32000 Authentication required` for a provider without credentials.
 *
 * argv: <scenario> [v1|v2]
 */
const scenario = process.argv[2] ?? "standard";
const line = process.argv[3] === "v2" ? "v2" : "v1";
const SESSION_ID = "ses_fixture0000000000000001";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let pendingPromptId: unknown;
let pendingPermissionId: string | null = null;
let currentModel = "opencode/big-pickle";
let currentMode = "build";
let currentEffort = "default";
let sessionMcpServers: unknown[] = [];
const configCalls: string[] = [];

const MODEL_EFFORTS: Record<string, string[]> = {
  "opencode/big-pickle": [],
  "opencode/cat-jam-free": ["low", "medium", "high", "xhigh", "max"],
  "vercel/zai/glm-5.3": ["high"],
};

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id: unknown, value: unknown) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id: unknown, code: number, message: string) {
  send({ jsonrpc: "2.0", id, error: { code, message, data: {} } });
}

function update(value: Record<string, unknown>) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId: SESSION_ID, update: value },
  });
}

/**
 * Like OpenCode, primary agents defined in the inline config become session
 * modes. `no-custom-agents` stands for a build that ignores them.
 */
function inlineAgentModes(): string[] {
  if (scenario === "no-custom-agents") return [];
  try {
    const content = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? "{}") as {
      agent?: Record<string, { mode?: string }>;
    };
    return Object.entries(content.agent ?? {})
      .filter(([name, agent]) => agent?.mode === "primary" && name !== "build" && name !== "plan")
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function configOptions() {
  const efforts = MODEL_EFFORTS[currentModel] ?? [];
  return [
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: currentModel,
      options: Object.keys(MODEL_EFFORTS).map((value) => ({
        value,
        name: value,
      })),
    },
    ...(efforts.length > 0
      ? [
          {
            id: "effort",
            name: "Effort",
            description: "Available effort levels for this model",
            category: "thought_level",
            type: "select",
            currentValue: currentEffort,
            options: [...efforts, "default"].map((value) => ({
              value,
              name: value,
            })),
          },
        ]
      : []),
    {
      id: "mode",
      name: "Session Mode",
      category: "mode",
      type: "select",
      currentValue: currentMode,
      options: ["build", "plan", ...inlineAgentModes()].map((value) => ({
        value,
        name: value,
      })),
    },
  ];
}

function finishPrompt(stopReason = "end_turn") {
  result(pendingPromptId, {
    stopReason,
    usage: {
      inputTokens: 21,
      outputTokens: 13,
      totalTokens: 42,
      thoughtTokens: 5,
      cachedReadTokens: 8,
    },
    _meta: {},
  });
  pendingPromptId = undefined;
  pendingPermissionId = null;
}

function requestPermission(toolCall: Record<string, unknown>) {
  pendingPermissionId = `permission-${toolCall.toolCallId as string}`;
  send({
    jsonrpc: "2.0",
    id: pendingPermissionId,
    method: "session/request_permission",
    params: {
      sessionId: SESSION_ID,
      toolCall,
      options: [
        { optionId: "once", kind: "allow_once", name: "Allow once" },
        { optionId: "always", kind: "allow_always", name: "Always allow" },
        { optionId: "reject", kind: "reject_once", name: "Reject" },
      ],
    },
  });
}

input.on("line", (raw) => {
  const message = JSON.parse(raw) as Record<string, unknown>;
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id;
  const params = message.params as Record<string, unknown> | undefined;

  if (!method && pendingPermissionId && id === pendingPermissionId) {
    const response = message.result as Record<string, unknown> | undefined;
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_permission",
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
        mcpCapabilities: { http: true, sse: line === "v1" },
        promptCapabilities: { embeddedContext: true, image: true },
        sessionCapabilities: { close: {}, fork: {}, list: {}, resume: {} },
        ...(line === "v2"
          ? { _meta: { "opencode/child-session-updates": true } }
          : {}),
      },
      authMethods: [
        {
          description: "Run `opencode auth login` in the terminal",
          name: "Login with opencode",
          id: "opencode-login",
        },
      ],
      agentInfo: {
        name: "OpenCode",
        version: line === "v2" ? "2.0.29" : "1.19.0",
      },
    });
    return;
  }
  if (method === "session/new") {
    sessionMcpServers = Array.isArray(params?.mcpServers)
      ? params.mcpServers
      : [];
    currentMode = scenario === "plan-default" ? "plan" : "build";
    result(id, { sessionId: SESSION_ID, configOptions: configOptions() });
    return;
  }
  if (method === "session/load") {
    // ACP v1 replays the stored conversation before answering.
    update({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text: "earlier prompt" },
    });
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_replayed",
      content: { type: "text", text: "replayed answer" },
    });
    result(id, { configOptions: configOptions() });
    return;
  }
  if (method === "session/set_config_option") {
    const configId = String(params?.configId ?? "");
    const value = String(params?.value ?? "");
    configCalls.push(`${configId}=${value}`);
    if (configId === "model") {
      currentModel = value;
      currentEffort = "default";
    } else if (configId === "mode") {
      currentMode = value;
    } else if (configId === "effort") {
      if (!(MODEL_EFFORTS[currentModel] ?? []).includes(value)) {
        error(id, -32602, `Invalid params: effort not found: ${value}`);
        return;
      }
      currentEffort = value;
    }
    update({ sessionUpdate: "config_option_update", configOptions: configOptions() });
    result(id, { configOptions: configOptions() });
    return;
  }
  if (method === "session/cancel") {
    if (pendingPromptId !== undefined) {
      result(pendingPromptId, { stopReason: "cancelled", _meta: {} });
      pendingPromptId = undefined;
    }
    return;
  }
  if (method !== "session/prompt") {
    if (id !== undefined) {
      error(id, -32601, `Method not found: ${method}`);
    }
    return;
  }

  pendingPromptId = id;
  if (scenario === "auth-required") {
    error(id, -32000, "Authentication required: provider authentication required");
    pendingPromptId = undefined;
    return;
  }
  if (
    scenario === "echo-session" ||
    scenario === "plan-default" ||
    scenario === "no-custom-agents"
  ) {
    update({
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_echo",
      content: {
        type: "text",
        text: `echo-session:${JSON.stringify({
          mcpServers: sessionMcpServers,
          configCalls,
          model: currentModel,
          effort: currentEffort,
          mode: currentMode,
          configContent: process.env.OPENCODE_CONFIG_CONTENT ?? null,
        })}`,
      },
    });
    finishPrompt();
    return;
  }
  if (scenario === "permission") {
    update({
      sessionUpdate: "tool_call",
      toolCallId: "call_shell",
      title: "bash",
      kind: "execute",
      status: "pending",
      rawInput: {},
    });
    requestPermission({
      toolCallId: "call_shell",
      title: "echo hi > probe.txt",
      kind: "execute",
      status: "pending",
      rawInput: { command: "echo hi > probe.txt" },
    });
    return;
  }
  if (scenario === "never-auto-approved") {
    requestPermission({
      toolCallId: "call_respond",
      title: "stave-local-mcp_stave_respond_user_input",
      kind: "other",
      status: "pending",
      rawInput: { requestId: "fixture" },
    });
    return;
  }
  if (scenario === "stave-mcp-permission") {
    requestPermission({
      toolCallId: "call_info",
      title: "stave-local-mcp_stave_get_workspace_information",
      kind: "other",
      status: "pending",
      rawInput: {},
    });
    return;
  }
  if (scenario === "cancel") {
    update({
      sessionUpdate: "agent_thought_chunk",
      messageId: "msg_cancel:reasoning:0",
      content: { type: "text", text: "Counting" },
    });
    return;
  }

  update({
    sessionUpdate: "available_commands_update",
    availableCommands: [{ name: "init", description: "guided AGENTS.md setup" }],
  });
  update({
    sessionUpdate: "agent_thought_chunk",
    messageId: "msg_standard:reasoning:0",
    content: { type: "text", text: "OpenCode thinking" },
  });
  update({
    sessionUpdate: "tool_call",
    toolCallId: "call_read",
    title: "read",
    kind: "read",
    status: "pending",
    locations: [],
    rawInput: {},
  });
  update({
    sessionUpdate: "tool_call_update",
    toolCallId: "call_read",
    status: "completed",
    kind: "read",
    title: "README.md",
    rawInput: { path: "README.md" },
    content: [{ type: "content", content: { type: "text", text: "fixture file" } }],
  });
  update({
    sessionUpdate: "plan",
    entries: [{ content: "Answer the prompt", priority: "medium", status: "completed" }],
  });
  update({
    sessionUpdate: "agent_message_chunk",
    messageId: "msg_standard",
    content: { type: "text", text: `OpenCode response:${currentModel}` },
  });
  update({
    sessionUpdate: "usage_update",
    used: 7794,
    size: 200000,
    cost: { amount: 0, currency: "USD" },
  });
  finishPrompt();
});
