import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { app } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type {
  StaveLocalMcpConfig,
  StaveLocalMcpManifest,
  StaveLocalMcpRequestLog,
  StaveLocalMcpRequestLogPage,
  StaveLocalMcpRequestLogQuery,
  StaveLocalMcpStatus,
} from "../../src/lib/local-mcp";
import {
  getStaveLocalMcpConfigPath,
  readStaveLocalMcpConfig,
  updateStaveLocalMcpConfig,
} from "./stave-mcp-config";
import { ensurePersistenceReady } from "./state";
import {
  addWorkspaceCustomField,
  addWorkspaceConfluencePage,
  addWorkspaceFigmaResource,
  addWorkspaceJiraIssue,
  addWorkspaceResource,
  addWorkspaceSlackThread,
  addWorkspaceTodo,
  appendWorkspaceNotes,
  clearWorkspaceNotes,
  createWorkspace,
  getWorkspaceInformation,
  getTaskStatus,
  listKnownProjects,
  removeWorkspaceCustomField,
  removeWorkspaceResource,
  removeWorkspaceTodo,
  replaceWorkspaceNotes,
  registerProject,
  respondApproval,
  respondUserInput,
  runTask,
  setWorkspaceCustomField,
  updateWorkspaceTodo,
} from "./stave-mcp-service";
import { registerBrowserTools } from "./browser/browser-tools";
import {
  getClaudeCodeMcpRegistrationStatus,
  syncClaudeCodeMcpRegistration,
} from "./claude-code-mcp";
import {
  getCodexMcpRegistrationStatus,
  syncCodexMcpRegistration,
} from "./codex-mcp";

let httpServer: Server | null = null;
let manifestPaths: string[] = [];
let currentManifest: StaveLocalMcpManifest | null = null;

const MAX_LOCAL_MCP_LOG_DEPTH = 6;
const MAX_LOCAL_MCP_LOG_STRING_LENGTH = 4000;
const MAX_LOCAL_MCP_LOG_ARRAY_ITEMS = 20;
const MAX_LOCAL_MCP_LOG_OBJECT_KEYS = 40;

function toStructuredResult<T>(value: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value,
  };
}

