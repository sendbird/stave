import { z } from "zod";

/**
 * Contracts for opt-in remote control: the HTTP boundary a paired phone talks
 * to, the administrative IPC behind Settings, and the main -> renderer bridge
 * that answers through the desktop's own respond actions.
 *
 * v1 allows exactly three things from a phone: read status, answer a pending
 * approval once (allow or deny), and answer a pending question. Every schema
 * is strict so an unknown field or action kind is rejected, not ignored.
 */

const Id = z.string().min(1).max(200);

export const REMOTE_CONTROL_PORT_MIN = 6500;
export const REMOTE_CONTROL_PORT_MAX = 6549;
export const REMOTE_CONTROL_DEFAULT_ADDRESS = "127.0.0.1";
export const REMOTE_CONTROL_MAX_DEVICES = 32;
export const REMOTE_CONTROL_MAX_AUDIT = 100;

export const RemoteConfigSchema = z
  .object({
    enabled: z.boolean(),
    address: z.string().min(1).max(80).default(REMOTE_CONTROL_DEFAULT_ADDRESS),
    port: z
      .number()
      .int()
      .min(REMOTE_CONTROL_PORT_MIN)
      .max(REMOTE_CONTROL_PORT_MAX)
      .default(REMOTE_CONTROL_PORT_MIN),
    /** Required for any address other than loopback. */
    confirmNetwork: z.boolean().default(false),
  })
  .strict();
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

export function isLoopbackAddress(address: string) {
  return address === "127.0.0.1" || address === "::1";
}

export const RemotePairSchema = z
  .object({
    code: z.string().regex(/^[a-f0-9]{32}$/),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

/**
 * Where a request lives. `turnId` is null for a question that did not pause
 * its turn: it can outlive the turn that asked it.
 */
const Target = z
  .object({
    workspaceId: Id,
    taskId: Id,
    turnId: Id.nullable(),
  })
  .strict();

const QuestionAnswersSchema = z
  .record(z.string().min(1).max(4000), z.string().max(16000))
  .refine((value) => Object.keys(value).length <= 12);

export const RemoteActionSchema = z.discriminatedUnion("kind", [
  Target.extend({
    kind: z.literal("approval"),
    requestId: Id,
    messageId: Id,
    approved: z.boolean(),
  }).strict(),
  Target.extend({
    kind: z.literal("question"),
    requestId: Id,
    messageId: Id,
    answers: QuestionAnswersSchema,
  }).strict(),
]);
export type RemoteAction = z.infer<typeof RemoteActionSchema>;

export const RemoteResultSchema = z
  .object({
    ok: z.boolean(),
    reason: z.enum(["applied", "expired", "invalid", "unavailable"]),
  })
  .strict();
export type RemoteResult = z.infer<typeof RemoteResultSchema>;
export type RemoteResultReason = RemoteResult["reason"];

export const RemoteDeviceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    createdAt: z.number().int().nonnegative(),
    lastSeen: z.number().int().nonnegative(),
  })
  .strict();
export type RemoteDevice = z.infer<typeof RemoteDeviceSchema>;

/** Audit records keep who, what and when; never codes, tokens or answer text. */
export const RemoteAuditActionSchema = z.discriminatedUnion("kind", [
  Target.extend({
    kind: z.literal("approval"),
    requestId: Id,
    messageId: Id,
    approved: z.boolean(),
  }).strict(),
  Target.extend({
    kind: z.literal("question"),
    requestId: Id,
    messageId: Id,
  }).strict(),
]);

export const RemoteAuditSchema = z
  .object({
    id: z.string().uuid(),
    deviceId: z.string().uuid(),
    deviceName: z.string().max(80),
    time: z.number().int(),
    action: RemoteAuditActionSchema,
    result: RemoteResultSchema,
  })
  .strict();
export type RemoteAudit = z.infer<typeof RemoteAuditSchema>;

export const RemoteTaskSchema = z
  .object({
    workspaceId: Id,
    workspaceName: z.string().max(200),
    taskId: Id,
    turnId: Id.nullable(),
    title: z.string().max(1000),
    updatedAt: z.string().max(100),
    running: z.boolean(),
  })
  .strict();
export type RemoteTask = z.infer<typeof RemoteTaskSchema>;

export const RemoteQuestionSchema = z
  .object({
    key: z.string().max(4000),
    question: z.string().max(4000),
    /** `value` is what the answer carries, as on the desktop card; `label` is what is shown. */
    options: z
      .array(z.object({ label: z.string().max(4000), value: z.string().max(4000) }).strict())
      .max(100),
    multiSelect: z.boolean(),
    required: z.boolean(),
  })
  .strict();

