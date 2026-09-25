export { AgentHistoryRequestSchema } from "../../../src/lib/providers/agent-history";
export { WorkspaceExecutionArgsSchema } from "../../../src/lib/performance/workspace-execution";
import { WorkspaceSnapshotSchema } from "../../../src/lib/task-context/schemas";
import { z } from "zod";
import {
  MAX_PROVIDER_TIMEOUT_MS,
  ProviderIdSchema,
  RuntimeOptionsSchema,
} from "./provider-runtime-schemas";
export {
  ManagedExecutionProviderIdSchema,
  ProviderIdSchema,
  RuntimeOptionsObjectSchema,
  RuntimeOptionsSchema,
} from "./provider-runtime-schemas";
export { StreamTurnArgsSchema } from "./provider-conversation-schemas";
import {
  RoutineInformationResourceCreateInputSchema,
  RoutineUpsertInputSchema,
} from "../../../src/lib/routines";
import { LENS_CAPTURE_LIMITS } from "../../../src/lib/lens/lens-annotation-schema";
import { PR_CONTEXT_LIMITS } from "../../../src/lib/pr-context";
import { GITHUB_PR_REVIEW_LIMITS } from "../../../src/lib/github-pr-review";
import {
  ENV_VAR_NAME_MAX_LENGTH,
  ENV_VAR_NAME_PATTERN,
} from "../../../src/lib/secrets/secrets";
import {
  isSlackHostedMcpUrl,
  OAUTH_CLIENT_ID_MAX_LENGTH,
  OAUTH_CLIENT_ID_PATTERN,
} from "../../../src/lib/providers/slack-hosted-mcp";
export {
  SecondaryRunCancelArgsSchema,
  SecondaryRunClaimArgsSchema,
  SecondaryRunCompleteArgsSchema,
  SecondaryRunExecuteArgsSchema,
  SecondaryRunFailArgsSchema,
  SecondaryRunLookupArgsSchema,
  SecondaryRunReceiptListArgsSchema,
} from "../../../src/lib/runs/secondary-run";
export {
  CraneConnectorConfigInputSchema as CraneConnectorConfigArgsSchema,
  CraneConnectorPairInputSchema as CraneConnectorPairArgsSchema,
  CraneDispatchApprovalResponseSchema as CraneDispatchApproveArgsSchema,
  CraneDispatchDeclineResponseSchema as CraneDispatchDeclineArgsSchema,
} from "../../../src/lib/crane-connector/types";
export { AtelierConnectorPairArgsSchema } from "../../../src/lib/atelier-connector/types";
export {
  MartinLinkProjectArgsSchema,
  MartinListProjectsArgsSchema,
  MartinSyncConfigureArgsSchema,
  MartinSyncEnqueueArgsSchema,
  MartinSyncLinksChangedArgsSchema,
  MartinWorkspaceArgsSchema,
} from "../../../src/lib/martin-sync/types";
export {
  TrackerTaskAttachStaveTaskArgsSchema,
  TrackerTaskKickoffArgsSchema,
  TrackerTaskRefArgsSchema,
  TrackerTasksListArgsSchema,
  TrackerTasksRefreshArgsSchema,
  TrackerTasksSurfaceVisibleArgsSchema,
} from "../../../src/lib/tracker-tasks/types";
export { TrackerTasksSettingsSchema as TrackerTasksConfigureArgsSchema } from "../../../src/lib/tracker-tasks/settings";
export {
  JiraConnectorConfigureArgsSchema,
  JiraConnectorSetCredentialArgsSchema,
  JiraConnectorTestConnectionArgsSchema,
} from "../../../src/lib/jira-connector/types";

export const RoutineProviderTimeoutArgsSchema = z
  .object({
    providerTimeoutMs: z.number().int().min(1).max(MAX_PROVIDER_TIMEOUT_MS),
  })
  .strict();

export const McpDiscoveryArgsSchema = z
  .object({ cwd: z.string().max(4096).optional() })
  .strict();

const McpConfigProviderSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
  z.literal("cursor"),
  z.literal("kiro"),
]);
const McpConfigScopeSchema = z.union([
  z.literal("user"),
  z.literal("project"),
  z.literal("local"),
]);
const McpConfigTransportSchema = z.union([
  z.literal("stdio"),
  z.literal("http"),
  z.literal("sse"),
]);
const McpServerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const McpEnvVarNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ENV_VAR_NAME_MAX_LENGTH)
  .regex(ENV_VAR_NAME_PATTERN);
const McpHeaderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/);

