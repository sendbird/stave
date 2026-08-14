import { describe, expect, test } from "bun:test";
import {
  applyCodexRuntimeCapabilityDowngrades,
  buildCodexConfigOverrides,
  buildCodexMcpDisableConfigOverrides,
  buildCodexSecondaryServerRequestDenial,
  buildSandboxPolicy,
  buildCodexThreadResumeParams,
  buildCodexThreadStartParams,
  buildCodexTurnStartParams,
  buildCodexUnattendedAutomationMcpOverrides,
  CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
  createCodexAppServerElicitationPauseController,
  describeJsonRpcLinePrefix,
  formatCodexAppServerErrorMessage,
  formatCodexGoal,
  isCodexCompactSlashCommand,
  mapCodexElicitationToApproval,
  mapCodexElicitationToUserInput,
  mapCodexHookNotificationToBridgeEvent,
  parseCodexGoalSlashCommand,
  resolveCodexApprovalDecisionTimeoutMs,
  resolveCodexChatgptAuthTokensRefreshResponse,
  runCodexCompactSlashCommand,
  runCodexGoalSlashCommand,
  shouldAutoApproveStaveLocalMcpElicitation,
  summarizeCodexAppServerDebugMessage,
  toCodexConfigLayerDisplayValue,
} from "../electron/providers/codex-app-server-runtime";
import {
  parseCodexMcpRuntimeNotification,
  resolveCodexMcpOauthAuthorizationUrl,
} from "../electron/providers/codex-mcp-management";
import { resolveProviderRuntimeCapabilities } from "../src/lib/providers/runtime-capabilities";
import { buildCodexTurnSteerParams } from "../electron/providers/codex-app-server-steer";
import { mapCodexThreadForkResponse } from "../electron/providers/codex-thread-actions";
import {
  buildCodexDeveloperInstructions,
  buildCodexNativeBrowserTurnConfigOverrides,
  CODEX_STAVE_BROWSER_TOOLING_INSTRUCTIONS,
  isCodexNativeBrowserPluginEnabled,
  resolveCodexNativeBrowserPluginEnabled,
} from "../electron/providers/codex-runtime-config";
import { mapCodexHookCatalogGroups } from "../electron/providers/codex-snapshot-mappers";

