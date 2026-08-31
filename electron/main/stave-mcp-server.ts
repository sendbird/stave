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
  RoutineInformationResourceCreateInputSchema,
  RoutineUpsertInputSchema,
} from "../../src/lib/routines";
import { TaskHeartbeatUpsertInputSchema } from "../../src/lib/automation/task-supervisor";
import {
  WORKER_CONTEXT_MAX_CHARS,
  WORKER_TASK_MAX_CHARS,
} from "../../src/lib/providers/worker-mode";
import {
  getStaveLocalMcpConfigPath,
  readStaveLocalMcpConfig,
  updateStaveLocalMcpConfig,
} from "./stave-mcp-config";
import {
  createRoutineInformationResource,
  createRoutine,
  listRoutineInformationReferences,
  listRoutines,
  removeRoutine,
  runRoutineNow,
  setRoutineEnabled,
  updateRoutine,
} from "./routine-service";
import { RuntimeOptionsObjectSchema } from "./ipc/schemas";
import { getChildTaskCoordinator } from "./runs/child-task-coordinator-instance";
import {
  createTaskHeartbeat,
  getTaskHeartbeat,
  listTaskHeartbeats,
  pauseTaskHeartbeat,
  removeTaskHeartbeat,
  resumeTaskHeartbeat,
  updateTaskHeartbeat,
} from "./task-supervisor-service";
import { ensurePersistenceReady } from "./state";
import {
  addWorkspaceAmplifyLink,
  addWorkspaceCustomField,
  addWorkspaceConfluencePage,
  addWorkspaceCraneIssue,
  addWorkspaceFigmaResource,
  addWorkspaceJiraIssue,
  addWorkspaceResource,
  addWorkspaceSlackThread,
  addWorkspaceStorybookResource,
  addWorkspaceTodo,
  appendWorkspaceNotes,
  clearWorkspaceNotes,
  consultAdvisor,
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
  runAcpWorker,
  runTask,
  setWorkspaceCustomField,
  updateWorkspaceStorybookResourceAccess,
  updateWorkspaceTodo,
} from "./stave-mcp-service";
import { registerBrowserTools } from "./browser/browser-tools";
import {
  getClaudeCodeMcpRegistrationStatus,
  syncClaudeCodeMcpRegistration,
} from "./claude-code-mcp";
import { STAVE_UNATTENDED_AUTOMATION_QUERY_PARAM } from "./stave-local-mcp-manifest";
import { runWithUnattendedAutomationAuthorization } from "./browser/browser-security";
import {
  getCodexMcpRegistrationStatus,
  syncCodexMcpRegistration,
} from "./codex-mcp";
import { sanitizeMcpLogValue } from "./stave-mcp-log-sanitizer";
import {
  linkMartinProject,
  listMartinProjects,
  refreshMartinContext,
  unlinkMartinProject,
} from "./martin-sync/project-link";

let httpServer: Server | null = null;
let manifestPaths: string[] = [];
let currentManifest: StaveLocalMcpManifest | null = null;

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

