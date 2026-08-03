import { z } from "zod";
import { CraneStaveJobV1Schema } from "./contract";

export const DEFAULT_CRANE_CONNECTOR_BASE_URL =
  "https://atelier.delight-tools.ai";
export const DEFAULT_CRANE_CONNECTOR_POLL_INTERVAL_SECONDS = 15;
export const MIN_CRANE_CONNECTOR_POLL_INTERVAL_SECONDS = 15;
export const MAX_CRANE_CONNECTOR_POLL_INTERVAL_SECONDS = 300;

const BaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .url()
  .transform((value) => value.replace(/\/+$/, ""));

export const CRANE_DISPATCH_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const;

/**
 * Reasoning setup Stave remembers per Crane team so a repeat dispatch does not
 * force the same model/effort choice every time.
 *
 * Access-level fields (permission mode, sandbox, file access, approval policy,
 * network) are deliberately excluded: those must always re-derive from the
 * user's current Stave settings so a one-off "Auto" approval can never be
 * silently replayed on a later job.
 */
export const CraneTeamRuntimeMemorySchema = z
  .object({
    provider: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
    effort: z.enum(CRANE_DISPATCH_EFFORTS),
    fastMode: z.boolean().optional(),
  })
  .strict();

export const CraneProjectMappingSchema = z
  .object({
    craneTeamKey: z.string().trim().min(1).max(64).optional(),
    craneProjectId: z.string().trim().min(1).max(128).optional(),
    staveProjectPath: z.string().trim().min(1).max(4_096),
    runtime: CraneTeamRuntimeMemorySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.craneTeamKey && !value.craneProjectId) {
      context.addIssue({
        code: "custom",
        message: "A Crane team key or project id is required.",
      });
    }
  });

export const CraneConnectorSettingsSchema = z
  .object({
    enabled: z.boolean(),
    baseUrl: BaseUrlSchema,
    pollIntervalSeconds: z
      .number()
      .int()
      .min(MIN_CRANE_CONNECTOR_POLL_INTERVAL_SECONDS)
      .max(MAX_CRANE_CONNECTOR_POLL_INTERVAL_SECONDS),
    projectMappings: z.array(CraneProjectMappingSchema).max(100),
  })
  .strict();

export const DEFAULT_CRANE_CONNECTOR_SETTINGS = Object.freeze({
  enabled: false,
  baseUrl: DEFAULT_CRANE_CONNECTOR_BASE_URL,
  pollIntervalSeconds: DEFAULT_CRANE_CONNECTOR_POLL_INTERVAL_SECONDS,
  projectMappings: [],
}) satisfies CraneConnectorSettings;

export const CraneConnectorMetadataSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    name: z.string().trim().min(1).max(80),
    protocolVersion: z.literal(1),
    appVersion: z.string().trim().min(1).max(64),
    capabilities: z.array(z.literal("run_task")).min(1).max(1),
    createdAt: z.string().datetime({ offset: true }),
    lastSeenAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const CRANE_CONNECTOR_RUNTIME_STATES = [
  "disabled",
  "unpaired",
  "connecting",
  "connected",
  "awaiting_local_approval",
  "running",
  "offline",
  "error",
] as const;

export const CraneConnectorPublicStatusSchema = z
  .object({
    runtimeState: z.enum(CRANE_CONNECTOR_RUNTIME_STATES),
    paired: z.boolean(),
    connector: CraneConnectorMetadataSchema.nullable(),
    lastHeartbeatAt: z.string().datetime({ offset: true }).nullable(),
    lastErrorCode: z.string().trim().min(1).max(64).nullable(),
    activeJobId: z.string().trim().min(1).max(128).nullable(),
    secureStorageAvailable: z.boolean(),
  })
  .strict();

export const CraneConnectorPairInputSchema = z
  .object({
    baseUrl: BaseUrlSchema,
    code: z.string().trim().startsWith("stp_").max(128),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const CraneConnectorConfigInputSchema =
  CraneConnectorSettingsSchema.pick({
    enabled: true,
    baseUrl: true,
    pollIntervalSeconds: true,
  });

const AdvisorTargetSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
  })
  .strict()
  .nullable();

