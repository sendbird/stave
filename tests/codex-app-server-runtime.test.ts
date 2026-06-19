import { describe, expect, test } from "bun:test";
import {
  buildSandboxPolicy,
  createCodexAppServerElicitationPauseController,
  formatCodexGoal,
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  parseCodexGoalSlashCommand,
  resolveCodexChatgptAuthTokensRefreshResponse,
  runCodexGoalSlashCommand,
  summarizeCodexAppServerDebugMessage,
  toCodexConfigLayerDisplayValue,
} from "../electron/providers/codex-app-server-runtime";

function encodeJwtPayload(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

describe("Codex /goal slash command helpers", () => {
  test("parses goal view, clear, pause, resume, and set commands", () => {
    expect(parseCodexGoalSlashCommand("/goal")).toEqual({ kind: "get" });
    expect(parseCodexGoalSlashCommand(" /goal clear ")).toEqual({
      kind: "clear",
    });
    expect(parseCodexGoalSlashCommand("/goal pause")).toEqual({
      kind: "status",
      status: "paused",
    });
    expect(parseCodexGoalSlashCommand("/goal resume")).toEqual({
      kind: "status",
      status: "active",
    });
    expect(
      parseCodexGoalSlashCommand(
        "/goal Finish the migration and keep tests green",
      ),
    ).toEqual({
      kind: "set",
      objective: "Finish the migration and keep tests green",
    });
    expect(parseCodexGoalSlashCommand("/goals")).toBeNull();
  });

  test("formats Codex goal state for the transcript", () => {
    expect(
      formatCodexGoal({
        threadId: "thread-1",
        objective: "Finish the migration",
        status: "budgetLimited",
        tokenBudget: 10_000,
        tokensUsed: 2500,
        timeUsedSeconds: 125,
        createdAt: 0,
        updatedAt: 0,
      }),
    ).toBe(
      [
        "Codex goal: Finish the migration",
        "Status: budget limited",
        "Usage: 2500 / 10000 tokens, 2m 5s",
      ].join("\n"),
    );
  });

  test("sets a Codex thread goal through App Server", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const events = await runCodexGoalSlashCommand({
      threadId: "thread-1",
      input: "/goal Finish the migration",
      client: {
        async request(method, params) {
          calls.push({ method, params });
          return {
            goal: {
              threadId: "thread-1",
              objective: "Finish the migration",
              status: "active",
              tokenBudget: null,
              tokensUsed: 0,
              timeUsedSeconds: 0,
              createdAt: 0,
              updatedAt: 0,
            },
          };
        },
      },
    });

    expect(calls).toEqual([
      {
        method: "thread/goal/set",
        params: {
          threadId: "thread-1",
          objective: "Finish the migration",
          status: "active",
        },
      },
    ]);
    expect(events).toEqual([
      {
        type: "goal_status",
        providerId: "codex",
        goal: {
          providerId: "codex",
          nativeSessionId: "thread-1",
          objective: "Finish the migration",
          status: "active",
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 0,
          updatedAt: 0,
        },
      },
      {
        type: "text",
        text: [
          "Set Codex goal.",
          "",
          "Codex goal: Finish the migration",
          "Status: active",
          "Usage: 0 tokens, 0s",
        ].join("\n"),
      },
      { type: "done" },
    ]);
  });

  test("does not pause when no Codex thread goal exists", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const events = await runCodexGoalSlashCommand({
      threadId: "thread-1",
      input: "/goal pause",
      client: {
        async request(method, params) {
          calls.push({ method, params });
          return { goal: null };
        },
      },
    });

    expect(calls).toEqual([
      {
        method: "thread/goal/get",
        params: { threadId: "thread-1" },
      },
    ]);
    expect(events).toEqual([
      {
        type: "goal_status",
        providerId: "codex",
        goal: null,
      },
      {
        type: "text",
        text: "No Codex goal is set for this thread.",
      },
      { type: "done" },
    ]);
  });
});

