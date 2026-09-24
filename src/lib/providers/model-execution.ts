import { z } from "zod";

/** Provider-reported execution evidence, separate from automatic route selection. */
export const ModelExecutionSchema = z.object({
  requestedModel: z.string().min(1).max(200),
  actualModel: z.string().min(1).max(200),
  reason: z.string().max(2000),
});
export type ModelExecution = z.infer<typeof ModelExecutionSchema>;
