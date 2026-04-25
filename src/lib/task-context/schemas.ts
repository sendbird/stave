import { z } from "zod";
import type {
  WorkspaceShell,
  WorkspaceShellLite,
  WorkspaceSnapshot,
} from "@/lib/db/workspaces.db";
const TextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  segmentId: z.string().optional(),
});

const ThinkingPartSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
  isStreaming: z.boolean(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

const ToolUsePartSchema = z.object({
  type: z.literal("tool_use"),
  toolUseId: z.string().optional(),
  toolName: z.string(),
  input: z.string(),
  output: z.string().optional(),
  elapsedSeconds: z.number().optional(),
  progressMessages: z.array(z.string()).optional(),
  state: z.union([
    z.literal("input-streaming"),
    z.literal("input-available"),
    z.literal("output-available"),
    z.literal("output-error"),
  ]),
});

const CodeDiffPartSchema = z.object({
  type: z.literal("code_diff"),
  filePath: z.string(),
  oldContent: z.string(),
  newContent: z.string(),
  status: z
    .union([z.literal("pending"), z.literal("accepted"), z.literal("rejected")])
    .optional()
    .default("pending"),
});

const FileContextPartSchema = z.object({
  type: z.literal("file_context"),
  filePath: z.string(),
  content: z.string(),
  language: z.string(),
  instruction: z.string().optional(),
});

const ApprovalPartSchema = z.object({
  type: z.literal("approval"),
  toolName: z.string(),
  description: z.string(),
  requestId: z.string(),
  state: z.union([
    z.literal("approval-requested"),
    z.literal("approval-responded"),
    z.literal("approval-interrupted"),
    z.literal("output-denied"),
  ]),
});

const UserInputPartSchema = z.object({
  type: z.literal("user_input"),
  requestId: z.string(),
  toolName: z.string(),
  questions: z.array(
    z.object({
      key: z.string().optional(),
      question: z.string(),
      header: z.string(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
        }),
      ),
      multiSelect: z.boolean().optional(),
      inputType: z
        .union([
          z.literal("text"),
          z.literal("number"),
          z.literal("integer"),
          z.literal("boolean"),
          z.literal("url_notice"),
        ])
        .optional(),
      required: z.boolean().optional(),
      placeholder: z.string().optional(),
      allowCustom: z.boolean().optional(),
      defaultValue: z.string().optional(),
      linkUrl: z.string().optional(),
    }),
  ),
  answers: z.record(z.string(), z.string()).optional(),
  state: z.union([
    z.literal("input-requested"),
    z.literal("input-responded"),
    z.literal("input-interrupted"),
    z.literal("input-denied"),
  ]),
});

const ImageContextPartSchema = z.object({
  type: z.literal("image_context"),
  dataUrl: z.string(),
  label: z.string(),
  mimeType: z.string(),
});

const SystemEventPartSchema = z.object({
  type: z.literal("system_event"),
  content: z.string(),
  compactBoundary: z
    .object({
      trigger: z.string().optional(),
      gitRef: z.string().optional(),
    })
    .optional(),
});

const StaveProcessingPartSchema = z.object({
  type: z.literal("stave_processing"),
  strategy: z.union([z.literal("direct"), z.literal("orchestrate")]),
  model: z.string().optional(),
  supervisorModel: z.string().optional(),
  reason: z.string(),
  fastModeRequested: z.boolean().optional(),
  fastModeApplied: z.boolean().optional(),
});

const OrchestrationProgressPartSchema = z.object({
  type: z.literal("orchestration_progress"),
  supervisorModel: z.string(),
  subtasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      model: z.string(),
      status: z.union([
        z.literal("pending"),
        z.literal("running"),
        z.literal("done"),
        z.literal("error"),
      ]),
    }),
  ),
  status: z.union([
    z.literal("planning"),
    z.literal("executing"),
    z.literal("synthesizing"),
    z.literal("done"),
  ]),
});

const MessagePartSchema = z.discriminatedUnion("type", [
  TextPartSchema,
  ThinkingPartSchema,
  ToolUsePartSchema,
  CodeDiffPartSchema,
  FileContextPartSchema,
  ImageContextPartSchema,
  ApprovalPartSchema,
  UserInputPartSchema,
  SystemEventPartSchema,
  StaveProcessingPartSchema,
  OrchestrationProgressPartSchema,
]);

const AttachmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), filePath: z.string() }),
  z.object({
    kind: z.literal("image"),
    id: z.string(),
    dataUrl: z.string(),
    label: z.string(),
  }),
]);

const PromptDraftRuntimeOverridesSchema = z
  .object({
    model: z.string().optional(),
    claudePermissionMode: z
      .union([
        z.literal("default"),
        z.literal("acceptEdits"),
        z.literal("bypassPermissions"),
        z.literal("plan"),
        z.literal("dontAsk"),
        z.literal("auto"),
      ])
      .optional(),
    claudePermissionModeBeforePlan: z
      .union([
        z.literal("default"),
        z.literal("acceptEdits"),
        z.literal("bypassPermissions"),
        z.literal("dontAsk"),
        z.literal("auto"),
        z.null(),
      ])
      .optional(),
    codexPlanMode: z.boolean().optional(),
  })
  .strict();