describe("mapCodexElicitationToUserInput", () => {
  test("maps form-mode elicitation schema into shared user-input questions", () => {
    const mapped = mapCodexElicitationToUserInput({
      message: "Pick the current workspace and confirm write access.",
      requestedSchema: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
            title: "Workspace",
            oneOf: [
              { const: "ws-1", title: "Main workspace" },
              { const: "ws-2", title: "Review workspace" },
            ],
            default: "ws-1",
          },
          confirm: {
            type: "boolean",
            description: "Allow the tool to continue",
            default: true,
          },
          retries: {
            type: "integer",
            description: "Retry count",
            default: 2,
          },
        },
        required: ["workspaceId", "confirm"],
      },
    });

    expect(mapped?.mode).toBe("form");
    expect(mapped?.questions).toEqual([
      {
        key: "workspaceId",
        header: "Pick the current workspace and confirm write access.",
        question: "Provide Workspace.",
        inputType: "text",
        options: [
          { label: "Main workspace", description: "Provide Workspace." },
          { label: "Review workspace", description: "Provide Workspace." },
        ],
        allowCustom: false,
        required: true,
        defaultValue: "Main workspace",
      },
      {
        key: "confirm",
        header: "Pick the current workspace and confirm write access.",
        question: "Allow the tool to continue",
        inputType: "boolean",
        options: [
          { label: "Yes", description: "true" },
          { label: "No", description: "false" },
        ],
        allowCustom: false,
        required: true,
        defaultValue: "Yes",
      },
      {
        key: "retries",
        header: "Pick the current workspace and confirm write access.",
        question: "Retry count",
        inputType: "integer",
        options: [],
        allowCustom: true,
        required: false,
        placeholder: "retries",
        defaultValue: "2",
      },
    ]);
  });

  test("maps url-mode elicitation into a notice card", () => {
    const mapped = mapCodexElicitationToUserInput({
      mode: "url",
      message: "Authorize the integration in your browser.",
      url: "https://example.com/connect",
      elicitationId: "elicitation-1",
    });

    expect(mapped).toEqual({
      mode: "url",
      questions: [
        {
          key: "__elicitation_url__",
          header: "MCP URL Elicitation",
          question: "Authorize the integration in your browser.",
          inputType: "url_notice",
          options: [],
          allowCustom: false,
          required: false,
          linkUrl: "https://example.com/connect",
        },
      ],
      fields: [],
    });
  });

  test("maps MCP tool-call elicitation into an approval card", () => {
    const mapped = mapCodexElicitationToApproval({
      mode: "form",
      message:
        'Allow the stave-local MCP server to run tool "stave_list_projects"?',
      requestedSchema: {
        type: "object",
        properties: {},
      },
      _meta: {
        codex_approval_kind: "mcp_tool_call",
        tool_description:
          "List projects already registered in the local Stave desktop app.",
      },
    });

    expect(mapped).toEqual({
      toolName: "stave_list_projects",
      description:
        "List projects already registered in the local Stave desktop app.",
    });
  });

  test("keeps generic empty-form elicitation as submit-or-decline user input", () => {
    const mapped = mapCodexElicitationToUserInput({
      mode: "form",
      message: "Confirm the action.",
      requestedSchema: {
        type: "object",
        properties: {},
      },
    });

    expect(mapped).toEqual({
      mode: "form",
      questions: [
        {
          key: "__elicitation_accept__",
          header: "Confirm the action.",
          question:
            "Submit to allow this MCP request, or decline to cancel it.",
          inputType: "text",
          options: [],
          allowCustom: false,
          required: false,
        },
      ],
      fields: [],
    });
  });
});