function encodeJwtPayload(payload: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encoded}.signature`;
}

describe("Codex MCP runtime status", () => {
  test("accepts the App Server snake_case OAuth URL", () => {
    expect(
      resolveCodexMcpOauthAuthorizationUrl({
        authorization_url: "https://auth.example.test",
      }),
    ).toBe("https://auth.example.test");
  });

  test("maps startup failures that require OAuth again", () => {
    expect(
      parseCodexMcpRuntimeNotification({
        method: "mcpServer/startupStatus/updated",
        params: {
          name: "github",
          status: "failed",
          failureReason: "reauthenticationRequired",
          error: { message: "Token expired." },
        },
      }),
    ).toMatchObject({
      name: "github",
      connectionStatus: "needs-auth",
      failureReason: "reauthenticationRequired",
      lastError: "Token expired.",
    });
  });

  test("keeps a completed OAuth login in startup until the server is ready", () => {
    expect(
      parseCodexMcpRuntimeNotification({
        method: "mcpServer/oauthLogin/completed",
        params: { name: "github", success: true },
      }),
    ).toMatchObject({
      name: "github",
      connectionStatus: "starting",
    });
  });

  test("clears a stale authentication failure when startup recovers", () => {
    expect(
      parseCodexMcpRuntimeNotification({
        method: "mcpServer/startupStatus/updated",
        params: {
          name: "github",
          status: "ready",
          failureReason: null,
          error: null,
        },
      }),
    ).toEqual(
      expect.objectContaining({
        name: "github",
        connectionStatus: "connected",
        failureReason: undefined,
      }),
    );
  });
});

// Stave's allowed request subset, validated against
// `codex app-server generate-json-schema --experimental --out <dir>` for
// Codex CLI/App Server 0.145.0.
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

describe("Codex thread actions", () => {
  test("maps the forked thread id and copied native turn ids", () => {
    expect(
      mapCodexThreadForkResponse({
        thread: {
          id: "thread-fork",
          turns: [{ id: "turn-1" }, { id: "turn-2" }],
        },
      }),
    ).toEqual({
      ok: true,
      detail: "Forked Codex thread.",
      threadId: "thread-fork",
      turnIds: ["turn-1", "turn-2"],
    });
  });
});

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

  test("auto-approves only Stave Local MCP tool calls when explicitly enabled", () => {
    const approvalParams = {
      mode: "form",
      serverName: "stave-local",
      message:
        'Allow the stave-local MCP server to run tool "stave_lens_navigate"?',
      requestedSchema: {
        type: "object",
        properties: {},
      },
      _meta: {
        codex_approval_kind: "mcp_tool_call",
      },
    };

    expect(
      shouldAutoApproveStaveLocalMcpElicitation({
        enabled: true,
        params: approvalParams,
      }),
    ).toBe(true);
    expect(
      shouldAutoApproveStaveLocalMcpElicitation({
        enabled: false,
        params: approvalParams,
      }),
    ).toBe(false);
    expect(
      shouldAutoApproveStaveLocalMcpElicitation({
        enabled: true,
        params: {
          ...approvalParams,
          serverName: "external-tools",
        },
      }),
    ).toBe(false);
    expect(
      shouldAutoApproveStaveLocalMcpElicitation({
        enabled: true,
        params: {
          ...approvalParams,
          _meta: {},
        },
      }),
    ).toBe(false);
  });

  test("auto-approves always-allowed Stave tools even when the flag is off, matching Claude", () => {
    const buildParams = (toolName: string) => ({
      mode: "form",
      serverName: "stave-local",
      message: `Allow the stave-local MCP server to run tool "${toolName}"?`,
      requestedSchema: { type: "object", properties: {} },
      _meta: { codex_approval_kind: "mcp_tool_call", tool_name: toolName },
    });

    // Read-only / workspace-metadata tools: allowed in every posture, exactly
    // as `resolveClaudePermissionModeDecision` allows them in every mode.
    for (const toolName of [
      "stave_list_child_tasks",
      "stave_get_workspace_information",
      "stave_append_workspace_notes",
    ]) {
      expect(
        shouldAutoApproveStaveLocalMcpElicitation({
          enabled: false,
          params: buildParams(toolName),
        }),
      ).toBe(true);
      expect(
        shouldAutoApproveStaveLocalMcpElicitation({
          enabled: true,
          params: buildParams(toolName),
        }),
      ).toBe(true);
    }

    // Agent-starting / agent-stopping tools keep following the run's posture.
    for (const toolName of [
      "stave_delegate_task",
      "stave_stop_child_task",
      "stave_run_task",
    ]) {
      expect(
        shouldAutoApproveStaveLocalMcpElicitation({
          enabled: false,
          params: buildParams(toolName),
        }),
      ).toBe(false);
      expect(
        shouldAutoApproveStaveLocalMcpElicitation({
          enabled: true,
          params: buildParams(toolName),
        }),
      ).toBe(true);
    }
  });

  test("decodes namespaced tool names and falls back to prompting when undecodable", () => {
    const withToolName = (toolName: string) => ({
      mode: "form",
      serverName: "stave-local",
      message: "Allow this tool?",
      requestedSchema: { type: "object", properties: {} },
      _meta: { codex_approval_kind: "mcp_tool_call", tool_name: toolName },
    });

    for (const decorated of [
      "stave-local__stave_list_child_tasks",
      "stave-local.stave_list_child_tasks",
      "  STAVE_LIST_CHILD_TASKS  ",
    ]) {
      expect(
        shouldAutoApproveStaveLocalMcpElicitation({
          enabled: false,
          params: withToolName(decorated),
        }),
      ).toBe(true);
    }

    // No parseable tool name: Codex's inference yields "MCP tool", which is in
    // no allowlist, so the request must still reach the user.
    expect(
      shouldAutoApproveStaveLocalMcpElicitation({
        enabled: false,
        params: {
          mode: "form",
          serverName: "stave-local",
          message: "Allow this tool?",
          requestedSchema: { type: "object", properties: {} },
          _meta: { codex_approval_kind: "mcp_tool_call" },
        },
      }),
    ).toBe(false);
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
  test("exposes the native Chrome plugin only to explicit @web turns", () => {
    expect(
      buildCodexNativeBrowserTurnConfigOverrides({
        requested: false,
        userEnabled: true,
      }),
    ).toEqual({
      "plugins.chrome@openai-bundled.enabled": false,
    });
    expect(
      buildCodexNativeBrowserTurnConfigOverrides({
        requested: true,
        userEnabled: true,
      }),
    ).toEqual({ "plugins.chrome@openai-bundled.enabled": true });
    expect(
      buildCodexNativeBrowserTurnConfigOverrides({
        requested: true,
        userEnabled: false,
      }),
    ).toEqual({ "plugins.chrome@openai-bundled.enabled": false });
  });

  test("reads the user's native Chrome plugin setting from App Server inventory", () => {
    expect(
      isCodexNativeBrowserPluginEnabled({
        marketplaces: [
          {
            plugins: [
              {
                id: "chrome@openai-bundled",
                installed: true,
                enabled: true,
              },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isCodexNativeBrowserPluginEnabled({
        marketplaces: [
          {
            plugins: [
              {
                id: "chrome@openai-bundled",
                installed: true,
                enabled: false,
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  test("fails closed when Codex plugin inventory is unavailable", async () => {
    expect(
      await resolveCodexNativeBrowserPluginEnabled({
        requested: true,
        cwd: "/tmp/project",
        request: async () => {
          throw new Error("inventory unavailable");
        },
      }),
    ).toBe(false);
  });

  test("always disables the ChatGPT bundled browser plugin in thread config overrides", () => {
    const config = buildCodexConfigOverrides({});

    expect(config).toMatchObject({
      "plugins.browser@openai-bundled.enabled": false,
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
      "plugins.browser@openai-bundled.enabled": false,
      collaboration_mode_kind: "plan",
    });
  });

  test("forwards indexed search and writes approval through current config keys", () => {
    const config = buildCodexConfigOverrides({
      runtimeOptions: {
        codexWebSearch: "indexed",
        codexAppToolApprovalMode: "writes",
      },
    });

    expect(config).toMatchObject({
      web_search: "indexed",
      "apps._default.default_tools_approval_mode": "writes",
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
    expect(withBasePrompt).toContain(
      "Use the runtime's web-search tool for general web research",
    );
    expect(withBasePrompt).toContain("Do not use Lens for those tasks");
    expect(withBasePrompt).toContain("`@web` explicitly requests");
    expect(withBasePrompt).toContain("installed Chrome browser skill");
    expect(withBasePrompt).toContain("existing tabs and signed-in page state");
    expect(withBasePrompt).toContain("unattended automation");
    expect(withBasePrompt).toContain(
      "only when a change to the current project requires visual inspection",
    );
    expect(withBasePrompt).toContain("stave_lens_snapshot");
    expect(withBasePrompt).toContain("stave_lens_present_session");
    expect(withBasePrompt).toContain("hidden");
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
        "plugins.browser@openai-bundled.enabled": false,
      },
    });
  });

  test("builds an isolated read-only Advisor thread", () => {
    const params = buildCodexThreadStartParams({
      cwd: "/tmp/project",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      isolated: true,
      runtimeOptions: {
        model: "gpt-5.6-terra",
        codexNetworkAccess: false,
        codexWebSearch: "disabled",
      },
    });

    expectGeneratedThreadStartParamKeys(params);
    expect(params).toMatchObject({
      model: "gpt-5.6-terra",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      config: {
        network_access: false,
        web_search: "disabled",
      },
    });
    expect(params.developerInstructions).toContain("Do not call tools");
    expect(params.config).not.toHaveProperty("developer_instructions");
  });

  test("disables discovered MCP servers through a nested table, never quoted keys", () => {
    // Codex splits an override key on `.` and takes each segment verbatim, so
    // `mcp_servers."slack".enabled` addresses a server literally named
    // `"slack"` whose table has no transport — and Codex then refuses to load
    // the configuration at all.
    const config = buildCodexMcpDisableConfigOverrides([
      "slack",
      'quoted"name',
      "weird.name",
    ]);

    expect(config).toEqual({
      mcp_servers: {
        slack: { enabled: false },
        'quoted"name': { enabled: false },
        "weird.name": { enabled: false },
      },
    });
  });

  test("scopes the Stave MCP URL to one unattended automation", () => {
    expect(
      buildCodexUnattendedAutomationMcpOverrides({
        mcpUrl: "http://127.0.0.1:39517/mcp",
        authorizationToken: "authorization-placeholder",
      }),
    ).toEqual({
      "mcp_servers.stave-local.url":
        "http://127.0.0.1:39517/mcp?staveUnattendedAutomation=authorization-placeholder",
    });
  });

  test("merges fail-closed MCP overrides into an ephemeral thread", () => {
    const params = buildCodexThreadStartParams({
      cwd: "/tmp/project",
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      configOverrides: {
        mcp_servers: { slack: { enabled: false } },
      },
    });

    expectGeneratedThreadStartParamKeys(params);
    expect(params).toMatchObject({
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      config: {
        mcp_servers: { slack: { enabled: false } },
      },
    });
  });
});

describe("Codex H1 runtime capability guards", () => {
  test("downgrades unsupported indexed search and strips app approval modes", () => {
    const runtimeOptions = {
      codexWebSearch: "indexed" as const,
      codexAppToolApprovalMode: "writes" as const,
    };
    const legacy = applyCodexRuntimeCapabilityDowngrades({
      capabilities: resolveProviderRuntimeCapabilities({
        providerId: "codex",
        versionText: "0.141.0",
      }),
      runtimeOptions,
    });
    const current = applyCodexRuntimeCapabilityDowngrades({
      capabilities: resolveProviderRuntimeCapabilities({
        providerId: "codex",
        versionText: "0.145.0",
      }),
      runtimeOptions,
    });

    expect(legacy).toMatchObject({ codexWebSearch: "cached" });
    expect(legacy?.codexAppToolApprovalMode).toBeUndefined();
    expect(current).toMatchObject(runtimeOptions);
  });

  test("normalizes hook lifecycle without exposing hook commands or output", () => {
    const event = mapCodexHookNotificationToBridgeEvent({
      threadId: "thread-1",
      turnId: "turn-1",
      run: {
        id: "hook-1",
        eventName: "user_prompt_submit",
        handlerType: "command",
        sourcePath: "/tmp/hooks.json",
        status: "completed",
        command: "secret-command --token hidden",
        entries: [{ output: "sensitive hook output" }],
      },
    });

    expect(event).toEqual({
      type: "hook_activity",
      hookId: "hook-1",
      hookName: "command: /tmp/hooks.json",
      hookEvent: "user_prompt_submit",
      status: "completed",
    });
    expect(JSON.stringify(event)).not.toContain("secret-command");
    expect(JSON.stringify(event)).not.toContain("sensitive hook output");
    expect(
      mapCodexHookNotificationToBridgeEvent({ run: { status: "running" } }),
    ).toBeNull();
    expect(
      mapCodexHookNotificationToBridgeEvent({
        run: {
          id: "hook-2",
          eventName: "stop",
          handlerType: "command",
          status: "stopped",
        },
      }),
    ).toMatchObject({ status: "cancelled" });
  });

  test("maps a read-only hook inventory without returning commands", () => {
    const groups = mapCodexHookCatalogGroups(
      [
        {
          cwd: "/tmp/project",
          hooks: [
            {
              key: "prompt-audit",
              eventName: "user_prompt_submit",
              handlerType: "command",
              enabled: true,
              source: "project",
              sourcePath: "/tmp/project/hooks.json",
              trustStatus: "trusted",
              isManaged: false,
              statusMessage: null,
              command: "must-not-surface --token hidden",
            },
          ],
          errors: [],
          warnings: ["Review local hooks before running them."],
        },
      ],
      "/tmp/fallback",
    );

    expect(groups[0]?.hooks[0]).toEqual({
      key: "prompt-audit",
      eventName: "user_prompt_submit",
      handlerType: "command",
      enabled: true,
      source: "project",
      sourcePath: "/tmp/project/hooks.json",
      trustStatus: "trusted",
      isManaged: false,
      statusMessage: null,
    });
    expect(JSON.stringify(groups)).not.toContain("must-not-surface");
  });
});

describe("Codex secondary request denial", () => {
  test("declines every interactive server request without waiting for renderer input", () => {
    expect(
      buildCodexSecondaryServerRequestDenial(
        "item/commandExecution/requestApproval",
      ),
    ).toEqual({ decision: "decline" });
    expect(
      buildCodexSecondaryServerRequestDenial(
        "item/permissions/requestApproval",
      ),
    ).toEqual({ permissions: {}, scope: "turn" });
    expect(
      buildCodexSecondaryServerRequestDenial("item/tool/requestUserInput"),
    ).toEqual({ answers: {} });
    expect(
      buildCodexSecondaryServerRequestDenial("mcpServer/elicitation/request"),
    ).toEqual({ action: "decline" });
    expect(
      buildCodexSecondaryServerRequestDenial(
        "account/chatgptAuthTokens/refresh",
      ),
    ).toBeNull();
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
      clientMessageId: "client-steer-42",
    });

    expect(params).toEqual({
      threadId: "thread-1",
      expectedTurnId: "turn-42",
      clientUserMessageId: "client-steer-42",
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
    expect(
      formatCodexAppServerErrorMessage(
        JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message:
              "The following tools cannot be used with reasoning.effort 'minimal': image_gen, web_search.",
            param: "tools",
          },
          status: 400,
        }),
      ),
    ).toBe(
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

describe("describeJsonRpcLinePrefix", () => {
  test("extracts method and item metadata from a notification prefix", () => {
    const prefix =
      '{"jsonrpc":"2.0","method":"item/completed","params":{"threadId":"t1","item":{"id":"item_42","type":"commandExecution","aggregatedOutput":"...';

    expect(describeJsonRpcLinePrefix(prefix)).toEqual({
      method: "item/completed",
      itemType: "commandExecution",
      itemId: "item_42",
      responseId: null,
    });
  });

  test("extracts the envelope id from a response prefix", () => {
    const prefix = '{"jsonrpc":"2.0","id":7,"result":{"data":[{"name":"...';

    expect(describeJsonRpcLinePrefix(prefix)).toEqual({
      method: null,
      itemType: null,
      itemId: null,
      responseId: 7,
    });
  });

  test("does not mistake an item id for a response id on notifications", () => {
    const prefix =
      '{"jsonrpc":"2.0","method":"item/completed","params":{"item":{"id":"item_9","type":"mcpToolCall","result":"...';

    expect(describeJsonRpcLinePrefix(prefix).responseId).toBeNull();
  });

  test("returns nulls for an unrecognizable prefix", () => {
    expect(describeJsonRpcLinePrefix("garbage")).toEqual({
      method: null,
      itemType: null,
      itemId: null,
      responseId: null,
    });
  });
});

describe("resolveCodexApprovalDecisionTimeoutMs", () => {
  test("waits 45 minutes for interactive decisions by default", () => {
    expect(CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS).toBe(45 * 60 * 1000);
  });

  test("returns default when env var is unset", () => {
    expect(resolveCodexApprovalDecisionTimeoutMs({ envValue: undefined })).toBe(
      CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
  });

  test("respects a positive integer env value", () => {
    expect(resolveCodexApprovalDecisionTimeoutMs({ envValue: "60000" })).toBe(
      60000,
    );
  });

  test("falls back for non-numeric or non-positive env values", () => {
    expect(resolveCodexApprovalDecisionTimeoutMs({ envValue: "abc" })).toBe(
      CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
    expect(resolveCodexApprovalDecisionTimeoutMs({ envValue: "0" })).toBe(
      CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
    expect(resolveCodexApprovalDecisionTimeoutMs({ envValue: "-5" })).toBe(
      CODEX_APPROVAL_DECISION_TIMEOUT_DEFAULT_MS,
    );
  });

  test("respects an explicit override regardless of env value", () => {
    expect(
      resolveCodexApprovalDecisionTimeoutMs({
        envValue: "60000",
        override: 5000,
      }),
    ).toBe(5000);
  });
});