export const McpServerConfigDraftSchema = z
  .object({
    provider: McpConfigProviderSchema,
    scope: McpConfigScopeSchema,
    name: McpServerNameSchema,
    transport: McpConfigTransportSchema,
    command: z.string().trim().min(1).max(4096).optional(),
    args: z.array(z.string().max(4096)).max(200).optional(),
    url: z
      .string()
      .trim()
      .url()
      .max(4096)
      .refine((value) => /^https?:\/\//i.test(value))
      .optional(),
    envVars: z.array(McpEnvVarNameSchema).max(100),
    bearerTokenEnvVar: McpEnvVarNameSchema.optional(),
    headerEnvBindings: z
      .array(
        z
          .object({
            name: McpHeaderNameSchema,
            envVar: McpEnvVarNameSchema,
          })
          .strict(),
      )
      .max(100),
    oauthClientId: z
      .string()
      .trim()
      .min(1)
      .max(OAUTH_CLIENT_ID_MAX_LENGTH)
      .regex(OAUTH_CLIENT_ID_PATTERN)
      .optional(),
    enabled: z.boolean(),
  })
  .strict()
  .superRefine((draft, context) => {
    if (draft.provider === "codex" && draft.scope !== "user") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Codex MCP editing supports user scope only.",
      });
    }
    if (draft.provider === "cursor" && draft.scope === "local") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Cursor MCP editing supports user or project scope.",
      });
    }
    if (draft.provider === "kiro" && draft.scope === "local") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "Kiro MCP editing supports user or project scope.",
      });
    }
    if (draft.provider === "codex" && draft.transport === "sse") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transport"],
        message: "Codex MCP editing does not support SSE.",
      });
    }
    if (draft.transport === "stdio" && !draft.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: "A stdio MCP server requires a command.",
      });
    }
    if (
      draft.provider === "kiro" &&
      draft.transport !== "stdio" &&
      isSlackHostedMcpUrl(draft.url)
    ) {
      if (!draft.oauthClientId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["oauthClientId"],
          message: "Kiro Slack MCP requires a Slack app OAuth client ID.",
        });
      }
    }
  });

const McpServerConfigTargetSchema = z
  .object({
    provider: McpConfigProviderSchema,
    scope: McpConfigScopeSchema,
    name: McpServerNameSchema,
  })
  .strict();

export const LensCredentialUpsertArgsSchema = z
  .object({
    id: z.string().uuid().optional(),
    hosts: z.array(z.string().trim().min(1).max(2048)).min(1).max(64),
    username: z.string().trim().min(1).max(512),
    password: z.string().min(1).max(8192).optional(),
    autoFill: z.boolean(),
  })
  .strict();

export const LensCredentialCreateArgsSchema =
  LensCredentialUpsertArgsSchema.omit({ id: true }).extend({
    password: z.string().min(1).max(8192),
  });

export const LensCredentialUpdateArgsSchema =
  LensCredentialUpsertArgsSchema.extend({
    id: z.string().uuid(),
  });

export const LensCredentialDeleteArgsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const LensLogQueryArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    lensSessionId: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

export const LensLogClearArgsSchema = LensLogQueryArgsSchema.omit({
  limit: true,
}).strict();

export const LensDiagnosticsCaptureArgsSchema = LensLogClearArgsSchema.extend({
  enabled: z.boolean(),
}).strict();

export const LensConsoleEntryDetailArgsSchema = LensLogClearArgsSchema.extend({
  entryId: z.string().min(1).max(512),
}).strict();

export const LensConsoleObjectPropertiesArgsSchema =
  LensConsoleEntryDetailArgsSchema.extend({
    objectHandle: z.string().uuid(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict();

export const LensNetworkEntryDetailArgsSchema =
  LensConsoleEntryDetailArgsSchema;

export const LensNetworkBodyArgsSchema =
  LensNetworkEntryDetailArgsSchema.extend({
    kind: z.enum(["request", "response"]),
  }).strict();

export const LensSessionTargetArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    lensSessionId: z.string().min(1).max(200).optional(),
  })
  .strict();

export const LensSleepArgsSchema = LensSessionTargetArgsSchema.extend({
  lensSessionId: z.string().min(1).max(200),
  sleeping: z.boolean(),
}).strict();

export const LensKeepActiveArgsSchema = LensSessionTargetArgsSchema.extend({
  lensSessionId: z.string().min(1).max(200),
  keepActive: z.boolean(),
}).strict();

export const LensWorkspaceTargetArgsSchema = LensSessionTargetArgsSchema.pick({
  workspaceId: true,
}).strict();

export const LensAnnotationStartArgsSchema = LensSessionTargetArgsSchema.extend(
  {
    options: z
      .object({
        extractDebugSource: z.boolean().optional(),
      })
      .strict()
      .optional(),
  },
).strict();

export const LensScreenshotArgsSchema = LensSessionTargetArgsSchema.extend({
  options: z
    .object({
      fullPage: z.boolean().optional(),
      clip: z
        .object({
          x: z
            .number()
            .min(-LENS_CAPTURE_LIMITS.rectCoordinate)
            .max(LENS_CAPTURE_LIMITS.rectCoordinate),
          y: z
            .number()
            .min(-LENS_CAPTURE_LIMITS.rectCoordinate)
            .max(LENS_CAPTURE_LIMITS.rectCoordinate),
          width: z.number().positive().max(LENS_CAPTURE_LIMITS.rectSize),
          height: z.number().positive().max(LENS_CAPTURE_LIMITS.rectSize),
        })
        .strict()
        .optional(),
      documentId: z
        .string()
        .min(1)
        .max(LENS_CAPTURE_LIMITS.documentIdBytes)
        .optional(),
    })
    .strict()
    .optional(),
}).strict();

export const LensAnnotationRemoveArgsSchema =
  LensSessionTargetArgsSchema.extend({
    annotationId: z.string().min(1).max(LENS_CAPTURE_LIMITS.annotationIdBytes),
    documentId: z.string().min(1).max(LENS_CAPTURE_LIMITS.documentIdBytes),
  }).strict();

export const LensAnnotationStyleArgsSchema = LensSessionTargetArgsSchema.extend(
  {
    annotationId: z.string().min(1).max(LENS_CAPTURE_LIMITS.annotationIdBytes),
    selector: z.string().min(1).max(LENS_CAPTURE_LIMITS.selectorBytes),
    patch: z
      .record(
        z.string().min(1).max(LENS_CAPTURE_LIMITS.stylePropertyBytes),
        z.string().max(LENS_CAPTURE_LIMITS.styleValueBytes),
      )
      .refine(
        (value) =>
          Object.keys(value).length <= LENS_CAPTURE_LIMITS.styleEditItems,
        "Too many Lens style properties",
      ),
    documentId: z.string().min(1).max(LENS_CAPTURE_LIMITS.documentIdBytes),
  },
).strict();

export const SecretUpsertArgsSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2048).optional(),
    // Optional POSIX env-var name; empty string clears a previously set name.
    // The vault performs the reserved-name check and precise normalization.
    envVarName: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(ENV_VAR_NAME_MAX_LENGTH)
          .regex(ENV_VAR_NAME_PATTERN),
      ])
      .optional(),
    value: z.string().min(1).max(8192).optional(),
  })
  .strict();