describe("buildSandboxPolicy", () => {
  test("uses permissionProfile for read-only restricted reads", () => {
    const policy = buildSandboxPolicy({
      cwd: "/tmp/project",
      runtimeOptions: {
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexAdditionalReadableRoots: ["/tmp/context"],
      },
      pathExists: (value) => value.startsWith("/tmp/"),
    });

    expect(policy).toEqual({
      type: "readOnly",
      permissionProfile: {
        type: "restricted",
        includePlatformDefaults: true,
        readableRoots: ["/tmp/project", "/tmp/context"],
      },
      networkAccess: false,
    });
    expect(policy).not.toHaveProperty("access");
  });

  test("uses permissionProfile for workspace-write restricted reads", () => {
    const policy = buildSandboxPolicy({
      cwd: "/tmp/project",
      runtimeOptions: {
        codexFileAccess: "workspace-write",
        codexNetworkAccess: true,
        codexAdditionalReadableRoots: ["/tmp/context"],
      },
      pathExists: (value) => value.startsWith("/tmp/"),
    });

    expect(policy).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/tmp/project"],
      permissionProfile: {
        type: "restricted",
        includePlatformDefaults: true,
        readableRoots: ["/tmp/project", "/tmp/context"],
      },
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });
    expect(policy).not.toHaveProperty("readOnlyAccess");
  });
});

describe("summarizeCodexAppServerDebugMessage", () => {
  test("summarizes app-server error notifications", () => {
    const summary = summarizeCodexAppServerDebugMessage({
      jsonrpc: "2.0",
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        message: "Codex turn timed out waiting for completion.",
      },
    });

    expect(summary).toEqual({
      id: undefined,
      method: "error",
      threadId: "thread-1",
      turnId: "turn-1",
      status: undefined,
      errorMessage: "Codex turn timed out waiting for completion.",
    });
  });

  test("summarizes failed turn completions", () => {
    const summary = summarizeCodexAppServerDebugMessage({
      jsonrpc: "2.0",
      method: "turn/completed",
      params: {
        threadId: "thread-2",
        turn: {
          id: "turn-2",
          status: "failed",
          error: {
            message: "Codex turn timed out waiting for completion.",
          },
        },
      },
    });

    expect(summary).toEqual({
      id: undefined,
      method: "turn/completed",
      threadId: "thread-2",
      turnId: "turn-2",
      status: "failed",
      errorMessage: "Codex turn timed out waiting for completion.",
    });
  });
});

describe("toCodexConfigLayerDisplayValue", () => {
  test("prefers readable object fields over generic object stringification", () => {
    expect(
      toCodexConfigLayerDisplayValue({
        type: "file",
        path: "/tmp/codex/config.toml",
      }),
    ).toBe("file:/tmp/codex/config.toml");
  });

  test("joins array values for layered labels", () => {
    expect(
      toCodexConfigLayerDisplayValue([
        "workspace",
        { type: "file", path: "/tmp/codex/config.toml" },
      ]),
    ).toBe("workspace / file:/tmp/codex/config.toml");
  });
});

