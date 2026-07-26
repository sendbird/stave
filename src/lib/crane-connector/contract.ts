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

export const CraneStaveJobV1Schema = z
  .object({
    version: z.literal(CRANE_STAVE_DISPATCH_VERSION),
    id: opaqueIdSchema,
    kind: z.literal("run_task"),
    connectorId: opaqueIdSchema,
    issue: z
      .object({
        id: opaqueIdSchema,
        key: z
          .string()
          .trim()
          .min(1)
          .max(CRANE_STAVE_DISPATCH_LIMITS.issueKey),
        title: z
          .string()
          .trim()
          .min(1)
          .max(CRANE_STAVE_DISPATCH_LIMITS.title),
        description: z
          .string()
          .max(CRANE_STAVE_DISPATCH_LIMITS.description),
        href: httpsUrlSchema,
        updatedAt: timestampSchema,
      })
      .strict(),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(CRANE_STAVE_DISPATCH_LIMITS.instruction),
    requestedAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.expiresAt) <= Date.parse(value.requestedAt)) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be later than requestedAt.",
      });
    }
    if (
      serializedByteLength(value) > CRANE_STAVE_DISPATCH_LIMITS.jobBytes
    ) {
      context.addIssue({
        code: "custom",
        message: "Crane Stave job payload exceeds the V1 byte limit.",
      });
    }
  });

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
      serializedByteLength(value) >
      CRANE_STAVE_DISPATCH_LIMITS.receiptBytes
    ) {
      context.addIssue({
        code: "custom",
        message: "Crane Stave receipt payload exceeds the V1 byte limit.",
      });
    }
  });

export type CraneStaveJobV1 = z.infer<typeof CraneStaveJobV1Schema>;
export type CraneStaveReceiptV1 = z.infer<
  typeof CraneStaveReceiptV1Schema
>;
export type CraneStaveReceiptState =
  (typeof CRANE_STAVE_RECEIPT_STATES)[number];

export function parseCraneStaveJobV1(value: unknown) {
  return CraneStaveJobV1Schema.parse(value);
}

export function parseCraneStaveReceiptV1(value: unknown) {
  return CraneStaveReceiptV1Schema.parse(value);
}
