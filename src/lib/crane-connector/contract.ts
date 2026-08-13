import { z } from "zod";

export const CRANE_STAVE_DISPATCH_VERSION = 1 as const;

export const CRANE_STAVE_DISPATCH_LIMITS = Object.freeze({
  id: 128,
  issueKey: 64,
  title: 256,
  description: 16_000,
  href: 2_048,
  instruction: 4_000,
  timestamp: 64,
  errorCode: 64,
  linkRel: 32,
  links: 8,
  jobBytes: 20_000,
  receiptBytes: 384,
});

export const CRANE_STAVE_RECEIPT_STATES = [
  "received",
  "awaiting_local_approval",
  "declined",
  "running",
  "needs_local_input",
  "completed",
  "failed",
  "cancelled",
] as const;

const utf8Encoder = new TextEncoder();
const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(CRANE_STAVE_DISPATCH_LIMITS.id);
const timestampSchema = z
  .string()
  .max(CRANE_STAVE_DISPATCH_LIMITS.timestamp)
  .datetime({ offset: true });
const httpsUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(CRANE_STAVE_DISPATCH_LIMITS.href)
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Crane issue links must use HTTPS.",
  });

function serializedByteLength(value: unknown) {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength;
}

/**
 * Keys that would let a remote payload steer the local host instead of merely
 * describing an issue. Unknown fields are ignored rather than rejected (see
 * `assertNoHostControlKeys`), so a payload that tries to name a local path,
 * a command, a provider runtime, or a credential must fail loudly instead of
 * being silently dropped.
 *
 * Compared case-insensitively with separators removed, so `local_path`,
 * `localPath`, and `LOCALPATH` all match.
 */
const HOST_CONTROL_KEYS = new Set([
  "localpath",
  "path",
  "cwd",
  "workdir",
  "workingdirectory",
  "projectpath",
  "repopath",
  "worktree",
  "worktreepath",
  "command",
  "cmd",
  "argv",
  "args",
  "script",
  "shell",
  "exec",
  "entrypoint",
  "env",
  "environment",
  "provider",
  "model",
  "runtime",
  "permissionmode",
  "permissions",
  "sandbox",
  "approvalpolicy",
  "allowedtools",
  "skippermissions",
  "dangerouslyskippermissions",
  "hooks",
  "mcpservers",
  "mcpconfig",
  "token",
  "secret",
  "credential",
  "credentials",
  "apikey",
  "authorization",
  "password",
]);

const HOST_CONTROL_SCAN_MAX_DEPTH = 6;

function normalizeKey(key: string) {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/**
 * Walk the raw payload before Zod strips unknown properties and reject anything
 * that reads as an attempt to control this machine. Everything else unknown is
 * allowed through and dropped, which is what makes additive Crane changes
 * non-breaking in both rollout directions.
 */
function assertNoHostControlKeys(
  value: unknown,
  context: z.RefinementCtx,
  path: (string | number)[] = [],
) {
  if (path.length > HOST_CONTROL_SCAN_MAX_DEPTH || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoHostControlKeys(entry, context, [...path, index]);
    });
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (HOST_CONTROL_KEYS.has(normalizeKey(key))) {
      context.addIssue({
        code: "custom",
        path: [...path, key],
        message: `Crane jobs may not carry host-control field "${key}".`,
      });
      continue;
    }
    assertNoHostControlKeys(entry, context, [...path, key]);
  }
}

/**
 * A link from the Crane issue to a resource in another system. This is the
 * forward-compatible way for Crane to tell Stave about a tracked Jira issue:
 * adding a new system later means emitting a new `rel`, not changing a schema
 * on either side. Entries are read in order, so Crane lists the most
 * authoritative link first.
 *
 * Stave understands `rel: "jira"` today and ignores every other `rel`.
 */