export const SecretDeleteArgsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const SecretRevealArgsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const SuggestTaskNameArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
    activeProviderId: ProviderIdSchema.optional(),
    utilityModel: z.string().max(200).optional(),
    utilityMaxProviderAttempts: z.number().int().min(1).max(4).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema).optional(),
    prompt: z.string().max(2000),
    history: z
      .array(
        z
          .object({
            role: z.string().max(50),
            content: z.string().max(2000),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

export const ClassifyRouteArgsSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    phase: z.enum(["plan", "execute"]).optional(),
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
    activeProviderId: ProviderIdSchema.optional(),
    utilityModel: z.string().max(200).optional(),
    utilityMaxProviderAttempts: z.number().int().min(1).max(4).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema).optional(),
    prompt: z.string().max(8000),
    history: z
      .array(
        z
          .object({
            role: z.union([z.literal("user"), z.literal("assistant")]),
            content: z.string().max(4000),
            providerId: ProviderIdSchema.optional(),
            model: z.string().max(200).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    fileContextCount: z.number().int().min(0).max(200).optional(),
  })
  .strict();

export const CancelRouteClassificationArgsSchema = z.object({ requestId: z.string().uuid() }).strict();

export const EnhancePromptArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
    activeProviderId: ProviderIdSchema.optional(),
    utilityModel: z.string().max(200).optional(),
    utilityMaxProviderAttempts: z.number().int().min(1).max(4).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema).optional(),
    prompt: z.string().trim().min(1).max(100_000),
    // Optional reference material. Caps mirror the renderer-side clipping so a
    // misbehaving caller cannot turn the cheap lane into a long-context call.
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(2_000),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    workspaceSummary: z.string().max(4_000).optional(),
    styleProfile: z.string().max(4_000).optional(),
    exemplars: z
      .array(
        z
          .object({
            source: z.string().max(2_000),
            enhanced: z.string().max(2_000),
            outcome: z.enum(["kept", "undone"]),
            at: z.string().max(64),
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict();

export const SuggestCommitMessageArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
    activeProviderId: ProviderIdSchema.optional(),
    utilityModel: z.string().max(200).optional(),
    utilityMaxProviderAttempts: z.number().int().min(1).max(4).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema).optional(),
  })
  .strict();

export const AbortTurnArgsSchema = z
  .object({
    turnId: z.string().trim().min(1).max(200),
  })
  .strict();

export const SuggestPRDescriptionArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    baseBranch: z.string().max(200).optional(),
    /** Branch the component expects (from workspaceBranchById).  When
     *  provided the handler uses it as the authoritative branch name instead
     *  of re-detecting from git, and validates that the cwd actually matches. */
    headBranch: z.string().max(200).optional(),
    providerId: ProviderIdSchema.optional(),
    promptTemplate: z.string().max(10_000).optional(),
    workspaceContext: z.string().max(12_000).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema).optional(),
  })
  .strict();

export const ReviewDiffArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    baseBranch: z.string().max(200).optional(),
    headBranch: z.string().max(200).optional(),
    providerId: z.enum(["claude-code", "codex"]).optional(),
    model: z.string().max(200).optional(),
    mode: z.enum(["review", "intent"]).optional(),
    intentContext: z.string().max(8000).optional(),
    intentFingerprintGate: z.boolean().optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema),
  })
  .strict();

export const CreatePRArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    title: z.string().min(1).max(500),
    body: z.string().max(50_000).optional(),
    baseBranch: z.string().max(200).optional(),
    draft: z.boolean().optional(),
    autoMerge: z.boolean().optional(),
    mergeMethod: z.enum(["default", "merge", "squash", "rebase"]).optional(),
  })
  .strict();

export const TryAutoFixLintArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    paths: z.array(z.string().min(1).max(4096)).max(1000).optional(),
  })
  .strict();

