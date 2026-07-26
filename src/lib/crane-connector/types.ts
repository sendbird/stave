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

export const CraneProjectMappingSchema = z
  .object({
    craneTeamKey: z.string().trim().min(1).max(64).optional(),
    craneProjectId: z.string().trim().min(1).max(128).optional(),
    staveProjectPath: z.string().trim().min(1).max(4_096),
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
      claudePermissionMode: z.enum([
        "default",
        "acceptEdits",
        "bypassPermissions",
        "plan",
        "dontAsk",
        "auto",
      ]),
      claudeSandboxEnabled: z.boolean(),
      advisorTarget: AdvisorTargetSchema,
    })
    .strict(),
  z
    .object({
      provider: z.literal("codex"),
      model: z.string().trim().min(1).max(200),
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
export type CraneProjectMapping = z.infer<
  typeof CraneProjectMappingSchema
>;
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
  return parsed.success
    ? parsed.data
    : {
        ...DEFAULT_CRANE_CONNECTOR_SETTINGS,
        projectMappings: [],
      };
}
