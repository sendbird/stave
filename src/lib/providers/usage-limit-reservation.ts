import { z } from "zod";

// The reservation travels as the turn id through every provider transport.
const PREFIX = "usage-limit-resume:";

export const UsageLimitReservationIdSchema = z.templateLiteral([PREFIX, z.uuid()]);

export function isUsageLimitReservationId(id: string): boolean {
  return id.startsWith(PREFIX) && UsageLimitReservationIdSchema.safeParse(id).success;
}

export function newUsageLimitReservationId() {
  return `${PREFIX}${crypto.randomUUID()}`;
}
