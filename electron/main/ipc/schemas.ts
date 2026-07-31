import { z } from "zod";
import {
  RoutineInformationResourceCreateInputSchema,
  RoutineUpsertInputSchema,
} from "../../../src/lib/routines";
import { LENS_CAPTURE_LIMITS } from "../../../src/lib/lens/lens-annotation-schema";
import {
  ENV_VAR_NAME_MAX_LENGTH,
  ENV_VAR_NAME_PATTERN,
  MAX_BOUND_SECRETS,
} from "../../../src/lib/secrets/secrets";
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

const MAX_PROVIDER_TIMEOUT_MS = 86_400_000;

export const RoutineProviderTimeoutArgsSchema = z
  .object({
    providerTimeoutMs: z.number().int().min(1).max(MAX_PROVIDER_TIMEOUT_MS),
  })
  .strict();

export const ProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
]);

export const McpDiscoveryArgsSchema = z
  .object({ cwd: z.string().max(4096).optional() })
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
    utilityProviderId: z
      .union([z.literal("auto"), ProviderIdSchema])
      .optional(),
    activeProviderId: ProviderIdSchema.optional(),
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
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z
      .union([z.literal("auto"), ProviderIdSchema])
      .optional(),
    activeProviderId: ProviderIdSchema.optional(),
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

export const SuggestCommitMessageArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z
      .union([z.literal("auto"), ProviderIdSchema])
      .optional(),
    activeProviderId: ProviderIdSchema.optional(),
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
    providerId: ProviderIdSchema.optional(),
    model: z.string().max(200).optional(),
    mode: z.enum(["review", "intent"]).optional(),
    intentContext: z.string().max(8000).optional(),
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

export const CliSessionCreateSessionArgsSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    workspacePath: z.string().min(1).max(4096),
    cliSessionTabId: z.string().min(1).max(200),
    providerId: z.union([z.literal("claude-code"), z.literal("codex")]),
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

export const RuntimeOptionsObjectSchema = z
  .object({
    model: z.string().max(200).optional(),
    chatStreamingEnabled: z.boolean().optional(),
    debug: z.boolean().optional(),
    providerTimeoutMs: z
      .number()
      .int()
      .min(1)
      .max(MAX_PROVIDER_TIMEOUT_MS)
      .optional(),
    claudeBinaryPath: z.string().max(4096).optional(),
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
    claudePlanModeApprovalScope: z
      .union([
        z.literal("strict"),
        z.literal("bash"),
        z.literal("bashAndTask"),
        z.literal("bashTaskAndMcp"),
      ])
      .optional(),
    claudeAllowDangerouslySkipPermissions: z.boolean().optional(),
    claudeSandboxEnabled: z.boolean().optional(),
    claudeAllowUnsandboxedCommands: z.boolean().optional(),
    claudeSystemPrompt: z.string().max(20_000).optional(),
    claudeMaxTurns: z.number().int().min(1).max(200).optional(),
    claudeMaxBudgetUsd: z.number().min(0).max(10_000).optional(),
    claudeTaskBudgetTokens: z.number().int().min(1).max(1_000_000).optional(),
    claudeSettingSources: z
      .array(
        z.union([z.literal("user"), z.literal("project"), z.literal("local")]),
      )
      .max(3)
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
    claudeThinkingMode: z
      .union([
        z.literal("adaptive"),
        z.literal("enabled"),
        z.literal("disabled"),
      ])
      .optional(),
    claudeAgentProgressSummaries: z.boolean().optional(),
    claudePromptSuggestions: z.boolean().optional(),
    claudeForwardSubagentText: z.boolean().optional(),
    claudeEnableFileCheckpointing: z.boolean().optional(),
    claudeForkSession: z.boolean().optional(),
    claudeStrictMcpConfig: z.boolean().optional(),
    claudeFastMode: z.boolean().optional(),
    claudeAllowedTools: z.array(z.string().max(200)).max(200).optional(),
    claudeDisallowedTools: z.array(z.string().max(200)).max(200).optional(),
    trustedTools: z.array(z.string().max(500)).max(200).optional(),
    claudeSkills: z
      .union([z.literal("all"), z.array(z.string().max(200)).max(200)])
      .optional(),
    claudePluginPaths: z.array(z.string().max(4096)).max(50).optional(),
    claudeAgentName: z.string().max(200).optional(),
    claudeFallbackModel: z.string().max(500).optional(),
    claudeResumeSessionId: z.string().max(200).optional(),
    claudeResumeSessionAt: z.string().max(200).optional(),
    codexFileAccess: z
      .union([
        z.literal("read-only"),
        z.literal("workspace-write"),
        z.literal("danger-full-access"),
      ])
      .optional(),
    codexNetworkAccess: z.boolean().optional(),
    codexApprovalPolicy: z
      .union([
        z.literal("never"),
        z.literal("on-request"),
        z.literal("on-failure"),
        z.literal("untrusted"),
      ])
      .optional(),
    codexAutoApproveStaveLocalMcpTools: z.boolean().optional(),
    codexBinaryPath: z.string().max(4096).optional(),
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
    codexWebSearch: z
      .union([z.literal("disabled"), z.literal("cached"), z.literal("live")])
      .optional(),
    codexShowRawReasoning: z.boolean().optional(),
    codexReasoningSummary: z
      .union([
        z.literal("auto"),
        z.literal("concise"),
        z.literal("detailed"),
        z.literal("none"),
      ])
      .optional(),
    codexReasoningSummarySupport: z
      .union([z.literal("auto"), z.literal("enabled"), z.literal("disabled")])
      .optional(),
    codexFastMode: z.boolean().optional(),
    codexPlanMode: z.boolean().optional(),
    codexResumeThreadId: z.string().max(200).optional(),
    advisorTarget: z
      .object({
        providerId: ProviderIdSchema,
        model: z.string().trim().min(1).max(200),
      })
      .strict()
      .optional(),
    responseStylePrompt: z.string().max(10_000).optional(),
    promptPrDescription: z.string().max(10_000).optional(),
    promptInlineCompletion: z.string().max(10_000).optional(),
    // Ids of vault secrets the user bound to this task. Values are NEVER carried
    // here — the main process resolves ids to an env map at spawn/thread-start.
    boundSecretIds: z
      .array(z.string().uuid())
      .max(MAX_BOUND_SECRETS)
      .optional(),
  })
  .strict();

