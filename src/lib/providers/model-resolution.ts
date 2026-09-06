import { z } from "zod";
import type { AutoRoutingModelResolution } from "./provider.types";

const ModelResolutionProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
  z.literal("cursor"),
  z.literal("kiro"),
]);

/**
 * Durable evidence for Stave's automatic primary-model selection. Runtime
 * `model_resolved` events may later report a different executed target, so the
 * selected target stays inside this record rather than being inferred from the
 * message's current provider/model.
 */
export const AutoRoutingModelResolutionSchema = z
  .object({
    selectedProviderId: ModelResolutionProviderIdSchema,
    selectedModel: z.string().trim().min(1).max(200),
    source: z.union([
      z.literal("heuristic"),
      z.literal("classifier"),
      z.literal("classifier_fallback"),
    ]),
    rationale: z.string().trim().min(1).max(4_000),
    confidence: z.number().finite().min(0).max(1),
    taskType: z.union([
      z.literal("quick_edit"),
      z.literal("plan"),
      z.literal("implementation"),
      z.literal("debug"),
      z.literal("review"),
      z.literal("general"),
      z.literal("safety"),
    ]),
  })
  .strict() satisfies z.ZodType<AutoRoutingModelResolution>;