export const StageFilesArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    paths: z.array(z.string().min(1).max(4096)).min(1).max(1000),
  })
  .strict();

const GitGraphRevisionSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    (value) => !value.startsWith("-") && !/[\x00-\x1f\x7f]/.test(value),
    "Git refs must not be option-like or contain control characters.",
  );

const GitCommitHashSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{7,64}$/i, "A valid commit hash is required.");

const GitPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !value.includes("\0"), "Git paths must not contain NUL.");

export const ScmGraphArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    limit: z.number().int().min(1).max(2000).optional(),
    skip: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    scope: GitGraphRevisionSchema.optional(),
    refs: z.array(GitGraphRevisionSchema).max(256).optional(),
    includeRepositoryState: z.boolean().optional(),
  })
  .strict();

export const ScmCommitDetailsArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    hash: GitCommitHashSchema,
  })
  .strict();

export const ScmCommitFilesArgsSchema = ScmCommitDetailsArgsSchema;

export const ScmCommitDiffArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    hash: GitCommitHashSchema,
    path: GitPathSchema,
    oldPath: GitPathSchema.optional(),
  })
  .strict();

const ScriptKindSchema = z.union([z.literal("action"), z.literal("service")]);
const ScriptTriggerSchema = z.union([
  z.literal("task.created"),
  z.literal("task.archiving"),
  z.literal("turn.started"),
  z.literal("turn.completed"),
  z.literal("pr.beforeOpen"),
  z.literal("pr.afterOpen"),
]);

export const WorkspaceScriptsGetConfigArgsSchema = z
  .object({
    projectPath: z.string().min(1).max(4096),
    workspacePath: z.string().min(1).max(4096),
    userOverridePath: z.string().max(4096).optional(),
  })
  .strict();

export const WorkspaceScriptsGetStatusArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
  })
  .strict();

export const WorkspaceScriptsRunEntryArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    scriptId: z.string().min(1).max(200),
    scriptKind: ScriptKindSchema,
    projectPath: z.string().min(1).max(4096),
    workspacePath: z.string().min(1).max(4096),
    workspaceName: z.string().min(1).max(200),
    branch: z.string().min(1).max(200),
  })
  .strict();

export const WorkspaceScriptsStopEntryArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    scriptId: z.string().min(1).max(200),
    scriptKind: ScriptKindSchema,
  })
  .strict();

export const WorkspaceScriptsRunHookArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    trigger: ScriptTriggerSchema,
    projectPath: z.string().min(1).max(4096),
    workspacePath: z.string().min(1).max(4096),
    workspaceName: z.string().min(1).max(200),
    branch: z.string().min(1).max(200),
    taskId: z.string().min(1).max(200).optional(),
    taskTitle: z.string().min(1).max(500).optional(),
    turnId: z.string().min(1).max(200).optional(),
  })
  .strict();

export const WorkspaceScriptsStopAllArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
  })
  .strict();

export const WorkspaceScriptsEventSubscriptionArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
  })
  .strict();

export const TerminalCreateSessionArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    workspacePath: z.string().min(1).max(4096),
    taskId: z.string().min(1).max(200).nullable(),
    taskTitle: z.string().max(500).nullable(),
    terminalTabId: z.string().min(1).max(200),
    cwd: z.string().min(1).max(4096),
    shell: z.string().max(4096).optional(),
    cols: z.number().int().min(1).max(1000).optional(),
    rows: z.number().int().min(1).max(1000).optional(),
    deliveryMode: z.union([z.literal("poll"), z.literal("push")]).optional(),
  })
  .strict();

export const CreateCursorChatIdArgsSchema = z
  .object({
    cwd: z.string().min(1).max(4096),
    cursorBinaryPath: z.string().max(4096).optional(),
  })
  .strict();

export const CliSessionCreateSessionArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    workspacePath: z.string().min(1).max(4096),
    cliSessionTabId: z.string().min(1).max(200),
    providerId: ProviderIdSchema,
    contextMode: z.union([z.literal("workspace"), z.literal("active-task")]),
    nativeSessionId: z.string().max(200).optional(),
    taskId: z.string().min(1).max(200).nullable(),
    taskTitle: z.string().max(500).nullable(),
    cwd: z.string().min(1).max(4096),
    cols: z.number().int().min(1).max(1000).optional(),
    rows: z.number().int().min(1).max(1000).optional(),
    deliveryMode: z.union([z.literal("poll"), z.literal("push")]).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema),
  })
  .strict();

export const TerminalAttachSessionArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    deliveryMode: z.union([z.literal("poll"), z.literal("push")]),
  })
  .strict();

export const TerminalDetachSessionArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    attachmentId: z.string().min(1).max(200).optional(),
  })
  .strict();

export const TerminalResumeSessionStreamArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    attachmentId: z.string().min(1).max(200),
  })
  .strict();

export const TerminalAckSessionOutputArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    attachmentId: z.string().min(1).max(200),
    acknowledgedBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const TerminalGetSlotStateArgsSchema = z
  .object({
    slotKey: z.string().min(1).max(600),
  })
  .strict();

export const TerminalGetSessionResumeInfoArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
  })
  .strict();