function resolveAuthToken(req: IncomingMessage, url: URL) {
  const authorization = req.headers.authorization?.trim() || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  const queryToken = url.searchParams.get("token")?.trim();
  return queryToken || "";
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function isSensitiveLogKey(key: string) {
  return /(authorization|token|secret|password|api[_-]?key)/i.test(key);
}

function truncateLogString(value: string) {
  if (value.length <= MAX_LOCAL_MCP_LOG_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_LOCAL_MCP_LOG_STRING_LENGTH)}…<truncated>`;
}

function sanitizeMcpLogValue(
  value: unknown,
  keyName?: string,
  depth = 0,
): unknown {
  if (keyName && isSensitiveLogKey(keyName)) {
    return "[redacted]";
  }

  if (
    value == null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    if (/^bearer\s+/i.test(value.trim())) {
      return "[redacted bearer token]";
    }
    return truncateLogString(value);
  }

  if (depth >= MAX_LOCAL_MCP_LOG_DEPTH) {
    return "[truncated depth]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOCAL_MCP_LOG_ARRAY_ITEMS)
      .map((item) => sanitizeMcpLogValue(item, undefined, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).slice(
      0,
      MAX_LOCAL_MCP_LOG_OBJECT_KEYS,
    );
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [
        key,
        sanitizeMcpLogValue(nestedValue, key, depth + 1),
      ]),
    );
  }

  return String(value);
}

function getRpcSummary(body: unknown) {
  const item = Array.isArray(body) ? body[0] : body;
  if (!item || typeof item !== "object") {
    return {
      rpcMethod: null,
      rpcRequestId: null,
      toolName: null,
    };
  }

  const record = item as Record<string, unknown>;
  const rpcMethod = typeof record.method === "string" ? record.method : null;
  const rpcRequestId =
    record.id == null
      ? null
      : typeof record.id === "string" || typeof record.id === "number"
        ? String(record.id)
        : truncateLogString(JSON.stringify(sanitizeMcpLogValue(record.id)));
  const params =
    record.params && typeof record.params === "object"
      ? (record.params as Record<string, unknown>)
      : null;
  const toolName =
    rpcMethod === "tools/call" && params && typeof params.name === "string"
      ? params.name
      : null;

  return {
    rpcMethod,
    rpcRequestId,
    toolName,
  };
}

async function persistLocalMcpRequestLog(args: {
  httpMethod: string;
  path: string;
  body?: unknown;
  statusCode: number;
  durationMs: number;
  errorMessage?: string | null;
  createdAt?: string;
}) {
  const { rpcMethod, rpcRequestId, toolName } = getRpcSummary(args.body);
  try {
    const store = await ensurePersistenceReady();
    store.createLocalMcpRequestLog({
      log: {
        id: randomUUID(),
        httpMethod: args.httpMethod,
        path: args.path,
        rpcMethod,
        rpcRequestId,
        toolName,
        statusCode: args.statusCode,
        durationMs: Math.max(0, Math.round(args.durationMs)),
        requestPayload:
          args.body === undefined ? null : sanitizeMcpLogValue(args.body),
        errorMessage: args.errorMessage ?? null,
        createdAt: args.createdAt,
      },
    });
  } catch (error) {
    console.warn("[stave-mcp] failed to persist local MCP request log", error);
  }
}

export async function listStaveMcpRequestLogs(
  args?: StaveLocalMcpRequestLogQuery,
): Promise<StaveLocalMcpRequestLogPage> {
  const store = await ensurePersistenceReady();
  return store.listLocalMcpRequestLogs(args);
}

export async function getStaveMcpRequestLog(args: {
  id: string;
  includePayload?: boolean;
}): Promise<StaveLocalMcpRequestLog | null> {
  const store = await ensurePersistenceReady();
  return store.getLocalMcpRequestLog(args);
}

export async function clearStaveMcpRequestLogs() {
  const store = await ensurePersistenceReady();
  return store.clearLocalMcpRequestLogs();
}

async function writeManifest(manifest: StaveLocalMcpManifest) {
  const userDataPath = app.getPath("userData");
  const paths = [
    path.join(userDataPath, "stave-local-mcp.json"),
    path.join(homedir(), ".stave", "local-mcp.json"),
  ];

  await Promise.all(
    paths.map(async (manifestPath) => {
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        { mode: 0o600 },
      );
    }),
  );

  manifestPaths = paths;
}

async function removeManifestFiles() {
  await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      try {
        await fs.unlink(manifestPath);
      } catch {
        // ignore missing files
      }
    }),
  );
  manifestPaths = [];
}

function createToolServer() {
  const server = new McpServer({
    name: "stave-local-mcp",
    version: app.getVersion(),
  });

  server.registerTool(
    "stave_list_projects",
    {
      description:
        "List projects already registered in the local Stave desktop app.",
    },
    async () =>
      toStructuredResult({
        projects: await listKnownProjects(),
      }),
  );

  server.registerTool(
    "stave_register_project",
    {
      description:
        "Register or refresh a local project in Stave and ensure its default workspace exists.",
      inputSchema: {
        projectPath: z
          .string()
          .min(1)
          .describe("Absolute or user-resolvable path to the repository root."),
        projectName: z
          .string()
          .optional()
          .describe("Optional display name override."),
        defaultBranch: z
          .string()
          .optional()
          .describe("Optional default branch override."),
      },
    },
    async ({ projectPath, projectName, defaultBranch }) =>
      toStructuredResult({
        project: await registerProject({
          projectPath,
          projectName,
          defaultBranch,
        }),
      }),
  );

  server.registerTool(
    "stave_create_workspace",
    {
      description:
        "Create a git-worktree-backed workspace inside a registered Stave project.",
      inputSchema: {
        projectPath: z.string().min(1).describe("Project root path."),
        name: z
          .string()
          .min(1)
          .describe(
            "Workspace display name. Also used to derive the branch name.",
          ),
        mode: z
          .enum(["branch", "clean"])
          .default("branch")
          .describe(
            "`branch` creates from the base branch. `clean` creates a new empty branch worktree.",
          ),
        fromBranch: z
          .string()
          .optional()
          .describe("Base branch to branch from when mode is `branch`."),
        fromBranchKind: z
          .enum(["local", "remote"])
          .optional()
          .describe(
            "Whether `fromBranch` should be treated as a local branch or a remote-tracking ref.",
          ),
        initCommand: z
          .string()
          .optional()
          .describe(
            "Optional post-create command to run inside the new workspace.",
          ),
        useRootNodeModulesSymlink: z
          .boolean()
          .optional()
          .describe(
            "Whether to link the root node_modules into the new workspace.",
          ),
      },
    },
    async (input) =>
      toStructuredResult({
        workspace: await createWorkspace(input),
      }),
  );

  server.registerTool(
    "stave_run_task",
    {
      description:
        "Create or continue a task in a workspace and start a provider turn for the given prompt.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Target workspace id."),
        prompt: z
          .string()
          .min(1)
          .describe("User prompt to run inside the workspace."),
        taskId: z.string().optional().describe("Existing task id to continue."),
        title: z
          .string()
          .optional()
          .describe("Optional title when creating a new task."),
        provider: z
          .enum(["claude-code", "codex", "stave"])
          .optional()
          .describe("Provider to run. Defaults to `stave`."),
        runtimeOptions: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional provider runtime overrides."),
      },
    },
    async ({ workspaceId, prompt, taskId, title, provider, runtimeOptions }) =>
      toStructuredResult({
        run: await runTask({
          workspaceId,
          prompt,
          taskId,
          title,
          provider,
          runtimeOptions: runtimeOptions as never,
        }),
      }),
  );

  server.registerTool(
    "stave_get_task",
    {
      description: "Read the current persisted task state from Stave.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        taskId: z.string().min(1).describe("Task id."),
      },
    },
    async ({ workspaceId, taskId }) =>
      toStructuredResult({
        task: await getTaskStatus({
          workspaceId,
          taskId,
        }),
      }),
  );

  server.registerTool(
    "stave_get_workspace_information",
    {
      description:
        "Read the current workspace information shown in Stave's Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
      },
    },
    async ({ workspaceId }) =>
      toStructuredResult({
        workspace: await getWorkspaceInformation({ workspaceId }),
      }),
  );

  server.registerTool(
    "stave_replace_workspace_notes",
    {
      description:
        "Replace the workspace notes block in Stave's Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        notes: z.string().describe("Complete notes text to store."),
      },
    },
    async ({ workspaceId, notes }) =>
      toStructuredResult({
        result: await replaceWorkspaceNotes({
          workspaceId,
          notes,
        }),
      }),
  );

  server.registerTool(
    "stave_append_workspace_notes",
    {
      description:
        "Append text to the workspace notes block in Stave's Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        text: z.string().min(1).describe("Text to append."),
      },
    },
    async ({ workspaceId, text }) =>
      toStructuredResult({
        result: await appendWorkspaceNotes({
          workspaceId,
          text,
        }),
      }),
  );

  server.registerTool(
    "stave_clear_workspace_notes",
    {
      description:
        "Clear the workspace notes block in Stave's Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
      },
    },
    async ({ workspaceId }) =>
      toStructuredResult({
        result: await clearWorkspaceNotes({
          workspaceId,
        }),
      }),
  );

  server.registerTool(
    "stave_add_workspace_todo",
    {
      description: "Add a todo item to the workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        text: z.string().min(1).describe("Todo text."),
      },
    },
    async ({ workspaceId, text }) =>
      toStructuredResult({
        result: await addWorkspaceTodo({
          workspaceId,
          text,
        }),
      }),
  );

  server.registerTool(
    "stave_update_workspace_todo",
    {
      description: "Update an existing workspace todo item.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        todoId: z.string().min(1).describe("Todo id."),
        text: z.string().optional().describe("Updated todo text."),
        completed: z.boolean().optional().describe("Optional completion flag."),
      },
    },
    async ({ workspaceId, todoId, text, completed }) =>
      toStructuredResult({
        result: await updateWorkspaceTodo({
          workspaceId,
          todoId,
          text,
          completed,
        }),
      }),
  );

  server.registerTool(
    "stave_remove_workspace_todo",
    {
      description: "Remove a workspace todo item.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        todoId: z.string().min(1).describe("Todo id."),
      },
    },
    async ({ workspaceId, todoId }) =>
      toStructuredResult({
        result: await removeWorkspaceTodo({
          workspaceId,
          todoId,
        }),
      }),
  );

  server.registerTool(
    "stave_add_workspace_resource",
    {
      description:
        "Add a Jira issue, PR, Confluence page, Figma resource, or Slack thread to the workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        kind: z
          .enum(["jira", "pull_request", "confluence", "figma", "slack"])
          .describe("Resource kind."),
        url: z.string().url().describe("Resource URL."),
        title: z.string().optional().describe("Optional display title."),
        issueKey: z
          .string()
          .optional()
          .describe("Jira issue key when kind=`jira`."),
        status: z
          .string()
          .optional()
          .describe("Optional status, used by Jira and PR links."),
        note: z.string().optional().describe("Optional note."),
        nodeId: z.string().optional().describe("Optional Figma node id."),
        channelName: z
          .string()
          .optional()
          .describe("Optional Slack channel label."),
        spaceKey: z
          .string()
          .optional()
          .describe("Optional Confluence space key."),
      },
    },
    async (input) =>
      toStructuredResult({
        result: await addWorkspaceResource(input),
      }),
  );

  server.registerTool(
    "stave_remove_workspace_resource",
    {
      description:
        "Remove a linked Jira issue, PR, Confluence page, Figma resource, or Slack thread from the workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        kind: z
          .enum(["jira", "pull_request", "confluence", "figma", "slack"])
          .describe("Resource kind."),
        itemId: z.string().min(1).describe("Stored resource id."),
      },
    },
    async ({ workspaceId, kind, itemId }) =>
      toStructuredResult({
        result: await removeWorkspaceResource({
          workspaceId,
          kind,
          itemId,
        }),
      }),
  );

  server.registerTool(
    "stave_add_workspace_custom_field",
    {
      description: "Add a custom field to the workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        fieldType: z
          .enum([
            "text",
            "textarea",
            "number",
            "boolean",
            "date",
            "url",
            "single_select",
          ])
          .describe("Custom field type."),
        label: z.string().min(1).describe("Field label."),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .optional()
          .describe("Optional initial field value."),
        options: z
          .array(z.string())
          .optional()
          .describe("Allowed options when fieldType=`single_select`."),
      },
    },
    async ({ workspaceId, fieldType, label, value, options }) =>
      toStructuredResult({
        result: await addWorkspaceCustomField({
          workspaceId,
          fieldType,
          label,
          value,
          options,
        }),
      }),
  );

  server.registerTool(
    "stave_set_workspace_custom_field",
    {
      description:
        "Update an existing workspace custom field value, label, or select options.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        fieldId: z.string().min(1).describe("Field id."),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .optional()
          .describe("Updated field value."),
        label: z.string().optional().describe("Updated field label."),
        options: z
          .array(z.string())
          .optional()
          .describe("Updated options when the field is a single select."),
      },
    },
    async ({ workspaceId, fieldId, value, label, options }) =>
      toStructuredResult({
        result: await setWorkspaceCustomField({
          workspaceId,
          fieldId,
          value,
          label,
          options,
        }),
      }),
  );

  server.registerTool(
    "stave_remove_workspace_custom_field",
    {
      description:
        "Remove a custom field from the workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        fieldId: z.string().min(1).describe("Field id."),
      },
    },
    async ({ workspaceId, fieldId }) =>
      toStructuredResult({
        result: await removeWorkspaceCustomField({
          workspaceId,
          fieldId,
        }),
      }),
  );

  server.registerTool(
    "stave_add_workspace_jira_issue",
    {
      description:
        "Register a Jira issue in the Stave Workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z.string().min(1).describe("Jira issue URL."),
        issueKey: z
          .string()
          .optional()
          .describe("Optional Jira issue key override."),
        title: z.string().optional().describe("Optional title override."),
        status: z.string().optional().describe("Optional status label."),
        note: z
          .string()
          .optional()
          .describe("Optional note stored with the link."),
      },
    },
    async ({ workspaceId, url, issueKey, title, status, note }) =>
      toStructuredResult(
        await addWorkspaceJiraIssue({
          workspaceId,
          url,
          issueKey,
          title,
          status,
          note,
        }),
      ),
  );

  server.registerTool(
    "stave_add_workspace_confluence_page",
    {
      description:
        "Register a Confluence page in the Stave Workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z.string().min(1).describe("Confluence page URL."),
        title: z.string().optional().describe("Optional title override."),
        spaceKey: z
          .string()
          .optional()
          .describe("Optional space key override."),
        note: z
          .string()
          .optional()
          .describe("Optional note stored with the link."),
      },
    },
    async ({ workspaceId, url, title, spaceKey, note }) =>
      toStructuredResult(
        await addWorkspaceConfluencePage({
          workspaceId,
          url,
          title,
          spaceKey,
          note,
        }),
      ),
  );

  server.registerTool(
    "stave_add_workspace_figma_resource",
    {
      description:
        "Register a Figma resource in the Stave Workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z.string().min(1).describe("Figma URL."),
        title: z.string().optional().describe("Optional title override."),
        nodeId: z.string().optional().describe("Optional node id override."),
        note: z
          .string()
          .optional()
          .describe("Optional note stored with the link."),
      },
    },
    async ({ workspaceId, url, title, nodeId, note }) =>
      toStructuredResult(
        await addWorkspaceFigmaResource({
          workspaceId,
          url,
          title,
          nodeId,
          note,
        }),
      ),
  );

  server.registerTool(
    "stave_add_workspace_slack_thread",
    {
      description:
        "Register a Slack thread in the Stave Workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z.string().min(1).describe("Slack thread URL."),
        channelName: z
          .string()
          .optional()
          .describe("Optional channel label override."),
        note: z
          .string()
          .optional()
          .describe("Optional note stored with the link."),
      },
    },
    async ({ workspaceId, url, channelName, note }) =>
      toStructuredResult(
        await addWorkspaceSlackThread({
          workspaceId,
          url,
          channelName,
          note,
        }),
      ),
  );

  server.registerTool(
    "stave_respond_approval",
    {
      description:
        "Respond to a pending approval request emitted by a running task.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        taskId: z.string().min(1).describe("Task id."),
        requestId: z.string().min(1).describe("Approval request id."),
        approved: z.boolean().describe("Whether to approve the request."),
      },
    },
    async ({ workspaceId, taskId, requestId, approved }) =>
      toStructuredResult({
        result: await respondApproval({
          workspaceId,
          taskId,
          requestId,
          approved,
        }),
      }),
  );

  server.registerTool(
    "stave_respond_user_input",
    {
      description:
        "Respond to a pending user-input request emitted by a running task.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        taskId: z.string().min(1).describe("Task id."),
        requestId: z.string().min(1).describe("User-input request id."),
        answers: z
          .record(z.string(), z.string())
          .optional()
          .describe("Answer map keyed by question id."),
        denied: z
          .boolean()
          .optional()
          .describe("Mark the request as denied instead of answered."),
      },
    },
    async ({ workspaceId, taskId, requestId, answers, denied }) =>
      toStructuredResult({
        result: await respondUserInput({
          workspaceId,
          taskId,
          requestId,
          answers,
          denied,
        }),
      }),
  );

  // ---- Browser tools (navigate, screenshot, DOM, evaluate, etc.) ----
  registerBrowserTools(server);

  return server;
}

export async function startStaveMcpServer() {
  if (httpServer) {
    return;
  }

  const config = await readStaveLocalMcpConfig();
  if (!config.enabled) {
    currentManifest = null;
    await removeManifestFiles();
    const claudeRegistration = await syncClaudeCodeMcpRegistration({
      autoRegister: config.claudeCodeAutoRegister,
      manifest: null,
    });
    if (claudeRegistration.error) {
      console.warn(
        "[stave-mcp] failed to remove Claude Code MCP registration",
        claudeRegistration.error,
      );
    }
    const codexRegistration = await syncCodexMcpRegistration({
      autoRegister: config.codexAutoRegister,
      manifest: null,
    });
    if (codexRegistration.error) {
      console.warn(
        "[stave-mcp] failed to remove Codex MCP registration",
        codexRegistration.error,
      );
    }
    console.log("[stave-mcp] local MCP server disabled in settings");
    return;
  }

  const host = "127.0.0.1";
  const requestedPort = config.port;
  const token = config.token || randomUUID();

  const nextServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const startedAt = Date.now();
    const createdAt = new Date().toISOString();

    if (url.pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        service: "stave-local-mcp",
        pid: process.pid,
        version: app.getVersion(),
      });
      return;
    }

    if (url.pathname !== "/mcp") {
      writeJson(res, 404, { ok: false, message: "Not found." });
      return;
    }

    if (resolveAuthToken(req, url) !== token) {
      writeJson(res, 401, { ok: false, message: "Unauthorized." });
      await persistLocalMcpRequestLog({
        httpMethod: req.method ?? "GET",
        path: url.pathname,
        statusCode: 401,
        errorMessage: "Unauthorized.",
        createdAt,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    try {
      const body = req.method === "POST" ? await readJsonBody(req) : undefined;
      const server = createToolServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await transport.handleRequest(req, res, body);
      await persistLocalMcpRequestLog({
        httpMethod: req.method ?? "GET",
        path: url.pathname,
        body,
        statusCode: res.statusCode || 200,
        createdAt,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      console.error("[stave-mcp] request failed", error);
      if (!res.headersSent) {
        writeJson(res, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal server error: ${String(error)}`,
          },
          id: null,
        });
      }
      await persistLocalMcpRequestLog({
        httpMethod: req.method ?? "GET",
        path: url.pathname,
        statusCode: res.statusCode || 500,
        errorMessage: error instanceof Error ? error.message : String(error),
        createdAt,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      nextServer.once("error", reject);
      nextServer.listen(
        {
          host,
          port: Number.isFinite(requestedPort) ? requestedPort : 0,
        },
        () => {
          nextServer.off("error", reject);
          resolve();
        },
      );
    });
  } catch (error) {
    nextServer.close();
    throw error;
  }

  httpServer = nextServer;

  const address = nextServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve local MCP server address.");
  }

  // In production the main process lives inside an ASAR archive
  // (app.getAppPath() → ".../app.asar").  The proxy script is unpacked to the
  // parallel ".asar.unpacked" directory so it can be executed by `node`.
  // In development app.getAppPath() already points to the project root where
  // out/main/stave-mcp-stdio-proxy.mjs is written by the build step.
  const appPath = app.getAppPath().endsWith(".asar")
    ? app.getAppPath().replace(/\.asar$/, ".asar.unpacked")
    : app.getAppPath();
  const stdioProxyScript = path.join(
    appPath,
    "out",
    "main",
    "stave-mcp-stdio-proxy.mjs",
  );

  const manifest: StaveLocalMcpManifest = {
    version: 1,
    name: "stave-local-mcp",
    mode: "local-only",
    url: `http://${host}:${address.port}/mcp`,
    healthUrl: `http://${host}:${address.port}/health`,
    token,
    host,
    port: address.port,
    pid: process.pid,
    appVersion: app.getVersion(),
    startedAt: new Date().toISOString(),
    stdioProxyScript,
  };

  await writeManifest(manifest);
  currentManifest = manifest;
  const claudeRegistration = await syncClaudeCodeMcpRegistration({
    autoRegister: config.claudeCodeAutoRegister,
    manifest,
  });
  if (claudeRegistration.error) {
    console.warn(
      "[stave-mcp] failed to sync Claude Code MCP registration",
      claudeRegistration.error,
    );
  }
  const codexRegistration = await syncCodexMcpRegistration({
    autoRegister: config.codexAutoRegister,
    manifest,
  });
  if (codexRegistration.error) {
    console.warn(
      "[stave-mcp] failed to sync Codex MCP registration",
      codexRegistration.error,
    );
  }
  console.log("[stave-mcp] listening", {
    url: manifest.url,
    manifestPaths,
  });
}