function listenOnPort(server: Server, host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen({ host, port }, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

/**
 * Canonical manifest locations. Cleanup must not depend on the mutable
 * `manifestPaths`, which starts empty and is only populated by a successful
 * `writeManifest` — a disabled-at-startup run would otherwise leave a previous
 * launch's manifest (and its dead port) on disk for consumers to pick up.
 */
function getManifestCandidatePaths() {
  return [
    path.join(app.getPath("userData"), "stave-local-mcp.json"),
    path.join(homedir(), ".stave", "local-mcp.json"),
  ];
}

async function writeManifest(manifest: StaveLocalMcpManifest) {
  const paths = getManifestCandidatePaths();

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
  const paths = new Set([...manifestPaths, ...getManifestCandidatePaths()]);
  await Promise.all(
    Array.from(paths, async (manifestPath) => {
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
    "stave_martin_list_projects",
    {
      description:
        "Search Martin projects reachable through the paired Atelier connector.",
      inputSchema: {
        query: z
          .string()
          .max(200)
          .optional()
          .describe("Optional name or slug filter."),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ query, limit }) =>
      toStructuredResult({
        projects: await listMartinProjects({ query, limit }),
      }),
  );

  server.registerTool(
    "stave_martin_link_project",
    {
      description:
        "Link a Stave workspace to a Martin project and pull its context snapshot.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Target workspace id."),
        projectRef: z
          .string()
          .min(1)
          .describe("Martin project slug or id."),
      },
    },
    async ({ workspaceId, projectRef }) =>
      toStructuredResult(
        await linkMartinProject({ workspaceId, projectRef }),
      ),
  );

  server.registerTool(
    "stave_martin_unlink_project",
    {
      description: "Unlink a Stave workspace from its Martin project.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Target workspace id."),
      },
    },
    async ({ workspaceId }) =>
      toStructuredResult(await unlinkMartinProject({ workspaceId })),
  );

  server.registerTool(
    "stave_martin_get_context",
    {
      description:
        "Fetch the latest Martin project context bundle for a linked workspace and refresh the local snapshot file.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Target workspace id."),
      },
    },
    async ({ workspaceId }) =>
      toStructuredResult(await refreshMartinContext({ workspaceId })),
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
          .enum(["claude-code", "codex"])
          .optional()
          .describe("Provider to run. Defaults to `claude-code`."),
        // Typed rather than a free-form record: an unknown or misspelled key
        // used to be accepted and then silently dropped by the provider
        // runtime, so a caller asking for `bypassPermissions` could end up on
        // the interactive fallback with no error to explain it.
        runtimeOptions: RuntimeOptionsObjectSchema.optional().describe(
          "Optional provider runtime overrides (model, claudeEffort, claudePermissionMode, codexApprovalPolicy, ...).",
        ),
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
          ...(runtimeOptions ? { runtimeOptions } : {}),
        }),
      }),
  );

  server.registerTool(
    "stave_consult_advisor",
    {
      description:
        "Consult the on-demand Advisor armed for the current turn: a separate read-only model that answers one question with advice. Only usable with the consultKey from this turn's Advisor briefing; each turn has a limited consult budget.",
      inputSchema: {
        consultKey: z
          .string()
          .min(1)
          .describe(
            "The turn-scoped consult key from the Advisor briefing in your context.",
          ),
        question: z
          .string()
          .min(1)
          .describe("What you want advice on. Be specific."),
        context: z
          .string()
          .optional()
          .describe(
            "Minimal code/plan excerpts the Advisor needs. It has no repository or tool access and sees nothing else.",
          ),
      },
    },
    async ({ consultKey, question, context }) =>
      toStructuredResult({
        consult: await consultAdvisor({
          consultKey,
          question,
          ...(context ? { context } : {}),
        }),
      }),
  );

  server.registerTool(
    "stave_run_worker",
    {
      description:
        "Run one bounded task through the same-provider Worker armed for the current turn. The Worker gets a fresh session in the current workspace and returns its result to the primary for review.",
      inputSchema: {
        workerKey: z
          .string()
          .min(1)
          .describe(
            "The exact turn-scoped worker key from the Worker briefing in your context.",
          ),
        task: z
          .string()
          .min(1)
          .max(WORKER_TASK_MAX_CHARS)
          .describe(
            "A complete, standalone delegated task including file scope and verification requirements.",
          ),
        context: z
          .string()
          .max(WORKER_CONTEXT_MAX_CHARS)
          .optional()
          .describe(
            "Optional small excerpts or constraints the Worker cannot discover from the workspace.",
          ),
      },
    },
    async ({ workerKey, task, context }) =>
      toStructuredResult({
        worker: await runAcpWorker({
          workerKey,
          task,
          ...(context ? { context } : {}),
        }),
      }),
  );

  server.registerTool(
    "stave_delegate_task",
    {
      description:
        "Delegate work from this task to a durable child Stave task, optionally on the other provider. The delegation is recorded on the run ledger and identified by `(parentTaskId, delegationKey)`, so calling this twice with the same key returns the same child instead of creating a second one.",
      inputSchema: {
        projectPath: z
          .string()
          .min(1)
          .describe("Project root path that owns the parent workspace."),
        parentWorkspaceId: z
          .string()
          .min(1)
          .describe("Workspace id of the delegating (parent) task."),
        parentTaskId: z.string().min(1).describe("Id of the delegating task."),
        delegationKey: z
          .string()
          .min(1)
          .describe(
            "Caller-chosen idempotency key for this delegation, unique within the parent task. Letters, digits, dot, underscore and hyphen only.",
          ),
        prompt: z.string().min(1).describe("Prompt to run in the child task."),
        title: z.string().optional().describe("Optional child task title."),
        provider: z
          .enum(["claude-code", "codex"])
          .describe("Provider the child runs on. Required — never inherited."),
        model: z
          .string()
          .optional()
          .describe("Optional model override for the child."),
        effort: z
          .enum(["low", "medium", "high", "xhigh", "max", "ultra"])
          .optional()
          .describe(
            "Optional reasoning-effort tier for the child. Clamped to what the child's provider and model accept (`ultra` is Codex-only; Claude steps it down to `max`). Omitted, the child runs at the automation default (`medium`). Bounded briefs often do better on a cheaper model at `high`+ effort than on the default tier.",
          ),
        permissionProfile: z
          .enum(["auto", "guided", "manual"])
          .describe(
            "Child permission profile. Required and never inherited from the parent: `auto` runs unattended, `guided` routes sensitive actions through approvals, `manual` uses the provider defaults.",
          ),
        lifecycle: z
          .enum(["one-turn", "detached"])
          .describe(
            "`one-turn` finishes the delegation when the child's first turn ends. `detached` keeps the child task open until it is stopped.",
          ),
        workspace: z
          .union([
            z.object({ mode: z.literal("same-workspace") }),
            z.object({
              mode: z.literal("new-worktree"),
              name: z
                .string()
                .min(1)
                .describe("Workspace name for the new worktree."),
              fromBranch: z.string().optional().describe("Base branch."),
            }),
          ])
          .describe("Where the child runs."),
        retry: z
          .boolean()
          .optional()
          .describe(
            "Start a new attempt when this delegation already ended without succeeding. Ignored while it is still running.",
          ),
      },
    },
    async ({ provider, retry, ...rest }) =>
      toStructuredResult({
        delegation: await getChildTaskCoordinator().delegate({
          ...rest,
          providerId: provider,
          retry: retry ?? false,
        }),
      }),
  );

  server.registerTool(
    "stave_list_child_tasks",
    {
      description:
        "List the child tasks a task delegated, with identity, phase and terminal reason. Never returns a child's transcript.",
      inputSchema: {
        parentTaskId: z.string().min(1).describe("Id of the delegating task."),
        includeFinished: z
          .boolean()
          .optional()
          .describe("Include delegations that already ended. Defaults to true."),
      },
    },
    async ({ parentTaskId, includeFinished }) =>
      toStructuredResult({
        children: await getChildTaskCoordinator().list({
          parentTaskId,
          includeFinished: includeFinished ?? true,
        }),
      }),
  );

  server.registerTool(
    "stave_stop_child_task",
    {
      description:
        "Stop a delegated child task. The ledger row is cancelled durably; the child task is asked to stop as a best effort.",
      inputSchema: {
        parentTaskId: z.string().min(1).describe("Id of the delegating task."),
        delegationKey: z
          .string()
          .min(1)
          .describe("The delegation key used when the child was created."),
        reason: z.string().optional().describe("Short reason for the stop."),
      },
    },
    async (input) =>
      toStructuredResult({
        stop: await getChildTaskCoordinator().stop(input),
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
    "stave_list_task_heartbeats",
    {
      description:
        "List task heartbeats and their waiting, paused, or stopped state. A heartbeat wakes an existing task on a schedule in the same session; it never creates a task.",
      inputSchema: {
        workspaceId: z
          .string()
          .min(1)
          .optional()
          .describe("Limit the list to one workspace."),
      },
    },
    async ({ workspaceId }) =>
      toStructuredResult(
        await listTaskHeartbeats(workspaceId ? { workspaceId } : {}),
      ),
  );

  server.registerTool(
    "stave_get_task_heartbeat",
    {
      description:
        "Read one task heartbeat with its recent occurrences, including why an occurrence fired, deferred, or was skipped.",
      inputSchema: {
        id: z.string().min(1).describe("Heartbeat id."),
      },
    },
    async ({ id }) => toStructuredResult(await getTaskHeartbeat({ id })),
  );

  server.registerTool(
    "stave_create_task_heartbeat",
    {
      description:
        "Attach a heartbeat to an existing task so it wakes in the same session — on a schedule, or when work that task delegated finishes. Use a schedule trigger for standing checks such as re-checking CI on its pull request, and a completion trigger to pick a task back up when its child tasks return. To run something on a schedule in a NEW task each time, create a routine instead.",
      inputSchema: {
        input: TaskHeartbeatUpsertInputSchema.describe(
          "Heartbeat definition. `taskId` must name a task that already exists. A completion trigger without `maxOccurrences` is capped by default so the wake chain cannot recurse forever.",
        ),
      },
    },
    async ({ input }) =>
      toStructuredResult({
        heartbeat: await createTaskHeartbeat(input),
      }),
  );

  server.registerTool(
    "stave_update_task_heartbeat",
    {
      description:
        "Replace a task heartbeat's prompt, trigger, expiry, or occurrence cap. This also re-accepts the task's current provider and model, clearing a pause caused by a runtime change.",
      inputSchema: {
        id: z.string().min(1).describe("Heartbeat id."),
        input: TaskHeartbeatUpsertInputSchema.describe(
          "Complete next heartbeat definition. It must target the same task.",
        ),
      },
    },
    async ({ id, input }) =>
      toStructuredResult({
        heartbeat: await updateTaskHeartbeat({ id, input }),
      }),
  );

  server.registerTool(
    "stave_set_task_heartbeat_paused",
    {
      description:
        "Pause or resume a task heartbeat without deleting it. Resuming schedules the next occurrence from now, and is refused for a heartbeat that already stopped.",
      inputSchema: {
        id: z.string().min(1).describe("Heartbeat id."),
        paused: z
          .boolean()
          .describe("True to pause the heartbeat, false to resume it."),
      },
    },
    async ({ id, paused }) =>
      toStructuredResult({
        heartbeat: paused
          ? await pauseTaskHeartbeat({ id })
          : await resumeTaskHeartbeat({ id }),
      }),
  );

  server.registerTool(
    "stave_remove_task_heartbeat",
    {
      description:
        "Delete a task heartbeat and its occurrence history. The task itself is untouched.",
      inputSchema: {
        id: z.string().min(1).describe("Heartbeat id."),
      },
    },
    async ({ id }) => toStructuredResult(await removeTaskHeartbeat({ id })),
  );

  server.registerTool(
    "stave_list_routines",
    {
      description:
        "List saved Stave routines and their recent run history so an agent can inspect existing routine specs before creating, updating, or deleting them.",
    },
    async () =>
      toStructuredResult({
        routines: await listRoutines(),
      }),
  );

  server.registerTool(
    "stave_create_routine",
    {
      description:
        "Create a saved Stave routine from a complete routine spec. Use this when a user asks the AI to set up a recurring Claude or Codex workflow.",
      inputSchema: {
        input: RoutineUpsertInputSchema.describe("Complete routine spec."),
      },
    },
    async ({ input }) =>
      toStructuredResult({
        routine: await createRoutine(input),
      }),
  );

  server.registerTool(
    "stave_update_routine",
    {
      description:
        "Replace an existing Stave routine spec by id. Use this after listing routines and selecting the target routine to edit.",
      inputSchema: {
        id: z.string().min(1).describe("Routine id."),
        input: RoutineUpsertInputSchema.describe(
          "Complete next routine spec that should replace the saved one.",
        ),
      },
    },
    async ({ id, input }) =>
      toStructuredResult({
        routine: await updateRoutine({
          id,
          input,
        }),
      }),
  );

  server.registerTool(
    "stave_remove_routine",
    {
      description:
        "Delete a saved Stave routine by id. This removes the routine definition and its routine-history entries, but not the task conversations created by earlier runs.",
      inputSchema: {
        id: z.string().min(1).describe("Routine id."),
      },
    },
    async ({ id }) =>
      toStructuredResult({
        result: await removeRoutine({
          id,
        }),
      }),
  );

  server.registerTool(
    "stave_set_routine_enabled",
    {
      description:
        "Pause or resume a saved Stave routine without deleting it by setting its enabled flag.",
      inputSchema: {
        id: z.string().min(1).describe("Routine id."),
        enabled: z
          .boolean()
          .describe("Whether the routine should remain scheduled."),
      },
    },
    async ({ id, enabled }) =>
      toStructuredResult({
        routine: await setRoutineEnabled({
          id,
          enabled,
        }),
      }),
  );

  server.registerTool(
    "stave_run_routine_now",
    {
      description:
        "Trigger an immediate manual run for a saved Stave routine by id.",
      inputSchema: {
        id: z.string().min(1).describe("Routine id."),
      },
    },
    async ({ id }) =>
      toStructuredResult({
        run: await runRoutineNow({
          id,
        }),
      }),
  );

  server.registerTool(
    "stave_list_routine_information_references",
    {
      description:
        "List attachable Information panel references for the target workspace so an agent can reuse notes, todos, and linked resources in a routine spec.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
      },
    },
    async ({ workspaceId }) =>
      toStructuredResult({
        options: await listRoutineInformationReferences({
          workspaceId,
        }),
      }),
  );

  server.registerTool(
    "stave_create_routine_information_resource",
    {
      description:
        "Create a new Information panel item and return the routine attachment reference for it. Use this when the requested routine spec needs notes, todos, or linked resources that do not exist yet.",
      inputSchema: {
        input: RoutineInformationResourceCreateInputSchema.describe(
          "Information resource payload to create and attach to a routine.",
        ),
      },
    },
    async ({ input }) =>
      toStructuredResult({
        result: await createRoutineInformationResource(input),
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
        status: z
          .enum(["pending", "in_progress", "completed"])
          .optional()
          .describe(
            "Optional progress status: pending, in_progress, or completed.",
          ),
      },
    },
    async ({ workspaceId, todoId, text, completed, status }) =>
      toStructuredResult({
        result: await updateWorkspaceTodo({
          workspaceId,
          todoId,
          text,
          completed,
          status,
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
        "Add a Jira issue, PR, Confluence page, Storybook resource, Slack thread, or Figma resource to the workspace Information panel. Idempotent: a resource already registered under the same canonical identity (e.g. Jira issue key, PR number, normalized URL) is merged into the existing entry (the result sets `deduplicated: true`).",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        kind: z
          .enum([
            "jira",
            "crane",
            "pull_request",
            "confluence",
            "storybook",
            "slack",
            "figma",
            "amplify",
          ])
          .describe("Resource kind."),
        url: z.string().url().describe("Resource URL."),
        title: z.string().optional().describe("Optional display title."),
        issueKey: z
          .string()
          .optional()
          .describe("Issue key when kind=`jira` or kind=`crane`."),
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
        storybookAccessKind: z
          .enum(["unknown", "public", "requires_github_auth"])
          .optional()
          .describe("Optional Storybook access classification."),
        storybookExternalRepo: z
          .string()
          .optional()
          .describe("Optional GitHub owner/repo that backs the Storybook."),
        storybookReadableVia: z
          .enum(["unknown", "web", "github_cli"])
          .optional()
          .describe("Optional route an agent should use to read Storybook."),
        storybookSourceHint: z
          .string()
          .optional()
          .describe("Optional source or artifact hint for the Storybook."),
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
        "Remove a linked Jira issue, PR, Confluence page, Storybook resource, Slack thread, or Figma resource from the workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        kind: z
          .enum([
            "jira",
            "pull_request",
            "confluence",
            "storybook",
            "slack",
            "figma",
            "amplify",
          ])
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
        "Register a Jira issue in the Stave Workspace Information panel. Jira issues only: a Crane task URL passed here is rerouted to the Crane section (the result sets `reroutedTo: \"crane\"`), so use `stave_add_workspace_crane_issue` for Crane links. Idempotent: an issue already registered under the same issue key is merged into the existing entry (the result sets `deduplicated: true`).",
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
    "stave_add_workspace_crane_issue",
    {
      description:
        "Register a Crane issue in the Stave Workspace Information panel. Use this — never `stave_add_workspace_jira_issue` — for Crane task links: Crane keys such as `CRN-42` look like Jira keys but belong in the Crane section, so the Jira section keeps holding only the product's tracked Jira issue. Idempotent: an issue already registered under the same Crane host and key is merged into the existing entry (the result sets `deduplicated: true`).",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z
          .string()
          .min(1)
          .describe("Crane issue URL, e.g. https://<host>/apps/crane/w/TEAM/task/CRN-42."),
        issueKey: z
          .string()
          .optional()
          .describe("Optional Crane issue key override."),
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
        await addWorkspaceCraneIssue({
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
    "stave_add_workspace_storybook_resource",
    {
      description:
        "Register a Storybook resource in the Stave Workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z.string().min(1).describe("Storybook URL."),
        title: z.string().optional().describe("Optional title override."),
        note: z
          .string()
          .optional()
          .describe("Optional note stored with the link."),
        accessKind: z
          .enum(["unknown", "public", "requires_github_auth"])
          .optional()
          .describe("Optional Storybook access classification."),
        externalRepo: z
          .string()
          .optional()
          .describe("Optional GitHub owner/repo that backs the Storybook."),
        readableVia: z
          .enum(["unknown", "web", "github_cli"])
          .optional()
          .describe("Optional route an agent should use to read Storybook."),
        sourceHint: z
          .string()
          .optional()
          .describe("Optional source or artifact hint for the Storybook."),
      },
    },
    async ({
      workspaceId,
      url,
      title,
      note,
      accessKind,
      externalRepo,
      readableVia,
      sourceHint,
    }) =>
      toStructuredResult(
        await addWorkspaceStorybookResource({
          workspaceId,
          url,
          title,
          note,
          accessKind,
          externalRepo,
          readableVia,
          sourceHint,
        }),
      ),
  );

  server.registerTool(
    "stave_update_workspace_storybook_resource_access",
    {
      description:
        "Attach access metadata such as GitHub owner/repo to an existing Storybook resource when direct URL reading requires authentication.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        resourceId: z
          .string()
          .optional()
          .describe("Stored Storybook resource id."),
        url: z
          .string()
          .optional()
          .describe("Stored Storybook URL, used when resource id is unknown."),
        accessKind: z
          .enum(["unknown", "public", "requires_github_auth"])
          .optional()
          .describe("Storybook access classification."),
        externalRepo: z
          .string()
          .optional()
          .describe("GitHub owner/repo that backs the Storybook."),
        readableVia: z
          .enum(["unknown", "web", "github_cli"])
          .optional()
          .describe("Route an agent should use to read Storybook."),
        sourceHint: z
          .string()
          .optional()
          .describe("Source or artifact hint for the Storybook."),
      },
    },
    async ({
      workspaceId,
      resourceId,
      url,
      accessKind,
      externalRepo,
      readableVia,
      sourceHint,
    }) =>
      toStructuredResult({
        result: await updateWorkspaceStorybookResourceAccess({
          workspaceId,
          resourceId,
          url,
          accessKind,
          externalRepo,
          readableVia,
          sourceHint,
        }),
      }),
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
    "stave_add_workspace_amplify_link",
    {
      description:
        "Register an AWS Amplify deploy URL in the Stave Workspace Information panel.",
      inputSchema: {
        workspaceId: z.string().min(1).describe("Workspace id."),
        url: z
          .string()
          .min(1)
          .describe(
            "Amplify deploy URL, e.g. https://<branch>.<appid>.amplifyapp.com.",
          ),
        label: z
          .string()
          .optional()
          .describe("Optional branch/environment label."),
        note: z
          .string()
          .optional()
          .describe("Optional note stored with the link."),
      },
    },
    async ({ workspaceId, url, label, note }) =>
      toStructuredResult(
        await addWorkspaceAmplifyLink({
          workspaceId,
          url,
          label,
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
      const unattendedAutomationAuthorizationToken = url.searchParams
        .get(STAVE_UNATTENDED_AUTOMATION_QUERY_PARAM)
        ?.trim();
      await runWithUnattendedAutomationAuthorization(
        unattendedAutomationAuthorizationToken,
        () => transport.handleRequest(req, res, body),
      );
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

  const normalizedRequestedPort = Number.isFinite(requestedPort)
    ? requestedPort
    : 0;
  try {
    await listenOnPort(nextServer, host, normalizedRequestedPort);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException)?.code === "EADDRINUSE" &&
      normalizedRequestedPort !== 0
    ) {
      // Never fail startup over a busy fixed port: fall back to an ephemeral
      // one and let the manifest carry the real endpoint.
      console.warn(
        `[stave-mcp] port ${normalizedRequestedPort} is in use; falling back to an OS-assigned port`,
      );
      try {
        await listenOnPort(nextServer, host, 0);
      } catch (fallbackError) {
        nextServer.close();
        throw fallbackError;
      }
    } else {
      nextServer.close();
      throw error;
    }
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
    // `close` only stops accepting new sockets; lingering keep-alive
    // connections would otherwise hold the restart open for the keep-alive
    // timeout and stall the caller that is waiting to rebind.
    currentServer.closeIdleConnections?.();
    currentServer.closeAllConnections?.();
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
