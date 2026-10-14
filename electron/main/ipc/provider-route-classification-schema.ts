import { z } from "zod";
import { RoutingDecisionConfigSchema } from "../../../src/lib/providers/routing-decision";
import { ProviderIdSchema, RuntimeOptionsSchema } from "./provider-runtime-schemas";

export const ClassifyRouteArgsSchema = z.object({
  requestId: z.uuid().optional(),
  routingDecision: RoutingDecisionConfigSchema.optional(),
  phase: z.enum(["plan", "execute"]).optional(),
  cwd: z.string().max(4096).optional(),
  utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
  activeProviderId: ProviderIdSchema.optional(),
  utilityModel: z.string().max(200).optional(),
  utilityMaxProviderAttempts: z.number().int().min(1).max(4).optional(),
  runtimeOptions: RuntimeOptionsSchema.optional(),
  prompt: z.string().max(8000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().max(4000),
    providerId: ProviderIdSchema.optional(), model: z.string().max(200).optional(),
  }).strict()).max(20).optional(),
  fileContextCount: z.number().int().min(0).max(200).optional(),
}).strict();