const PromptDraftQueuedNextTurnSchema = z
  .object({
    queuedAt: z.string(),
    sourceTurnId: z.string().optional(),
    content: z.string().optional(),
  })
  .strict();

const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.union([z.literal("user"), z.literal("assistant")]),
  model: z.string(),
  providerId: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("stave"),
    z.literal("user"),
  ]),
  content: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  isStreaming: z.boolean().optional(),
  isPlanResponse: z.boolean().optional(),
  planText: z.string().optional(),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheReadTokens: z.number().optional(),
      cacheCreationTokens: z.number().optional(),
      totalCostUsd: z.number().optional(),
      ttftMs: z.number().optional(),
    })
    .optional(),
  promptSuggestions: z.array(z.string()).optional(),
  parts: z.array(MessagePartSchema),
});

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("stave"),
  ]),
  updatedAt: z.string(),
  unread: z.boolean(),
  archivedAt: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  controlMode: z
    .union([z.literal("interactive"), z.literal("managed")])
    .optional()
    .default("interactive"),
  controlOwner: z
    .union([z.literal("stave"), z.literal("external")])
    .optional()
    .default("stave"),
  planFilePaths: z.array(z.string()).optional().default([]),
});

const TaskProviderSessionStateSchema = z.object({
  "claude-code": z.string().optional(),
  codex: z.string().optional(),
  stave: z.string().optional(),
});

const EditorTabSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  kind: z.union([z.literal("text"), z.literal("image")]).optional(),
  language: z.string(),
  content: z.string().optional().default(""),
  contentState: z
    .union([z.literal("ready"), z.literal("deferred"), z.literal("loading")])
    .optional()
    .default("ready"),
  originalContent: z.string().optional(),
  savedContent: z.string().optional(),
  baseRevision: z.string().nullable().optional(),
  hasConflict: z.boolean(),
  isDirty: z.boolean(),
});

const WorkspaceTerminalTabSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    linkedTaskId: z.string().nullable(),
    // Legacy persisted shells may still contain xterm tabs from before the
    // Ghostty migration. Normalize those payloads instead of dropping the entire
    // workspace shell at parse time.
    backend: z
      .union([z.literal("ghostty"), z.literal("xterm")])
      .optional()
      .default("ghostty"),
    cwd: z.string(),
    createdAt: z.number().int().nonnegative(),
  })
  .transform((tab) => ({
    ...tab,
    backend: "ghostty" as const,
  }));

const WorkspaceCliSessionTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.union([z.literal("claude-code"), z.literal("codex")]),
  contextMode: z.union([z.literal("workspace"), z.literal("active-task")]),
  nativeSessionId: z.string().optional(),
  linkedTaskId: z.string().nullable(),
  linkedTaskTitle: z.string().nullable(),
  handoffSummary: z.string(),
  cwd: z.string(),
  createdAt: z.number().int().nonnegative(),
  lastKnownSlotState: z
    .union([
      z.literal("idle"),
      z.literal("running"),
      z.literal("background"),
      z.literal("exited"),
    ])
    .optional(),
  lastExit: z
    .object({
      exitCode: z.number(),
      signal: z.number().optional(),
      at: z.string(),
    })
    .optional(),
});

const WorkspaceActiveSurfaceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task"),
    taskId: z.string(),
  }),
  z.object({
    kind: z.literal("cli-session"),
    cliSessionTabId: z.string(),
  }),
]);

const WorkspaceJiraIssueSchema = z.object({
  id: z.string(),
  issueKey: z.string().optional().default(""),
  title: z.string().optional().default(""),
  url: z.string().optional().default(""),
  status: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

const WorkspaceFigmaResourceSchema = z.object({
  id: z.string(),
  title: z.string().optional().default(""),
  url: z.string().optional().default(""),
  nodeId: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

const WorkspaceLinkedPullRequestSchema = z.object({
  id: z.string(),
  title: z.string().optional().default(""),
  url: z.string().optional().default(""),
  status: z
    .union([
      z.literal("planned"),
      z.literal("open"),
      z.literal("review"),
      z.literal("merged"),
      z.literal("closed"),
    ])
    .optional()
    .default("planned"),
  note: z.string().optional().default(""),
});

const WorkspaceSlackThreadSchema = z.object({
  id: z.string(),
  url: z.string().optional().default(""),
  channelName: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

const WorkspaceConfluencePageSchema = z.object({
  id: z.string(),
  title: z.string().optional().default(""),
  url: z.string().optional().default(""),
  spaceKey: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

const WorkspaceTodoItemSchema = z.object({
  id: z.string(),
  text: z.string().optional().default(""),
  completed: z.boolean().optional().default(false),
});

const WorkspaceInfoCustomFieldSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("text"),
    value: z.string().optional().default(""),
  }),
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("textarea"),
    value: z.string().optional().default(""),
  }),
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("number"),
    value: z.number().nullable().optional().default(null),
  }),
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("boolean"),
    value: z.boolean().optional().default(false),
  }),
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("date"),
    value: z.string().optional().default(""),
  }),
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("url"),
    value: z.string().optional().default(""),
  }),
  z.object({
    id: z.string(),
    label: z.string().optional().default(""),
    type: z.literal("single_select"),
    value: z.string().optional().default(""),
    options: z.array(z.string()).optional().default([]),
  }),
]);

