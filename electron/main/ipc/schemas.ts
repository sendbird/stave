import { z } from "zod";

const MAX_PROVIDER_TIMEOUT_MS = 10_800_000;

export const ProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
  z.literal("stave"),
]);

export const SuggestTaskNameArgsSchema = z
  .object({
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

export const SuggestCommitMessageArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
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
    promptTemplate: z.string().max(10_000).optional(),
    workspaceContext: z.string().max(12_000).optional(),
  })
  .strict();

export const CreatePRArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    title: z.string().min(1).max(500),
    body: z.string().max(50_000).optional(),
    baseBranch: z.string().max(200).optional(),
    draft: z.boolean().optional(),
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
    claudeFastMode: z.boolean().optional(),
    claudeAllowedTools: z.array(z.string().max(200)).max(200).optional(),
    claudeDisallowedTools: z.array(z.string().max(200)).max(200).optional(),
    claudeAdvisorModel: z.string().max(200).optional(),
    claudeResumeSessionId: z.string().max(200).optional(),
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
        z.literal("untrusted"),
      ])
      .optional(),
    codexBinaryPath: z.string().max(4096).optional(),
    codexReasoningEffort: z
      .union([
        z.literal("minimal"),
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
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
    staveAuto: z
      .object({
        classifierModel: z.string().max(200),
        supervisorModel: z.string().max(200),
        planModel: z.string().max(200),
        analyzeModel: z.string().max(200),
        implementModel: z.string().max(200),
        quickEditModel: z.string().max(200),
        generalModel: z.string().max(200),
        verifyModel: z.string().max(200).optional(),
        orchestrationMode: z.union([
          z.literal("off"),
          z.literal("auto"),
          z.literal("aggressive"),
        ]),
        maxSubtasks: z.number().int().min(1).max(8),
        maxParallelSubtasks: z.number().int().min(1).max(8),
        allowCrossProviderWorkers: z.boolean(),
        claudeFastModeSupported: z.boolean().optional(),
        codexFastModeSupported: z.boolean().optional(),
        fastMode: z.boolean().optional(),
        roleRuntimeOverrides: z
          .object({
            classifier: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            supervisor: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            plan: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            analyze: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            implement: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            quick_edit: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            general: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
            verify: z
              .object({
                claude: z
                  .object({
                    permissionMode: z
                      .union([
                        z.literal("default"),
                        z.literal("acceptEdits"),
                        z.literal("bypassPermissions"),
                        z.literal("plan"),
                        z.literal("dontAsk"),
                        z.literal("auto"),
                      ])
                      .optional(),
                    thinkingMode: z
                      .union([
                        z.literal("adaptive"),
                        z.literal("enabled"),
                        z.literal("disabled"),
                      ])
                      .optional(),
                    effort: z
                      .union([
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                        z.literal("max"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
                codex: z
                  .object({
                    approvalPolicy: z
                      .union([
                        z.literal("never"),
                        z.literal("on-request"),
                        z.literal("untrusted"),
                      ])
                      .optional(),
                    reasoningEffort: z
                      .union([
                        z.literal("minimal"),
                        z.literal("low"),
                        z.literal("medium"),
                        z.literal("high"),
                        z.literal("xhigh"),
                      ])
                      .optional(),
                    fastMode: z.boolean().optional(),
                  })
                  .strict(),
              })
              .strict(),
          })
          .strict()
          .optional(),
        promptSupervisorBreakdown: z.string().max(10_000).optional(),
        promptSupervisorSynthesis: z.string().max(10_000).optional(),
        promptPreprocessorClassifier: z.string().max(10_000).optional(),
      })
      .strict()
      .optional(),
    responseStylePrompt: z.string().max(10_000).optional(),
    promptPrDescription: z.string().max(10_000).optional(),
    promptInlineCompletion: z.string().max(10_000).optional(),
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
  z
    .object({
      type: z.literal("stave_processing"),
      strategy: z.union([z.literal("direct"), z.literal("orchestrate")]),
      model: z.string().max(200).optional(),
      supervisorModel: z.string().max(200).optional(),
      reason: z.string().max(5000),
      fastModeRequested: z.boolean().optional(),
      fastModeApplied: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("orchestration_progress"),
      supervisorModel: z.string().max(200),
      subtasks: z
        .array(
          z
            .object({
              id: z.string().max(200),
              title: z.string().max(5000),
              model: z.string().max(200),
              status: z.union([
                z.literal("pending"),
                z.literal("running"),
                z.literal("done"),
                z.literal("error"),
              ]),
            })
            .strict(),
        )
        .max(32),
      status: z.union([
        z.literal("planning"),
        z.literal("executing"),
        z.literal("synthesizing"),
        z.literal("done"),
      ]),
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

export const CodexRuntimeActionArgsSchema = ClaudeRuntimeActionArgsSchema;

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
  z.object({
    type: z.literal("uncommittedChanges"),
  }).strict(),
  z.object({
    type: z.literal("baseBranch"),
    baseBranch: z.string().min(1).max(200),
  }).strict(),
  z.object({
    type: z.literal("commit"),
    sha: z.string().min(1).max(200),
    title: z.string().max(200).optional(),
  }).strict(),
  z.object({
    type: z.literal("custom"),
    instructions: z.string().min(1).max(20_000),
  }).strict(),
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
      z.literal("task.approval_requested"),
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
  })
  .strict();

export const MarkAllNotificationsReadArgsSchema = z
  .object({
    readAt: z.string().max(100).optional(),
  })
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

export const FilesystemInspectArgsSchema = FilesystemRootArgsSchema.extend({
  entryFilePath: z.string().max(4096).optional(),
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