export const ShowNativeNotificationArgsSchema = z
  .object({
    notificationId: z.string().min(1).max(200),
    title: z.string().min(1).max(500),
    body: z.string().max(4000),
    suppress: z.boolean().optional(),
  })
  .strict();

export const SetNotificationBadgeArgsSchema = z
  .object({
    count: z.number().int().min(0).max(999_999),
  })
  .strict();

export const RendererIssueReportArgsSchema = z
  .object({
    scope: z.string().min(1).max(100),
    context: z.string().min(1).max(100),
    message: z.string().min(1).max(4000),
    stack: z.string().max(20_000).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const GetPrStatusByUrlArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    url: z.string().url().max(4096),
  })
  .strict();

/**
 * PR review + failed-CI context. Both channels take a PR URL rather than a
 * caller-chosen owner/repo pair so the host service can re-derive the target
 * itself; the renderer never gets to shape a `gh` argument list.
 */
export const FetchPrContextIndexArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    prUrl: z.string().url().max(PR_CONTEXT_LIMITS.maxUrlChars),
  })
  .strict();

export const FetchPrCheckLogsArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    prUrl: z.string().url().max(PR_CONTEXT_LIMITS.maxUrlChars),
    headSha: z
      .string()
      .min(7)
      .max(64)
      .regex(/^[0-9a-fA-F]+$/, "headSha must be a hex commit id"),
    checkIds: z
      .array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
      .max(PR_CONTEXT_LIMITS.maxSelectedChecks),
  })
  .strict();

export const ListGitHubPrsArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    kind: z.enum(["review-requested", "authored"]),
    limit: z
      .number()
      .int()
      .min(1)
      .max(GITHUB_PR_REVIEW_LIMITS.maxInboxItems)
      .optional(),
  })
  .strict();

export const GetGitHubPrReviewDetailArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    prUrl: z.string().url().max(GITHUB_PR_REVIEW_LIMITS.maxUrlChars),
  })
  .strict();

export const SubmitGitHubPrReviewArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    prUrl: z.string().url().max(GITHUB_PR_REVIEW_LIMITS.maxUrlChars),
    expectedHeadOid: z
      .string()
      .min(7)
      .max(64)
      .regex(/^[0-9a-fA-F]+$/, "expectedHeadOid must be a hex commit id"),
    event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
    body: z.string().max(GITHUB_PR_REVIEW_LIMITS.maxReviewBodyChars).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.event === "REQUEST_CHANGES" && !value.body?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "A change request needs a review summary.",
      });
    }
  });

export const SkillCatalogArgsSchema = z
  .object({
    workspacePath: z.string().max(4096).optional(),
    sharedSkillsHome: z.string().max(4096).optional(),
  })
  .strict();

export const LocalMcpConfigUpdateArgsSchema = z
  .object({
    enabled: z.boolean().optional(),
    port: z.number().int().min(0).max(65_535).optional(),
    token: z.string().max(4096).optional(),
    claudeCodeAutoRegister: z.boolean().optional(),
    codexAutoRegister: z.boolean().optional(),
    browserToolsEnabled: z.boolean().optional(),
  })
  .strict();

export const ListLocalMcpRequestLogsArgsSchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
    includePayload: z.boolean().optional(),
  })
  .strict();

export const GetLocalMcpRequestLogArgsSchema = z
  .object({
    id: z.string().min(1).max(200),
    includePayload: z.boolean().optional(),
  })
  .strict();

export const LocalMcpApprovalResponseArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    taskId: z.string().min(1).max(200),
    requestId: z.string().min(1).max(200),
    approved: z.boolean(),
  })
  .strict();

export const LocalMcpUserInputResponseArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    taskId: z.string().min(1).max(200),
    requestId: z.string().min(1).max(200),
    answers: z.record(z.string(), z.string()).optional(),
    denied: z.boolean().optional(),
  })
  .strict();

export const CheckAvailabilityArgsSchema = z
  .object({
    providerId: ProviderIdSchema,
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

const ConnectedToolIdSchema = z.union([
  z.literal("slack"),
  z.literal("atlassian"),
  z.literal("figma"),
  z.literal("github"),
]);

export const ProviderCommandCatalogArgsSchema = z
  .object({
    providerId: ProviderIdSchema,
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const ConnectedToolStatusArgsSchema = z
  .object({
    providerId: ProviderIdSchema,
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
    toolIds: z.array(ConnectedToolIdSchema).max(8).optional(),
  })
  .strict();

export const ClaudeRuntimeActionArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const ClaudeSessionForkArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    upToMessageId: z.string().min(1).max(200),
    title: z.string().trim().min(1).max(200).optional(),
    cwd: z.string().max(4096).optional(),
  })
  .strict();

export const ClaudeFileRewindArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    userMessageId: z.string().min(1).max(200),
    dryRun: z.boolean(),
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const ClaudeSessionRenameArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    cwd: z.string().max(4096).optional(),
  })
  .strict();

const McpConfigMutationBaseSchema = z.object({
  cwd: z.string().max(4096).optional(),
  runtimeOptions: RuntimeOptionsSchema,
});