export async function stopStaveMcpServer() {
  const config = await readStaveLocalMcpConfig().catch(() => null);
  const currentServer = httpServer;
  httpServer = null;
  currentManifest = null;
  await removeManifestFiles();
  if (config) {
    const claudeRegistration = await syncClaudeCodeMcpRegistration({
      autoRegister: config.claudeCodeAutoRegister,
      manifest: null,
    });
    if (claudeRegistration.error) {
      console.warn(
        "[stave-mcp] failed to clear Claude Code MCP registration",
        claudeRegistration.error,
      );
    }
    const codexRegistration = await syncCodexMcpRegistration({
      autoRegister: config.codexAutoRegister,
      manifest: null,
    });
    if (codexRegistration.error) {
      console.warn(
        "[stave-mcp] failed to clear Codex MCP registration",
        codexRegistration.error,
      );
    }
  }
  if (!currentServer) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function restartStaveMcpServer() {
  await stopStaveMcpServer();
  await startStaveMcpServer();
}

export async function getStaveMcpServerStatus(): Promise<StaveLocalMcpStatus> {
  const config = await readStaveLocalMcpConfig();
  const claudeCodeRegistration = await getClaudeCodeMcpRegistrationStatus({
    autoRegister: config.claudeCodeAutoRegister,
    manifest: currentManifest,
  });
  const codexRegistration = await getCodexMcpRegistrationStatus({
    autoRegister: config.codexAutoRegister,
    manifest: currentManifest,
  });
  return {
    config,
    running: Boolean(httpServer && currentManifest),
    manifest: currentManifest,
    manifestPaths: [...manifestPaths],
    configPath: getStaveLocalMcpConfigPath(),
    claudeCodeRegistration,
    codexRegistration,
  };
}

export async function updateStaveMcpServerConfig(
  patch: Partial<StaveLocalMcpConfig>,
) {
  await updateStaveLocalMcpConfig(patch);
  await restartStaveMcpServer();
  return getStaveMcpServerStatus();
}

export async function rotateStaveMcpToken() {
  await updateStaveLocalMcpConfig({ token: randomUUID() });
  await restartStaveMcpServer();
  return getStaveMcpServerStatus();
}