const craneIssueLinkSchema = z.object({
  rel: z.string().trim().min(1).max(CRANE_STAVE_DISPATCH_LIMITS.linkRel),
  url: httpsUrlSchema,
  key: z
    .string()
    .trim()
    .min(1)
    .max(CRANE_STAVE_DISPATCH_LIMITS.issueKey)
    .optional(),
  title: z
    .string()
    .trim()
    .min(1)
    .max(CRANE_STAVE_DISPATCH_LIMITS.title)
    .optional(),
});

const craneStaveJobV1BodySchema = z
  .object({
    version: z.literal(CRANE_STAVE_DISPATCH_VERSION),
    id: opaqueIdSchema,
    kind: z.literal("run_task"),
    connectorId: opaqueIdSchema,
    issue: z.object({
      id: opaqueIdSchema,
      key: z.string().trim().min(1).max(CRANE_STAVE_DISPATCH_LIMITS.issueKey),
      title: z.string().trim().min(1).max(CRANE_STAVE_DISPATCH_LIMITS.title),
      description: z.string().max(CRANE_STAVE_DISPATCH_LIMITS.description),
      href: httpsUrlSchema,
      updatedAt: timestampSchema,
      links: z
        .array(craneIssueLinkSchema)
        .max(CRANE_STAVE_DISPATCH_LIMITS.links)
        .nullish(),
    }),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(CRANE_STAVE_DISPATCH_LIMITS.instruction),
    requestedAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .superRefine((value, context) => {
    if (Date.parse(value.expiresAt) <= Date.parse(value.requestedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be later than requestedAt.",
      });
    }
    if (serializedByteLength(value) > CRANE_STAVE_DISPATCH_LIMITS.jobBytes) {
      context.addIssue({
        code: "custom",
        message: "Crane Stave job payload exceeds the V1 byte limit.",
      });
    }
  });

/**
 * The job envelope tolerates unknown properties: Zod strips them, so a field
 * Crane adds never reaches Stave runtime code and never rejects a job either.
 * Forward compatibility is therefore free in both rollout directions, and the
 * security boundary is the explicit host-control denylist below plus the raw
 * byte cap, both of which run against the payload as received.
 */
export const CraneStaveJobV1Schema = z
  .unknown()
  .superRefine((value, context) => {
    if (serializedByteLength(value) > CRANE_STAVE_DISPATCH_LIMITS.jobBytes) {
      context.addIssue({
        code: "custom",
        message: "Crane Stave job payload exceeds the V1 byte limit.",
      });
      return;
    }
    assertNoHostControlKeys(value, context);
  })
  .pipe(craneStaveJobV1BodySchema);

export const CraneStaveReceiptV1Schema = z
  .object({
    version: z.literal(CRANE_STAVE_DISPATCH_VERSION),
    jobId: opaqueIdSchema,
    connectorId: opaqueIdSchema,
    sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    state: z.enum(CRANE_STAVE_RECEIPT_STATES),
    occurredAt: timestampSchema,
    errorCode: z
      .string()
      .trim()
      .min(1)
      .max(CRANE_STAVE_DISPATCH_LIMITS.errorCode)
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      serializedByteLength(value) > CRANE_STAVE_DISPATCH_LIMITS.receiptBytes
    ) {
      context.addIssue({
        code: "custom",
        message: "Crane Stave receipt payload exceeds the V1 byte limit.",
      });
    }
  });

export type CraneStaveJobV1 = z.infer<typeof CraneStaveJobV1Schema>;
export type CraneStaveReceiptV1 = z.infer<typeof CraneStaveReceiptV1Schema>;
export type CraneStaveReceiptState =
  (typeof CRANE_STAVE_RECEIPT_STATES)[number];

export function parseCraneStaveJobV1(value: unknown) {
  return CraneStaveJobV1Schema.parse(value);
}

export function parseCraneStaveReceiptV1(value: unknown) {
  return CraneStaveReceiptV1Schema.parse(value);
}