const CraneDispatchRuntimeChoiceSchema = z.discriminatedUnion("provider", [
  z
    .object({
      provider: z.literal("claude-code"),
      model: z.string().trim().min(1).max(200),
      providerTimeoutMs: z.number().int().min(1).max(86_400_000),
      claudePermissionMode: z.enum([
        "default",
        "acceptEdits",
        "bypassPermissions",
        "plan",
        "dontAsk",
        "auto",
      ]),
      claudeSandboxEnabled: z.boolean(),
      // Both flags are required so an autonomy preset means the same thing here
      // as it does in the composer. Omitting them lets the Claude runtime fall
      // back to its own defaults - notably `allowUnsandboxedCommands: true`,
      // which would quietly undo the sandbox that "Manual" promises.
      claudeAllowUnsandboxedCommands: z.boolean(),
      claudeAllowDangerouslySkipPermissions: z.boolean(),
      // Required: an absent effort silently falls back to the Claude Agent SDK
      // default instead of the reasoning level the approver actually picked.
      claudeEffort: z.enum(["low", "medium", "high", "xhigh", "max"]),
      advisorTarget: AdvisorTargetSchema,
    })
    .strict(),
  z
    .object({
      provider: z.literal("codex"),
      model: z.string().trim().min(1).max(200),
      providerTimeoutMs: z.number().int().min(1).max(86_400_000),
      codexFileAccess: z.enum([
        "read-only",
        "workspace-write",
        "danger-full-access",
      ]),
      codexNetworkAccess: z.boolean(),
      codexApprovalPolicy: z.enum([
        "never",
        "on-request",
        "on-failure",
        "untrusted",
      ]),
      // Part of the autonomy preset for the same reason as the Claude flags
      // above: without it "Manual" would not actually disable web search.
      codexWebSearch: z.enum(["disabled", "cached", "live", "indexed"]),
      // Required for the same reason as `claudeEffort`. "minimal" is legacy
      // input only; resolveCodexAppServerReasoningEffort maps it to "low".
      codexReasoningEffort: z.enum([
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        "ultra",
      ]),
      codexFastMode: z.boolean(),
      advisorTarget: AdvisorTargetSchema,
    })
    .strict(),
]);

const CraneDispatchWorkspaceChoiceSchema = z.discriminatedUnion("strategy", [
  z
    .object({
      strategy: z.literal("new"),
      branchName: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      strategy: z.literal("existing"),
      workspaceId: z.string().trim().min(1).max(256),
    })
    .strict(),
]);

export const CraneDispatchApprovalResponseSchema = z
  .object({
    jobId: z.string().trim().min(1).max(128),
    projectPath: z.string().trim().min(1).max(4_096),
    workspace: CraneDispatchWorkspaceChoiceSchema,
    runtime: CraneDispatchRuntimeChoiceSchema,
  })
  .strict();

export const CraneDispatchDeclineResponseSchema = z
  .object({
    jobId: z.string().trim().min(1).max(128),
  })
  .strict();

export const CraneDispatchApprovalRequestSchema = z
  .object({
    job: CraneStaveJobV1Schema,
    leaseExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const CraneDispatchJobUpdateSchema = z
  .object({
    jobId: z.string().trim().min(1).max(128),
    state: z.enum([
      "received",
      "awaiting_local_approval",
      "declined",
      "running",
      "needs_local_input",
      "completed",
      "failed",
      "cancelled",
    ]),
    workspaceId: z.string().trim().min(1).max(256).nullable(),
    taskId: z.string().trim().min(1).max(256).nullable(),
    errorCode: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export type CraneConnectorSettings = z.infer<
  typeof CraneConnectorSettingsSchema
>;
export type CraneProjectMapping = z.infer<typeof CraneProjectMappingSchema>;
export type CraneTeamRuntimeMemory = z.infer<
  typeof CraneTeamRuntimeMemorySchema
>;
export type CraneDispatchEffort = (typeof CRANE_DISPATCH_EFFORTS)[number];
export type CraneConnectorMetadata = z.infer<
  typeof CraneConnectorMetadataSchema
>;
export type CraneConnectorPublicStatus = z.infer<
  typeof CraneConnectorPublicStatusSchema
>;
export type CraneConnectorConfigInput = z.infer<
  typeof CraneConnectorConfigInputSchema
>;
export type CraneConnectorPairInput = z.infer<
  typeof CraneConnectorPairInputSchema
>;
export type CraneDispatchApprovalResponse = z.infer<
  typeof CraneDispatchApprovalResponseSchema
>;
export type CraneDispatchDeclineResponse = z.infer<
  typeof CraneDispatchDeclineResponseSchema
>;
export type CraneDispatchApprovalRequest = z.infer<
  typeof CraneDispatchApprovalRequestSchema
>;
export type CraneDispatchJobUpdate = z.infer<
  typeof CraneDispatchJobUpdateSchema
>;

export function normalizeCraneConnectorSettings(
  value: unknown,
): CraneConnectorSettings {
  const parsed = CraneConnectorSettingsSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  // A single unreadable mapping - e.g. one written by a newer build that knows
  // a field this one does not - must not take the connector's enabled flag and
  // base URL down with it. Salvage per element and drop only what fails.
  const salvaged = CraneConnectorSettingsSchema.safeParse({
    ...(value && typeof value === "object" ? value : {}),
    projectMappings: Array.isArray(
      (value as { projectMappings?: unknown })?.projectMappings,
    )
      ? (value as { projectMappings: unknown[] }).projectMappings.filter(
          (mapping) => CraneProjectMappingSchema.safeParse(mapping).success,
        )
      : [],
  });
  return salvaged.success
    ? salvaged.data
    : {
        ...DEFAULT_CRANE_CONNECTOR_SETTINGS,
        projectMappings: [],
      };
}
