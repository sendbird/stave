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
  input: z.string().optional(),
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

const WorkspaceInformationReferenceSchema = z.object({
  section: z.union([
    z.literal("turn-summary"),
    z.literal("notes"),
    z.literal("todo"),
    z.literal("pr"),
    z.literal("jira"),
    z.literal("confluence"),
    z.literal("storybook"),
    z.literal("amplify"),
    z.literal("slack"),
    z.literal("figma"),
    z.literal("custom"),
  ]),
  scope: z.union([z.literal("section"), z.literal("item")]),
  itemId: z.string().optional(),
  label: z.string(),
  token: z.string(),
});

const WorkspaceInformationContextPartSchema = z.object({
  type: z.literal("workspace_information_context"),
  reference: WorkspaceInformationReferenceSchema,
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

const MessagePartSchema = z.discriminatedUnion("type", [
  TextPartSchema,
  ThinkingPartSchema,
  ToolUsePartSchema,
  CodeDiffPartSchema,
  FileContextPartSchema,
  ImageContextPartSchema,
  WorkspaceInformationContextPartSchema,
  ApprovalPartSchema,
  UserInputPartSchema,
  SystemEventPartSchema,
]);

const AttachmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("file"), filePath: z.string() }),
  z.object({
    kind: z.literal("image"),
    id: z.string(),
    dataUrl: z.string(),
    label: z.string(),
    mimeType: z.string().optional(),
  }),
  z.object({
    kind: z.literal("workspace-information"),
    id: z.string(),
    reference: WorkspaceInformationReferenceSchema,
  }),
  z.object({
    kind: z.literal("lens-annotations"),
    id: z.string(),
    workspaceId: z.string().optional(),
    lensSessionId: z.string().optional(),
    label: z.string(),
    count: z.number(),
    summary: z.string(),
    content: z.string(),
    displayContent: z.string().optional(),
    annotations: z.array(z.unknown()).optional(),
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
    claudeEffort: z
      .union([
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
      ])
      .optional(),
    codexPlanMode: z.boolean().optional(),
    codexReasoningEffort: z
      .union([
        z.literal("minimal"),
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
        z.literal("ultra"),
      ])
      .optional(),
    autoRouting: z.boolean().optional(),
  })
  .strict();

const PromptDraftQueuedNextTurnSchema = z
  .object({
    queuedAt: z.string(),
    sourceTurnId: z.string().optional(),
    content: z.string().optional(),
  })
  .strict();

const PromptDraftQueuedTurnSchema = z
  .object({
    id: z.string(),
    queuedAt: z.string(),
    sourceTurnId: z.string().optional(),
    content: z.string(),
    attachedFilePaths: z.array(z.string()).optional().default([]),
    attachments: z.array(AttachmentSchema).optional().default([]),
  })
  .strict();

const PromptDraftBatchItemSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    content: z.string(),
    attachedFilePaths: z.array(z.string()).optional().default([]),
    attachments: z.array(AttachmentSchema).optional().default([]),
  })
  .strict();

const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.union([z.literal("user"), z.literal("assistant")]),
  model: z.string(),
  providerId: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("user"),
  ]),
  content: z.string(),
  displayContent: z.string().optional(),
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
  displayParts: z.array(MessagePartSchema).optional(),
  steeredIntoTurnId: z.string().optional(),
});

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleManuallySet: z.boolean().optional(),
  provider: z.union([z.literal("claude-code"), z.literal("codex")]),
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

const ProviderSessionCursorSchema = z.object({
  nativeSessionId: z.string(),
  syncedThroughMessageId: z.string().optional(),
});

const TaskProviderSessionEntrySchema = z.union([
  z.string(),
  ProviderSessionCursorSchema,
]);

const TaskProviderSessionStateSchema = z.object({
  "claude-code": TaskProviderSessionEntrySchema.optional(),
  codex: TaskProviderSessionEntrySchema.optional(),
  stave: z.string().optional(),
});

const EditorTabSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  kind: z
    .union([z.literal("text"), z.literal("image"), z.literal("git-graph")])
    .optional(),
  language: z.string(),
  content: z.string().optional().default(""),
  contentState: z
    .union([
      z.literal("ready"),
      z.literal("deferred"),
      z.literal("loading"),
      z.literal("too-large"),
    ])
    .optional()
    .default("ready"),
  originalContent: z.string().optional(),
  savedContent: z.string().optional(),
  baseRevision: z.string().nullable().optional(),
  fileSizeBytes: z.number().optional(),
  fileSizeLimitBytes: z.number().optional(),
  hasConflict: z.boolean(),
  isDirty: z.boolean(),
});

const WorkspaceTerminalTabSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    linkedTaskId: z.string().nullable(),
    // Legacy persisted shells may carry a `backend` tag (`ghostty` from the
    // pre-xterm dock renderer, or `xterm`). Both surfaces now render with
    // xterm, so normalize any persisted value to one canonical tag instead of
    // dropping the workspace shell at parse time.
    backend: z
      .union([z.literal("ghostty"), z.literal("xterm")])
      .optional()
      .default("xterm"),
    cwd: z.string(),
    createdAt: z.number().int().nonnegative(),
  })
  .transform((tab) => ({
    ...tab,
    backend: "xterm" as const,
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

const WorkspaceActiveSurfacePayloadSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task"),
    taskId: z.string(),
  }),
  z.object({
    kind: z.literal("cli-session"),
    cliSessionTabId: z.string(),
  }),
  z.object({
    kind: z.literal("compare-run"),
    compareRunId: z.string(),
  }),
  z.object({
    kind: z.literal("lens"),
    lensSessionId: z.string(),
  }),
  z.object({
    kind: z.literal("terminal"),
    terminalTabId: z.string(),
  }),
  z.object({
    kind: z.literal("editor"),
    editorTabId: z.string(),
  }),
]);

const WorkspaceActiveSurfaceSchema = z.preprocess((payload) => {
  if (
    payload &&
    typeof payload === "object" &&
    "kind" in payload &&
    payload.kind === "fleet-view"
  ) {
    return { kind: "task", taskId: "" };
  }
  return payload;
}, WorkspaceActiveSurfacePayloadSchema);

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

const WorkspaceStorybookResourceAccessSchema = z.object({
  kind: z
    .union([
      z.literal("unknown"),
      z.literal("public"),
      z.literal("requires_github_auth"),
    ])
    .optional()
    .default("unknown"),
  provider: z
    .union([z.literal("unknown"), z.literal("github-pages"), z.literal("web")])
    .optional()
    .default("unknown"),
  externalRepo: z.string().optional().default(""),
  readableVia: z
    .union([z.literal("unknown"), z.literal("web"), z.literal("github_cli")])
    .optional()
    .default("unknown"),
  sourceHint: z.string().optional().default(""),
});

const WorkspaceStorybookResourceSchema = z.object({
  id: z.string(),
  title: z.string().optional().default(""),
  url: z.string().optional().default(""),
  note: z.string().optional().default(""),
  access: WorkspaceStorybookResourceAccessSchema.optional(),
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

const WorkspaceAmplifyLinkSchema = z.object({
  id: z.string(),
  url: z.string().optional().default(""),
  label: z.string().optional().default(""),
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
  status: z.enum(["pending", "in_progress", "completed"]).optional(),
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
  storybookResources: z
    .array(WorkspaceStorybookResourceSchema)
    .optional()
    .default([]),
  linkedPullRequests: z
    .array(WorkspaceLinkedPullRequestSchema)
    .optional()
    .default([]),
  amplifyLinks: z.array(WorkspaceAmplifyLinkSchema).optional().default([]),
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
        promptBatch: z.array(PromptDraftBatchItemSchema).optional(),
        queuedTurns: z.array(PromptDraftQueuedTurnSchema).optional(),
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
  // Universal pane/tab model. Optional WITHOUT defaults on purpose: a missing
  // field means "legacy snapshot" and triggers migration defaults at load time
  // (e.g. openTaskTabIds = all non-archived tasks), while an explicit empty
  // array means the user closed those tabs.
  openTaskTabIds: z.array(z.string()).optional(),
  lensTabs: z
    .array(
      z.object({
        id: z.string(),
        createdAt: z.number().optional().default(0),
      }),
    )
    .optional(),
  paneTabMeta: z
    .record(
      z.string(),
      z.object({
        customTitle: z.string().optional(),
        customIcon: z.string().optional(),
        pinned: z.boolean().optional(),
      }),
    )
    .optional(),
  dockLayout: z.record(z.string(), z.unknown()).nullable().optional(),
  workspaceInformation: WorkspaceInformationSchema.optional().default({
    jiraIssues: [],
    confluencePages: [],
    figmaResources: [],
    storybookResources: [],
    linkedPullRequests: [],
    amplifyLinks: [],
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