const WorkspaceTurnSummarySchema = z.object({
  turnId: z.string(),
  taskId: z.string(),
  taskTitle: z.string().optional().default(""),
  generatedAt: z.string(),
  model: z.string().optional().default(""),
  requestSummary: z.string().optional().default(""),
  workSummary: z.string().optional().default(""),
});

const WorkspaceInformationSchema = z.object({
  jiraIssues: z.array(WorkspaceJiraIssueSchema).optional().default([]),
  confluencePages: z
    .array(WorkspaceConfluencePageSchema)
    .optional()
    .default([]),
  figmaResources: z.array(WorkspaceFigmaResourceSchema).optional().default([]),
  linkedPullRequests: z
    .array(WorkspaceLinkedPullRequestSchema)
    .optional()
    .default([]),
  slackThreads: z.array(WorkspaceSlackThreadSchema).optional().default([]),
  turnSummary: WorkspaceTurnSummarySchema.nullable().optional(),
  notes: z.string().optional().default(""),
  todos: z.array(WorkspaceTodoItemSchema).optional().default([]),
  customFields: z.array(WorkspaceInfoCustomFieldSchema).optional().default([]),
});

export const WorkspaceSnapshotSchema = z.object({
  activeTaskId: z.string(),
  tasks: z.array(TaskSchema),
  messagesByTask: z.record(z.string(), z.array(ChatMessageSchema)),
  promptDraftByTask: z
    .record(
      z.string(),
      z.object({
        text: z.string(),
        attachedFilePaths: z.array(z.string()).optional().default([]),
        attachments: z.array(AttachmentSchema).optional().default([]),
        runtimeOverrides: PromptDraftRuntimeOverridesSchema.optional(),
        queuedNextTurn: PromptDraftQueuedNextTurnSchema.optional(),
      }),
    )
    .optional()
    .default({}),
  providerSessionByTask: z
    .record(z.string(), TaskProviderSessionStateSchema)
    .optional()
    .default({}),
  editorTabs: z.array(EditorTabSchema).optional().default([]),
  activeEditorTabId: z.string().nullable().optional().default(null),
  terminalTabs: z.array(WorkspaceTerminalTabSchema).optional().default([]),
  activeTerminalTabId: z.string().nullable().optional().default(null),
  terminalDocked: z.boolean().optional().default(false),
  cliSessionTabs: z.array(WorkspaceCliSessionTabSchema).optional().default([]),
  activeCliSessionTabId: z.string().nullable().optional().default(null),
  activeSurface: WorkspaceActiveSurfaceSchema.optional().default({
    kind: "task",
    taskId: "",
  }),
  workspaceInformation: WorkspaceInformationSchema.optional().default({
    jiraIssues: [],
    confluencePages: [],
    figmaResources: [],
    linkedPullRequests: [],
    slackThreads: [],
    notes: "",
    todos: [],
    customFields: [],
  }),
});

export const WorkspaceShellSchema = WorkspaceSnapshotSchema.omit({
  messagesByTask: true,
}).extend({
  messageCountByTask: z
    .record(z.string(), z.number().int().nonnegative())
    .optional()
    .default({}),
});

export const WorkspaceShellLiteSchema = WorkspaceShellSchema.pick({
  activeTaskId: true,
  tasks: true,
  promptDraftByTask: true,
  providerSessionByTask: true,
  messageCountByTask: true,
});

export function parseWorkspaceSnapshot(args: {
  payload: unknown;
}): WorkspaceSnapshot | null {
  const parsed = WorkspaceSnapshotSchema.safeParse(args.payload);
  if (!parsed.success) {
    console.error(
      "[task-context] invalid workspace snapshot payload",
      parsed.error.flatten(),
    );
    return null;
  }
  return parsed.data as WorkspaceSnapshot;
}

export function parseWorkspaceShell(args: {
  payload: unknown;
}): WorkspaceShell | null {
  const parsed = WorkspaceShellSchema.safeParse(args.payload);
  if (!parsed.success) {
    console.error(
      "[task-context] invalid workspace shell payload",
      parsed.error.flatten(),
    );
    return null;
  }
  return parsed.data as WorkspaceShell;
}

export function parseWorkspaceShellLite(args: {
  payload: unknown;
}): WorkspaceShellLite | null {
  const parsed = WorkspaceShellLiteSchema.safeParse(args.payload);
  if (!parsed.success) {
    console.error(
      "[task-context] invalid workspace shell lite payload",
      parsed.error.flatten(),
    );
    return null;
  }
  return parsed.data as WorkspaceShellLite;
}
