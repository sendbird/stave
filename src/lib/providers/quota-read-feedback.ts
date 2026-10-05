import { z } from "zod";

/** User-facing read outcome only; native cache provenance stays in the host. */
export const QuotaReadFeedbackSchema = z.object({
  status: z.enum(["fresh", "cached", "unavailable"]),
  reason: z.enum(["request", "ttl", "manual-floor", "backoff", "provider-cache", "in-flight", "unavailable"]),
  nextRefreshAt: z.iso.datetime().nullable(),
  nextAutomaticReadAt: z.iso.datetime().nullable(),
  lastReadFailed: z.boolean(),
}).strict();

export type QuotaReadFeedback = z.infer<typeof QuotaReadFeedbackSchema>;
