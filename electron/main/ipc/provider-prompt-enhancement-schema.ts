import { z } from "zod";
import { PROMPT_ENHANCEMENT_DEPTHS } from "../../../src/lib/providers/prompt-enhancement-context";
import { ProviderIdSchema, RuntimeOptionsSchema } from "./provider-runtime-schemas";

export const EnhancePromptArgsSchema = z
  .object({
    cwd: z.string().max(4096).optional(),
    utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
    activeProviderId: ProviderIdSchema.optional(),
    utilityModel: z.string().max(200).optional(),
    utilityMaxProviderAttempts: z.number().int().min(1).max(4).optional(),
    runtimeOptions: z.lazy(() => RuntimeOptionsSchema).optional(),
    prompt: z.string().trim().min(1).max(100_000),
    depth: z.enum(PROMPT_ENHANCEMENT_DEPTHS).optional(),
    // Optional reference material. Caps mirror the renderer-side clipping so a
    // misbehaving caller cannot turn the cheap lane into a long-context call.
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(2_000),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    workspaceSummary: z.string().max(4_000).optional(),
    styleProfile: z.string().max(4_000).optional(),
    exemplars: z
      .array(
        z
          .object({
            source: z.string().max(2_000),
            enhanced: z.string().max(2_000),
            outcome: z.enum(["kept", "undone"]),
            at: z.string().max(64),
            depth: z.enum(PROMPT_ENHANCEMENT_DEPTHS).optional(),
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict();
