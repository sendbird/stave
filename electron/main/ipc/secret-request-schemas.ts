import { z } from "zod";
import { SECRET_VALUE_MAX_LENGTH } from "../../../src/lib/secrets/secrets";

const RequestIdSchema = z.string().uuid();

/**
 * The card's answer. Only `save` carries a value, bounded like the vault's own
 * upsert; unknown keys are rejected so nothing else rides along.
 */
export const SecretRequestRespondArgsSchema = z.discriminatedUnion("action", [
  z
    .object({
      requestId: RequestIdSchema,
      action: z.literal("save"),
      value: z.string().min(1).max(SECRET_VALUE_MAX_LENGTH),
    })
    .strict(),
  z.object({ requestId: RequestIdSchema, action: z.literal("use-existing") }).strict(),
  z.object({ requestId: RequestIdSchema, action: z.literal("decline") }).strict(),
]);