export const RuntimeOptionsSchema = RuntimeOptionsObjectSchema.optional();

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

const UserInputOptionSchema = z
  .object({
    label: z.string().max(500),
    description: z.string().max(5000),
  })
  .strict();

const UserInputQuestionSchema = z
  .object({
    key: z.string().max(200).optional(),
    question: z.string().max(5000),
    header: z.string().max(200),
    options: z.array(UserInputOptionSchema).max(20),
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
    placeholder: z.string().max(500).optional(),
    allowCustom: z.boolean().optional(),
    defaultValue: z.string().max(5000).optional(),
    linkUrl: z.string().max(5000).optional(),
  })
  .strict();

const CanonicalMessagePartSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().max(500_000),
      segmentId: z.string().max(200).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("thinking"),
      text: z.string().max(500_000),
      isStreaming: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_use"),
      toolUseId: z.string().max(200).optional(),
      toolName: z.string().max(200),
      input: z.string().max(500_000),
      output: z.string().max(500_000).optional(),
      state: z.union([
        z.literal("input-streaming"),
        z.literal("input-available"),
        z.literal("output-available"),
        z.literal("output-error"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("code_diff"),
      filePath: z.string().max(4096),
      oldContent: z.string().max(500_000),
      newContent: z.string().max(500_000),
      status: z.union([
        z.literal("pending"),
        z.literal("accepted"),
        z.literal("rejected"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("file_context"),
      filePath: z.string().max(4096),
      content: z.string().max(500_000),
      language: z.string().max(200),
      instruction: z.string().max(5000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("approval"),
      toolName: z.string().max(200),
      description: z.string().max(5000),
      input: z.string().max(500_000).optional(),
      requestId: z.string().max(200),
      state: z.union([
        z.literal("approval-requested"),
        z.literal("approval-responded"),
        z.literal("approval-interrupted"),
        z.literal("output-denied"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("user_input"),
      requestId: z.string().max(200),
      toolName: z.string().max(200),
      questions: z.array(UserInputQuestionSchema).max(20),
      answers: z.record(z.string(), z.string()).optional(),
      state: z.union([
        z.literal("input-requested"),
        z.literal("input-responded"),
        z.literal("input-interrupted"),
        z.literal("input-denied"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("image_context"),
      dataUrl: z.string().max(10_000_000),
      label: z.string().max(500),
      mimeType: z.string().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace_information_context"),
      reference: z
        .object({
          section: z.union([
            z.literal("turn-summary"),
            z.literal("notes"),
            z.literal("todo"),
            z.literal("pr"),
            z.literal("jira"),
            z.literal("confluence"),
            z.literal("storybook"),
            z.literal("slack"),
            z.literal("figma"),
            z.literal("custom"),
          ]),
          scope: z.union([z.literal("section"), z.literal("item")]),
          itemId: z.string().max(4096).optional(),
          label: z.string().max(500),
          token: z.string().max(500),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("system_event"),
      content: z.string().max(500_000),
      compactBoundary: z
        .object({
          trigger: z.string().max(200).optional(),
          gitRef: z.string().max(200).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);

const CanonicalContextPartSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("file_context"),
      filePath: z.string().max(4096),
      content: z.string().max(500_000),
      language: z.string().max(200),
      instruction: z.string().max(5000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("image_context"),
      dataUrl: z.string().max(10_000_000),
      label: z.string().max(500),
      mimeType: z.string().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("skill_context"),
      skills: z
        .array(
          z
            .object({
              id: z.string().max(4096),
              slug: z.string().max(200),
              name: z.string().max(200),
              description: z.string().max(10_000),
              scope: z.union([
                z.literal("global"),
                z.literal("user"),
                z.literal("local"),
              ]),
              provider: z.union([
                z.literal("claude-code"),
                z.literal("codex"),
                z.literal("shared"),
              ]),
              path: z.string().max(4096),
              invocationToken: z.string().max(300),
              instructions: z.string().max(500_000),
            })
            .strict(),
        )
        .max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal("retrieved_context"),
      sourceId: z.string().max(200),
      title: z.string().max(500).optional(),
      content: z.string().max(500_000),
    })
    .strict(),
]);

const CanonicalConversationMessageSchema = z
  .object({
    messageId: z.string().max(200).optional(),
    role: z.union([z.literal("user"), z.literal("assistant")]),
    providerId: z.union([ProviderIdSchema, z.literal("user")]).optional(),
    model: z.string().max(200).optional(),
    content: z.string().max(500_000),
    parts: z.array(CanonicalMessagePartSchema).max(500),
    isPlanResponse: z.boolean().optional(),
    planText: z.string().max(500_000).optional(),
  })
  .strict();

const CanonicalConversationRequestSchema = z
  .object({
    turnId: z.string().min(1).max(200).optional(),
    taskId: z.string().max(200).optional(),
    workspaceId: z.string().max(200).optional(),
    target: z
      .object({
        providerId: ProviderIdSchema,
        model: z.string().max(200).optional(),
      })
      .strict(),
    mode: z.union([z.literal("chat"), z.literal("review")]),
    history: z.array(CanonicalConversationMessageSchema).max(1000),
    input: CanonicalConversationMessageSchema.extend({
      role: z.literal("user"),
    }),
    contextParts: z.array(CanonicalContextPartSchema).max(200),
    resume: z
      .object({
        nativeSessionId: z.string().max(200).optional(),
        syncedThroughMessageId: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const StreamTurnArgsSchema = z
  .object({
    turnId: z.string().min(1).max(200).optional(),
    providerId: ProviderIdSchema,
    prompt: z.string().max(500_000),
    conversation: CanonicalConversationRequestSchema.optional(),
    taskId: z.string().max(200).optional(),
    workspaceId: z.string().max(200).optional(),
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

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
    title: z.string().min(1).max(200).optional(),
    cwd: z.string().max(4096).optional(),
  })
  .strict();

export const ClaudeSessionRenameArgsSchema = z
  .object({
    sessionId: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
    cwd: z.string().max(4096).optional(),
  })
  .strict();

export const CodexRuntimeActionArgsSchema = ClaudeRuntimeActionArgsSchema;

export const RateLimitsSnapshotArgsSchema = ClaudeRuntimeActionArgsSchema;

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
    threadId: z.string().min(1).max(200),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

export const CodexThreadForkArgsSchema = z
  .object({
    threadId: z.string().min(1).max(200),
    lastTurnId: z.string().min(1).max(200).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();

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
    snapshot: z.record(z.string(), z.unknown()),
  })
  .strict();

export const SaveProjectRegistryArgsSchema = z
  .object({
    projects: z.array(z.record(z.string(), z.unknown())).max(100),
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

export const FilesystemRepoMapArgsSchema = FilesystemRootArgsSchema.extend({
  refresh: z.boolean().optional(),
}).strict();

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