const McpConfigCreateMutationSchema = McpConfigMutationBaseSchema.extend({
  operation: z.literal("create"),
  draft: McpServerConfigDraftSchema,
  installProviders: z.array(McpConfigProviderSchema).min(1).max(4).optional(),
}).strict();
const McpConfigUpdateMutationSchema = McpConfigMutationBaseSchema.extend({
  operation: z.literal("update"),
  target: McpServerConfigTargetSchema,
  draft: McpServerConfigDraftSchema,
}).strict();
const McpConfigDeleteMutationSchema = McpConfigMutationBaseSchema.extend({
  operation: z.literal("delete"),
  target: McpServerConfigTargetSchema,
}).strict();
const McpConfigShareMutationSchema = McpConfigMutationBaseSchema.extend({
  operation: z.literal("share"),
  target: McpServerConfigTargetSchema,
  destination: McpServerConfigTargetSchema,
}).strict();

export const McpServerConfigListArgsSchema =
  McpConfigMutationBaseSchema.strict();
export const McpServerConfigMutationArgsSchema = z.discriminatedUnion(
  "operation",
  [
    McpConfigCreateMutationSchema,
    McpConfigUpdateMutationSchema,
    McpConfigDeleteMutationSchema,
    McpConfigShareMutationSchema,
  ],
);
export const McpServerConfigMutationApplyArgsSchema = z.discriminatedUnion(
  "operation",
  [
    McpConfigCreateMutationSchema.extend({
      expectedRevision: z.string().min(1).max(256),
    }).strict(),
    McpConfigUpdateMutationSchema.extend({
      expectedRevision: z.string().min(1).max(256),
    }).strict(),
    McpConfigDeleteMutationSchema.extend({
      expectedRevision: z.string().min(1).max(256),
    }).strict(),
    McpConfigShareMutationSchema.extend({
      expectedRevision: z.string().min(1).max(256),
    }).strict(),
  ],
);
export const CodexRuntimeActionArgsSchema = ClaudeRuntimeActionArgsSchema;

export const ProviderModelCatalogArgsSchema = z
  .object({
    providerId: ProviderIdSchema,
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const RateLimitsSnapshotArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
    providers: z.array(ProviderIdSchema).min(1).max(4).optional(),
    force: z.boolean().optional(),
    reason: z.enum(["manual", "dispatch-guard"]).optional(),
  })
  .strict();

