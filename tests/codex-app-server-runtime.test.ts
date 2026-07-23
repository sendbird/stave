import { describe, expect, test } from "bun:test";
import {
  buildCodexConfigOverrides,
  buildSandboxPolicy,
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
  buildCodexTurnStartParams,
  buildCodexTurnSteerParams,
  createCodexAppServerElicitationPauseController,
  formatCodexAppServerErrorMessage,
  formatCodexGoal,
  isCodexCompactSlashCommand,
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  parseCodexGoalSlashCommand,
  resolveCodexChatgptAuthTokensRefreshResponse,
  runCodexCompactSlashCommand,
  runCodexGoalSlashCommand,
  summarizeCodexAppServerDebugMessage,
  toCodexConfigLayerDisplayValue,
} from "../electron/providers/codex-app-server-runtime";
import {
  buildCodexDeveloperInstructions,
  CODEX_STAVE_BROWSER_TOOLING_INSTRUCTIONS,
} from "../electron/providers/codex-runtime-config";

function encodeJwtPayload(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

// Derived from `codex app-server generate-json-schema --out <dir>` for
// Codex CLI/App Server 0.142.0.
const GENERATED_CODEX_APP_SERVER_V2_TURN_START_PARAM_KEYS: Set<string> =
  new Set([
    "approvalPolicy",
    "approvalsReviewer",
    "clientUserMessageId",
    "cwd",
    "effort",
    "input",
    "model",
    "outputSchema",
    "personality",
    "sandboxPolicy",
    "serviceTier",
    "summary",
    "threadId",
  ] as const);

const GENERATED_CODEX_APP_SERVER_V2_THREAD_START_PARAM_KEYS: Set<string> =
  new Set([
    "approvalPolicy",
    "approvalsReviewer",
    "baseInstructions",
    "config",
    "cwd",
    "developerInstructions",
    "ephemeral",
    "model",
    "modelProvider",
    "personality",
    "sandbox",
    "serviceName",
    "serviceTier",
    "sessionStartSource",
    "threadSource",
  ] as const);

const GENERATED_CODEX_APP_SERVER_V2_THREAD_RESUME_PARAM_KEYS: Set<string> =
  new Set([
    "approvalPolicy",
    "approvalsReviewer",
    "baseInstructions",
    "config",
    "cwd",
    "developerInstructions",
    "model",
    "modelProvider",
    "personality",
    "sandbox",
    "serviceTier",
    "threadId",
  ] as const);

function expectGeneratedTurnStartParamKeys(value: object) {
  const unexpectedKeys = Object.keys(value).filter(
    (key) => !GENERATED_CODEX_APP_SERVER_V2_TURN_START_PARAM_KEYS.has(key),
  );
  expect(unexpectedKeys).toEqual([]);
}

function expectGeneratedThreadStartParamKeys(value: object) {
  const unexpectedKeys = Object.keys(value).filter(
    (key) => !GENERATED_CODEX_APP_SERVER_V2_THREAD_START_PARAM_KEYS.has(key),
  );
  expect(unexpectedKeys).toEqual([]);
}

function expectGeneratedThreadResumeParamKeys(value: object) {
  const unexpectedKeys = Object.keys(value).filter(
    (key) => !GENERATED_CODEX_APP_SERVER_V2_THREAD_RESUME_PARAM_KEYS.has(key),
  );
  expect(unexpectedKeys).toEqual([]);
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

describe("Codex /compact slash command helpers", () => {
  test("matches only the /compact command", () => {
    expect(isCodexCompactSlashCommand("/compact")).toBe(true);
    expect(isCodexCompactSlashCommand("  /compact  ")).toBe(true);
    expect(isCodexCompactSlashCommand("/Compact")).toBe(true);
    expect(isCodexCompactSlashCommand("/compact now please")).toBe(true);
    expect(isCodexCompactSlashCommand("/compaction")).toBe(false);
    expect(isCodexCompactSlashCommand("compact")).toBe(false);
    expect(isCodexCompactSlashCommand("/goal compact")).toBe(false);
  });

  test("starts thread compaction through App Server", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const events = await runCodexCompactSlashCommand({
      threadId: "thread-1",
      input: "/compact",
      client: {
        async request(method, params) {
          calls.push({ method, params });
          return {};
        },
      },
    });

    expect(calls).toEqual([
      {
        method: "thread/compact/start",
        params: { threadId: "thread-1" },
      },
    ]);
    expect(events).toEqual([
      {
        type: "system",
        content: "Context compacted (manual).",
        compactBoundary: { trigger: "manual" },
      },
      {
        type: "text",
        text: "Compacted the Codex conversation context. You can continue this thread with the summarized history.",
      },
      { type: "done" },
    ]);
  });

  test("returns null for non-compact input", async () => {
    const events = await runCodexCompactSlashCommand({
      threadId: "thread-1",
      input: "Summarize this conversation",
      client: {
        async request() {
          throw new Error("should not be called");
        },
      },
    });
    expect(events).toBeNull();
  });

  test("surfaces a recoverable error when compaction fails", async () => {
    const events = await runCodexCompactSlashCommand({
      threadId: "thread-1",
      input: "/compact",
      client: {
        async request() {
          throw new Error("compaction unavailable");
        },
      },
    });
    expect(events).toEqual([
      {
        type: "error",
        message: expect.stringContaining("compaction unavailable"),
        recoverable: true,
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
  test("uses generated read-only sandbox policy shape", () => {
    const policy = buildSandboxPolicy({
      cwd: "/tmp/project",
      runtimeOptions: {
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
      },
    });

    expect(policy).toEqual({
      type: "readOnly",
      networkAccess: false,
    });
    expect(policy).not.toHaveProperty("permissionProfile");
  });

  test("uses generated workspace-write sandbox policy shape", () => {
    const policy = buildSandboxPolicy({
      cwd: "/tmp/project",
      runtimeOptions: {
        codexFileAccess: "workspace-write",
        codexNetworkAccess: true,
      },
    });

    expect(policy).toEqual({
      type: "workspaceWrite",
      writableRoots: ["/tmp/project"],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    });
    expect(policy).not.toHaveProperty("permissionProfile");
  });
});

describe("Codex bundled plugin and browser tooling overrides", () => {
  test("always disables the ChatGPT bundled browser plugin in thread config overrides", () => {
    const config = buildCodexConfigOverrides({});

    expect(config).toMatchObject({
      'plugins."browser@openai-bundled".enabled': false,
    });
  });

  test("keeps the plugin disable override alongside runtime option overrides", () => {
    const config = buildCodexConfigOverrides({
      runtimeOptions: {
        codexPlanMode: true,
        codexReasoningEffort: "high",
      },
    });

    expect(config).toMatchObject({
      'plugins."browser@openai-bundled".enabled': false,
      collaboration_mode_kind: "plan",
    });
  });

  test("always appends Stave browser tooling guidance to developer instructions", () => {
    const withoutBasePrompt = buildCodexDeveloperInstructions({});
    expect(withoutBasePrompt).toBe(CODEX_STAVE_BROWSER_TOOLING_INSTRUCTIONS);

    const withBasePrompt = buildCodexDeveloperInstructions({
      runtimeOptions: {
        claudeSystemPrompt: "Base system prompt.",
      },
    });
    expect(withBasePrompt).toBe(
      `Base system prompt.\n\n${CODEX_STAVE_BROWSER_TOOLING_INSTRUCTIONS}`,
    );
    expect(withBasePrompt).toContain("stave_lens_snapshot");
    expect(withBasePrompt).toContain("app-wide Stave approval dialog");
    expect(withBasePrompt).toContain("Never claim");
    expect(withBasePrompt).toContain("control-in-app-browser");
  });

  test("forwards the plugin disable override through thread/start config", () => {
    const params = buildCodexThreadStartParams({
      cwd: "/tmp/project",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
    });

    expectGeneratedThreadStartParamKeys(params);
    expect(params).toMatchObject({
      config: {
        'plugins."browser@openai-bundled".enabled': false,
      },
    });
  });
});

describe("Codex App Server plan-mode payloads", () => {
  test("forwards plan mode through generated thread config overrides", () => {
    const config = buildCodexConfigOverrides({
      runtimeOptions: {
        codexPlanMode: true,
        codexReasoningEffort: "high",
      },
    });

    expect(config).toMatchObject({
      collaboration_mode_kind: "plan",
      plan_mode_reasoning_effort: "high",
    });
  });

  test("normalizes minimal plan reasoning to low for app-server tool compatibility", () => {
    const config = buildCodexConfigOverrides({
      runtimeOptions: {
        codexPlanMode: true,
        codexReasoningEffort: "minimal",
      },
    });

    expect(config).toMatchObject({
      collaboration_mode_kind: "plan",
      plan_mode_reasoning_effort: "low",
    });
  });

  test("keeps thread/start payload within generated schema keys", () => {
    const params = buildCodexThreadStartParams({
      cwd: "/tmp/project",
      runtimeOptions: {
        model: "gpt-5.1",
        codexPlanMode: true,
        codexReasoningEffort: "high",
      },
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
    });

    expectGeneratedThreadStartParamKeys(params);
    expect(params).not.toHaveProperty("experimentalRawEvents");
    expect(params).not.toHaveProperty("persistExtendedHistory");
    expect(params).toMatchObject({
      cwd: "/tmp/project",
      model: "gpt-5.1",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      config: {
        collaboration_mode_kind: "plan",
        plan_mode_reasoning_effort: "high",
      },
    });
  });

  test("keeps thread/resume payload within generated schema keys", () => {
    const params = buildCodexThreadResumeParams({
      threadId: "thread-1",
      cwd: "/tmp/project",
      runtimeOptions: {
        model: "gpt-5.1",
        codexFastMode: true,
      },
    });

    expectGeneratedThreadResumeParamKeys(params);
    expect(params).not.toHaveProperty("experimentalRawEvents");
    expect(params).not.toHaveProperty("persistExtendedHistory");
    expect(params).toMatchObject({
      threadId: "thread-1",
      cwd: "/tmp/project",
      model: "gpt-5.1",
      config: {
        "features.fast_mode": true,
      },
    });
  });

  test("keeps plan turn/start payload within generated schema keys", () => {
    const params = buildCodexTurnStartParams({
      threadId: "thread-1",
      prompt: "Draft a plan.",
      cwd: "/tmp/project",
      runtimeOptions: {
        model: "gpt-5.1",
        codexPlanMode: true,
        codexApprovalPolicy: "on-request",
        codexFileAccess: "danger-full-access",
        codexNetworkAccess: false,
        codexReasoningEffort: "high",
        codexReasoningSummary: "concise",
      },
    });

    expectGeneratedTurnStartParamKeys(params);
    expect(params).not.toHaveProperty("collaborationMode");
    expect(params).toMatchObject({
      threadId: "thread-1",
      cwd: "/tmp/project",
      approvalPolicy: "never",
      model: "gpt-5.1",
      effort: "high",
      summary: "concise",
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });
  });

  test("builds a turn/steer payload wrapping text like turn/start input", () => {
    const params = buildCodexTurnSteerParams({
      threadId: "thread-1",
      expectedTurnId: "turn-42",
      text: "Also update the changelog.",
    });

    expect(params).toEqual({
      threadId: "thread-1",
      expectedTurnId: "turn-42",
      input: [
        {
          type: "text",
          text: "Also update the changelog.",
          text_elements: [],
        },
      ],
    });
  });

  test("uses native turn/start outputSchema for isolated review turns", () => {
    const outputSchema = {
      type: "object",
      properties: {
        findings: { type: "array" },
      },
    };
    const params = buildCodexTurnStartParams({
      threadId: "thread-review-1",
      prompt: "Review the diff.",
      cwd: "/tmp/project",
      runtimeOptions: {
        codexFileAccess: "read-only",
        codexNetworkAccess: false,
        codexApprovalPolicy: "never",
      },
      outputSchema,
    });

    expectGeneratedTurnStartParamKeys(params);
    expect(params).toMatchObject({
      threadId: "thread-review-1",
      approvalPolicy: "never",
      outputSchema,
      sandboxPolicy: {
        type: "readOnly",
        networkAccess: false,
      },
    });
  });

  test("normalizes minimal turn reasoning to low for app-server tool compatibility", () => {
    const params = buildCodexTurnStartParams({
      threadId: "thread-1",
      prompt: "Run a normal turn.",
      cwd: "/tmp/project",
      runtimeOptions: {
        codexReasoningEffort: "minimal",
        codexWebSearch: "cached",
      },
    });

    expectGeneratedTurnStartParamKeys(params);
    expect(params).toMatchObject({
      effort: "low",
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

  test("formats nested model API JSON errors", () => {
    expect(formatCodexAppServerErrorMessage(JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message:
          "The following tools cannot be used with reasoning.effort 'minimal': image_gen, web_search.",
        param: "tools",
      },
      status: 400,
    }))).toBe(
      "The following tools cannot be used with reasoning.effort 'minimal': image_gen, web_search. (param: tools, status: 400)",
    );
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
