import { z } from "zod";
import { ApiConnectionModelIdSchema } from "./api-connections";

/** Decision inference is independent of the model that executes the task. */
export const RoutingDecisionConfigSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("automatic") }).strict(),
  z.object({ mode: z.literal("native"), providerId: z.enum(["codex", "claude-code"]) }).strict(),
  z.object({ mode: z.literal("gateway"), connectionId: z.uuid(), model: ApiConnectionModelIdSchema }).strict(),
]);
export type RoutingDecisionConfig = z.infer<typeof RoutingDecisionConfigSchema>;
export const DEFAULT_ROUTING_DECISION: RoutingDecisionConfig = { mode: "automatic" };
export const RoutingDecisionFailureSchema = z.enum(["missing-key", "auth", "budget", "rate-limit", "timeout", "network", "invalid-response", "unavailable"]);
export type RoutingDecisionFailure = z.infer<typeof RoutingDecisionFailureSchema>;
export const RoutingDecisionObservationSchema = z.object({
  providerId: z.enum(["gateway", "codex", "claude-code", "local"]), model: z.string().max(200).nullable(),
  preferred: RoutingDecisionConfigSchema, fallback: z.boolean(), elapsedMs: z.number().int().min(0).max(600_000),
  failure: RoutingDecisionFailureSchema.optional(), reportedCostUsd: z.number().finite().nonnegative().nullable(), cached: z.boolean().optional(),
}).strict();
export type RoutingDecisionObservation = z.infer<typeof RoutingDecisionObservationSchema>;

export function normalizeRoutingDecision(value: unknown): RoutingDecisionConfig {
  const parsed = RoutingDecisionConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_ROUTING_DECISION };
}

/** Only these two native classifiers participate; automatic always tries Luna first. */
export function routingDecisionNativeOrder(config: RoutingDecisionConfig) {
  return config.mode === "native" && config.providerId === "claude-code"
    ? ["claude-code", "codex"] as const
    : ["codex", "claude-code"] as const;
}
