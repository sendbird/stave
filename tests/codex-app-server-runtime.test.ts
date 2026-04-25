import { describe, expect, test } from "bun:test";
import {
  createCodexAppServerElicitationPauseController,
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  resolveCodexChatgptAuthTokensRefreshResponse,
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