export const RemoteRequestSchema = Target.extend({
  kind: z.enum(["approval", "question"]),
  requestId: Id,
  messageId: Id,
  /** Tool or question source, such as `Bash`. */
  tool: z.string().max(200),
  summary: z.string().max(24000),
  questions: z.array(RemoteQuestionSchema).max(12),
}).strict();
export type RemoteRequest = z.infer<typeof RemoteRequestSchema>;

export const REMOTE_SNAPSHOT_MAX_TASKS = 200;
export const REMOTE_SNAPSHOT_MAX_REQUESTS = 200;

export const RemoteSnapshotSchema = z
  .object({
    tasks: z.array(RemoteTaskSchema).max(REMOTE_SNAPSHOT_MAX_TASKS),
    requests: z.array(RemoteRequestSchema).max(REMOTE_SNAPSHOT_MAX_REQUESTS),
  })
  .strict();
export type RemoteSnapshot = z.infer<typeof RemoteSnapshotSchema>;

export const RemoteInterfaceSchema = z
  .object({
    name: z.string().max(100),
    address: z.string().max(80),
    family: z.enum(["IPv4", "IPv6"]),
  })
  .strict();
export type RemoteInterface = z.infer<typeof RemoteInterfaceSchema>;

export const RemoteStartErrorSchema = z.enum([
  "address-unavailable",
  "bind-failed",
]);
export type RemoteStartError = z.infer<typeof RemoteStartErrorSchema>;

export const RemoteStatusSchema = z
  .object({
    /** A listener is running. */
    enabled: z.boolean(),
    /** The saved setting; can be on while `enabled` is false after a start failure. */
    configured: z.boolean(),
    address: z.string().max(80),
    port: z.number().int(),
    startError: RemoteStartErrorSchema.nullable(),
    pairingLocked: z.boolean(),
    interfaces: z.array(RemoteInterfaceSchema).max(64),
    devices: z.array(RemoteDeviceSchema).max(REMOTE_CONTROL_MAX_DEVICES),
    audit: z.array(RemoteAuditSchema).max(REMOTE_CONTROL_MAX_AUDIT),
  })
  .strict();
export type RemoteStatus = z.infer<typeof RemoteStatusSchema>;

export const RemoteAdminSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("status") }).strict(),
  z.object({ kind: z.literal("configure"), config: RemoteConfigSchema }).strict(),
  z.object({ kind: z.literal("pair") }).strict(),
  z.object({ kind: z.literal("revoke"), id: z.string().uuid().optional() }).strict(),
]);
export type RemoteAdmin = z.input<typeof RemoteAdminSchema>;

export const RemotePairingSchema = z
  .object({
    code: z.string().regex(/^[a-f0-9]{32}$/),
    url: z.string().max(200),
    expiresAt: z.number().int(),
  })
  .strict();
export type RemotePairing = z.infer<typeof RemotePairingSchema>;

export const RemoteAdminErrorSchema = z.enum([
  "invalid-request",
  "invalid-address",
  "address-unavailable",
  "bind-failed",
  "pairing-unavailable",
  "failed",
]);
export type RemoteAdminError = z.infer<typeof RemoteAdminErrorSchema>;

export const RemoteAdminResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      status: RemoteStatusSchema,
      pairing: RemotePairingSchema.optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: RemoteAdminErrorSchema,
      status: RemoteStatusSchema.optional(),
    })
    .strict(),
]);
export type RemoteAdminResult = z.infer<typeof RemoteAdminResultSchema>;

/** Main -> renderer: answer a snapshot or an action through the desktop's own code. */
export const RemoteRendererRequestSchema = z.discriminatedUnion("kind", [
  z.object({ requestId: z.number().int().positive(), kind: z.literal("snapshot") }).strict(),
  z
    .object({
      requestId: z.number().int().positive(),
      kind: z.literal("act"),
      action: RemoteActionSchema,
    })
    .strict(),
]);
export type RemoteRendererRequest = z.infer<typeof RemoteRendererRequestSchema>;

/** Renderer -> main: the reply to one bridge request. */
export const RemoteRendererResponseSchema = z.discriminatedUnion("kind", [
  z
    .object({
      requestId: z.number().int().positive(),
      kind: z.literal("snapshot"),
      snapshot: RemoteSnapshotSchema,
    })
    .strict(),
  z
    .object({
      requestId: z.number().int().positive(),
      kind: z.literal("act"),
      result: RemoteResultSchema,
    })
    .strict(),
]);
export type RemoteRendererResponse = z.infer<typeof RemoteRendererResponseSchema>;

export interface RemoteControlApi {
  invoke(args: RemoteAdmin): Promise<RemoteAdminResult>;
  onRequest(listener: (request: unknown) => void): () => void;
  respond(response: RemoteRendererResponse): Promise<{ ok: boolean }>;
  setResponderReady(ready: boolean): Promise<{ ok: boolean }>;
}