export const CodexPluginDetailArgsSchema = z
  .object({
    marketplacePath: z.string().min(1).max(4096),
    pluginName: z.string().min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexPluginInstallArgsSchema = CodexPluginDetailArgsSchema;

export const CodexPluginUninstallArgsSchema = z
  .object({
    pluginId: z.string().min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexExperimentalFeatureEnablementArgsSchema = z
  .object({
    enablement: z.record(z.string().max(200), z.boolean()),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexMcpOauthLoginArgsSchema = z
  .object({
    name: z.string().min(1).max(200),
    scopes: z.array(z.string().min(1).max(200)).max(32).optional(),
    timeoutSecs: z.number().int().min(1).max(86_400).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const ClaudeMcpOauthLoginArgsSchema = z
  .object({
    name: z.string().min(1).max(200),
    cwd: z.string().max(4096).optional(),
    timeoutSecs: z.number().int().min(1).max(86_400).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CursorMcpOauthLoginArgsSchema = z
  .object({
    name: z.string().min(1).max(200),
    cwd: z.string().max(4096).optional(),
    timeoutSecs: z.number().int().min(1).max(86_400).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexMcpResourceReadArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    server: z.string().min(1).max(200),
    uri: z.string().min(1).max(4096),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexThreadRenameArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexThreadReadArgsSchema = z
  .object({
    includeTurns: z.boolean().optional(),
    threadId: z.string().min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexThreadForkArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    lastTurnId: z.string().min(1).max(200).optional(),
    beforeTurnId: z.string().min(1).max(200).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict()
  .refine((value) => !(value.lastTurnId && value.beforeTurnId), {
    message: "lastTurnId and beforeTurnId cannot be combined.",
  });

export const CodexThreadArchiveArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    archived: z.boolean().optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexThreadCompactArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexThreadRollbackArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    numTurns: z.number().int().min(1).max(100),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexReviewTargetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("uncommittedChanges"),
    })
    .strict(),
  z
    .object({
      type: z.literal("baseBranch"),
      baseBranch: z.string().min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("commit"),
      sha: z.string().min(1).max(200),
      title: z.string().max(200).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("custom"),
      instructions: z.string().min(1).max(20_000),
    })
    .strict(),
]);

export const CodexReviewStartArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    delivery: z.union([z.literal("inline"), z.literal("detached")]).optional(),
    target: CodexReviewTargetSchema,
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexExternalConfigImportItemSchema = z
  .object({
    itemType: z.string().min(1).max(100),
    description: z.string().min(1).max(10_000),
    cwd: z.string().max(4096).nullable(),
  })
  .strict();

export const CodexExternalConfigImportArgsSchema = z
  .object({
    migrationItems: z.array(CodexExternalConfigImportItemSchema).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexConfigValueWriteArgsSchema = z
  .object({
    keyPath: z.string().min(1).max(512),
    value: z.unknown(),
    mergeStrategy: z.string().min(1).max(40).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexConfigBatchEditSchema = z
  .object({
    keyPath: z.string().min(1).max(512),
    value: z.unknown(),
    mergeStrategy: z.string().min(1).max(40).optional(),
  })
  .strict();

export const CodexConfigBatchWriteArgsSchema = z
  .object({
    edits: z.array(CodexConfigBatchEditSchema).min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const StreamReadArgsSchema = z
  .object({
    streamId: z.string().min(1).max(200),
    cursor: z.number().int().min(0),
  })
  .strict();

export const StreamAckArgsSchema = z
  .object({
    streamId: z.string().min(1).max(200),
    cursor: z.number().int().min(0),
  })
  .strict();

export const CleanupTaskArgsSchema = z
  .object({
    taskId: z.string().min(1).max(200),
  })
  .strict();

export const ApprovalResponseArgsSchema = z
  .object({
    turnId: z.string().min(1).max(200),
    requestId: z.string().min(1).max(200),
    approved: z.boolean(),
    reason: z.string().max(10_000).optional(),
    scope: z.enum(["once", "always"]).optional(),
  })
  .strict();

export const UserInputResponseArgsSchema = z
  .object({
    turnId: z.string().min(1).max(200),
    requestId: z.string().min(1).max(200),
    answers: z.record(z.string(), z.string()).optional(),
    denied: z.boolean().optional(),
  })
  .strict();

export const SteerTurnArgsSchema = z
  .object({
    turnId: z.string().min(1).max(200),
    text: z.string().min(1).max(500_000),
    /**
     * Renderer's `settings.midTurnSteeringEnabled` value. When explicitly
     * `true` it enables steering regardless of the legacy
     * `STAVE_ENABLE_MID_TURN_STEERING` env var; when omitted/false the env
     * var still works as a fallback (see `runtime.ts`'s `steerTurn`).
     */
    enabled: z.boolean().optional(),
    clientMessageId: z.string().min(1).max(200).optional(),
  })
  .strict();

export const WorkspaceIdArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
  })
  .strict();

export const LoadTaskMessagesArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    taskId: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(500).optional(),
    offset: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();

export const TruncateTaskMessagesAfterArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    taskId: z.string().min(1).max(200),
    messageId: z.string().min(1).max(200),
  })
  .strict();

export const LoadWorkspaceEditorTabBodiesArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    tabIds: z.array(z.string().min(1).max(4096)).min(1).max(200),
  })
  .strict();

const NotificationActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("approval"),
      requestId: z.string().min(1).max(200),
      messageId: z.string().min(1).max(200).nullable().optional(),
    })
    .strict(),
]);

const NotificationPayloadSchema = z.record(z.string(), z.unknown());

export const NotificationRecordSchema = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.union([
      z.literal("task.turn_completed"),
      z.literal("task.turn_failed"),
      z.literal("task.approval_requested"),
      z.literal("task.user_input_requested"),
    ]),
    title: z.string().min(1).max(500),
    body: z.string().max(5000),
    projectPath: z.string().max(4096).nullable().optional(),
    projectName: z.string().max(500).nullable().optional(),
    workspaceId: z.string().max(200).nullable().optional(),
    workspaceName: z.string().max(500).nullable().optional(),
    taskId: z.string().max(200).nullable().optional(),
    taskTitle: z.string().max(500).nullable().optional(),
    turnId: z.string().max(200).nullable().optional(),
    providerId: ProviderIdSchema.nullable().optional(),
    action: NotificationActionSchema.nullable().optional(),
    payload: NotificationPayloadSchema.optional(),
    createdAt: z.string().max(100),
    readAt: z.string().max(100).nullable().optional(),
    resolvedAt: z.string().max(100).nullable().optional(),
    expiresAt: z.string().max(100).nullable().optional(),
  })
  .strict();

export const CreateNotificationArgsSchema = z
  .object({
    notification: NotificationRecordSchema.omit({
      createdAt: true,
      readAt: true,
    })
      .extend({
        createdAt: z.string().max(100).optional(),
        readAt: z.string().max(100).nullable().optional(),
        dedupeKey: z.string().max(500).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const ListNotificationsArgsSchema = z
  .object({
    limit: z.number().int().min(1).max(500).optional(),
    unreadOnly: z.boolean().optional(),
  })
  .strict()
  .optional();

export const MarkNotificationReadArgsSchema = z
  .object({
    id: z.string().min(1).max(200),
    readAt: z.string().max(100).optional(),
    resolvedAt: z.string().max(100).optional(),
  })
  .strict();

export const MarkAllNotificationsReadArgsSchema = z
  .object({
    readAt: z.string().max(100).optional(),
  })
  .strict()
  .optional();

export const PruneNotificationsArgsSchema = z
  .object({
    now: z.string().max(100).optional(),
  })
  .strict()
  .optional();

export const DeleteWorkspaceNotificationsArgsSchema = z
  .object({
    workspaceIds: z.array(z.string().min(1).max(200)).max(5000),
  })
  .strict();

export const ClearNotificationHistoryArgsSchema = z
  .object({})
  .strict()
  .optional();

export const PersistenceUpsertArgsSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    snapshot: WorkspaceSnapshotSchema,
  })
  .strict();

export const SaveProjectRegistryArgsSchema = z
  .object({
    projects: z.array(z.record(z.string(), z.unknown())).max(100),
    activeProjectPath: z.string().trim().min(1).max(4096).nullable().optional(),
  })
  .strict();

export const ListTaskTurnsArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    taskId: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const ListLatestWorkspaceTurnsArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

export const ListActiveWorkspaceTurnsArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

export const OpenExternalArgsSchema = z
  .object({
    url: z.string().min(1).max(2048),
  })
  .strict();

export const OpenPathArgsSchema = z
  .object({
    path: z.string().min(1).max(4096),
  })
  .strict();

export const ToolingStatusArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    claudeBinaryPath: z.string().max(4096).optional(),
    codexBinaryPath: z.string().max(4096).optional(),
    cursorBinaryPath: z.string().max(4096).optional(),
    kiroBinaryPath: z.string().max(4096).optional(),
    kiroEffort: z
      .union([
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
      ])
      .optional(),
  })
  .strict();

export const SyncOriginMainArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
  })
  .strict();

const FilesystemRootPathSchema = z.string().min(1).max(4096);
const FilesystemFilePathSchema = z.string().min(1).max(4096);

export const FilesystemRootArgsSchema = z
  .object({
    rootPath: FilesystemRootPathSchema,
  })
  .strict();

export const FilesystemPickFilesArgsSchema = FilesystemRootArgsSchema;

export const FilesystemDirectoryArgsSchema = z
  .object({
    rootPath: FilesystemRootPathSchema,
    directoryPath: z.string().max(4096).optional(),
  })
  .strict();

export const FilesystemFileArgsSchema = z
  .object({
    rootPath: FilesystemRootPathSchema,
    filePath: FilesystemFilePathSchema,
  })
  .strict();

export const FilesystemCreateDirectoryArgsSchema = z
  .object({
    rootPath: FilesystemRootPathSchema,
    directoryPath: FilesystemFilePathSchema,
  })
  .strict();

export const FilesystemCreateFileArgsSchema = FilesystemFileArgsSchema;

export const FilesystemDeleteDirectoryArgsSchema =
  FilesystemCreateDirectoryArgsSchema;

export const FilesystemDeleteFileArgsSchema = FilesystemFileArgsSchema;

export const FilesystemWriteFileArgsSchema = FilesystemFileArgsSchema.extend({
  content: z.string(),
  expectedRevision: z.string().max(4096).nullable().optional(),
}).strict();

const LspLanguageIdSchema = z.union([
  z.literal("python"),
  z.literal("typescript"),
]);

const LspBaseRequestSchema = z
  .object({
    rootPath: z.string().min(1).max(4096),
    languageId: LspLanguageIdSchema,
    commandOverride: z.string().max(4096).optional(),
  })
  .strict();

export const LspSyncDocumentArgsSchema = LspBaseRequestSchema.extend({
  filePath: z.string().min(1).max(4096),
  documentLanguageId: z.string().min(1).max(200),
  text: z.string().max(2_000_000),
  version: z.number().int().min(1),
}).strict();

export const LspCloseDocumentArgsSchema = LspBaseRequestSchema.extend({
  filePath: z.string().min(1).max(4096),
}).strict();

export const LspRequestArgsSchema = LspBaseRequestSchema.extend({
  filePath: z.string().min(1).max(4096),
  line: z.number().int().min(0).max(2_000_000),
  character: z.number().int().min(0).max(20_000),
}).strict();

export const LspStopSessionsArgsSchema = z
  .object({
    rootPath: z.string().max(4096).optional(),
  })
  .strict();

export const EslintRequestArgsSchema = z
  .object({
    rootPath: z.string().min(1).max(4096),
    filePath: z.string().min(1).max(4096),
    text: z.string().max(2_000_000),
  })
  .strict();

export const RoutineCreateArgsSchema = RoutineUpsertInputSchema;

export const RoutineUpdateArgsSchema = z
  .object({
    id: z.string().uuid(),
    input: RoutineUpsertInputSchema,
  })
  .strict();

export const RoutineIdArgsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const RoutineSetEnabledArgsSchema = z
  .object({
    id: z.string().uuid(),
    enabled: z.boolean(),
  })
  .strict();

export const RoutineInformationReferencesArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(4096),
  })
  .strict();

export const RoutineInformationResourceCreateArgsSchema =
  RoutineInformationResourceCreateInputSchema;

export const PersistenceFlushCompleteArgsSchema = z
  .object({
    requestId: z.number().int().nonnegative(),
    success: z.boolean(),
  })
  .strict();

export const StorageCleanupArgsSchema = z
  .object({
    deleteOrphanedPartitions: z.boolean().optional(),
    clearLensCaches: z.enum(["none", "oversized", "all"]).optional(),
    deleteStaleDatabaseFiles: z.boolean().optional(),
  })
  .strict();

export {
  ProjectMemoryDeleteArgsSchema,
  ProjectMemoryListArgsSchema,
  ProjectMemoryRecallArgsSchema,
  ProjectMemoryRememberArgsSchema,
  ProjectMemoryUpdateArgsSchema,
} from "../../../src/lib/project-memory";