describe("createCodexAppServerElicitationPauseController", () => {
  test("increments and decrements timeout pause state for a resolved request", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const controller = createCodexAppServerElicitationPauseController({
      client: {
        request: async (method, params) => {
          calls.push({ method, params });
          return {
            count: method === "thread/increment_elicitation" ? 1 : 0,
            paused: true,
          };
        },
      },
      threadId: "thread-1",
    });

    await controller.begin("request-1");
    await controller.end("request-1");

    expect(calls).toEqual([
      {
        method: "thread/increment_elicitation",
        params: { threadId: "thread-1" },
      },
      {
        method: "thread/decrement_elicitation",
        params: { threadId: "thread-1" },
      },
    ]);
  });

  test("serializes resume behind an in-flight pause request", async () => {
    const calls: string[] = [];
    let releasePause: (() => void) | null = null;
    const pauseStarted = new Promise<void>((resolve) => {
      releasePause = resolve;
    });
    const controller = createCodexAppServerElicitationPauseController({
      client: {
        request: async (method) => {
          calls.push(method);
          if (method === "thread/increment_elicitation") {
            await pauseStarted;
            return { count: 1, paused: true };
          }
          return { count: 0, paused: false };
        },
      },
      threadId: "thread-race",
    });

    const beginPromise = controller.begin("request-1");
    const endPromise = controller.end("request-1");

    await Promise.resolve();
    expect(calls).toEqual(["thread/increment_elicitation"]);

    releasePause?.();
    await beginPromise;
    await endPromise;

    expect(calls).toEqual([
      "thread/increment_elicitation",
      "thread/decrement_elicitation",
    ]);
  });

  test("deduplicates request ids and drains outstanding pauses on endAll", async () => {
    const calls: string[] = [];
    const controller = createCodexAppServerElicitationPauseController({
      client: {
        request: async (method) => {
          calls.push(method);
          return { count: 1, paused: true };
        },
      },
      threadId: "thread-2",
    });

    await controller.begin("request-1");
    await controller.begin("request-1");
    await controller.begin("request-2");
    await controller.endAll();

    expect(calls).toEqual([
      "thread/increment_elicitation",
      "thread/increment_elicitation",
      "thread/decrement_elicitation",
      "thread/decrement_elicitation",
    ]);
  });

  test("endAll is safe after individual end calls", async () => {
    const calls: string[] = [];
    const controller = createCodexAppServerElicitationPauseController({
      client: {
        request: async (method) => {
          calls.push(method);
          return { count: 1, paused: true };
        },
      },
      threadId: "thread-endall-safe",
    });

    await controller.begin("req-1");
    await controller.begin("req-2");
    await controller.end("req-1");
    // endAll should only decrement req-2 (req-1 already ended)
    await controller.endAll();

    expect(calls).toEqual([
      "thread/increment_elicitation",
      "thread/increment_elicitation",
      "thread/decrement_elicitation",
      "thread/decrement_elicitation",
    ]);
  });

  test("does not decrement if the pause request failed", async () => {
    const calls: string[] = [];
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const controller = createCodexAppServerElicitationPauseController({
        client: {
          request: async (method) => {
            calls.push(method);
            if (method === "thread/increment_elicitation") {
              throw new Error("method failed");
            }
            return { count: 0, paused: false };
          },
        },
        threadId: "thread-3",
      });

      await controller.begin("request-1");
      await controller.end("request-1");

      expect(calls).toEqual(["thread/increment_elicitation"]);
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("resolveCodexChatgptAuthTokensRefreshResponse", () => {
  test("maps a ChatGPT auth token into an external refresh response", () => {
    const authToken = encodeJwtPayload({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_123",
        chatgpt_plan_type: "plus",
      },
    });

    expect(
      resolveCodexChatgptAuthTokensRefreshResponse({
        authStatus: {
          authMethod: "chatgpt",
          authToken,
          requiresOpenaiAuth: true,
        },
        accountStatus: {
          account: {
            type: "chatgpt",
            planType: "business",
          },
          requiresOpenaiAuth: true,
        },
      }),
    ).toEqual({
      accessToken: authToken,
      chatgptAccountId: "acct_123",
      chatgptPlanType: "business",
    });
  });

  test("treats previous account hints as non-blocking metadata", () => {
    const authToken = encodeJwtPayload({
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_current",
        chatgpt_plan_type: "plus",
      },
    });

    expect(
      resolveCodexChatgptAuthTokensRefreshResponse({
        authStatus: {
          authMethod: "chatgptAuthTokens",
          authToken,
          requiresOpenaiAuth: true,
        },
        accountStatus: {
          account: {
            type: "chatgpt",
            planType: "plus",
          },
          requiresOpenaiAuth: true,
        },
        previousAccountId: "acct_other",
      }),
    ).toEqual({
      accessToken: authToken,
      chatgptAccountId: "acct_current",
      chatgptPlanType: "plus",
    });
  });
});
