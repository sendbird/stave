import { i18n } from "@/i18n/runtime";
import { z } from "zod";
import { ApiConnectionModelIdSchema, HttpsBaseUrlSchema, VERCEL_AI_GATEWAY } from "./api-connections";

export const CLAUDE_GATEWAY_PRESET_URL = VERCEL_AI_GATEWAY.endpoints["claude-code"];
/** The model the Vercel AI Gateway preset starts with, in the gateway's routing form. */
export const CLAUDE_GATEWAY_PRESET_MODEL = "anthropic/claude-sonnet-5";

/**
 * Any gateway model ID, Claude or not. Non-Claude models are experimental in
 * Claude Code (see `isExperimentalApiConnectionModel`), not rejected.
 */
export const ClaudeGatewayModelSchema = ApiConnectionModelIdSchema;

/**
 * The Claude runtime's view of an API connection: its Claude Code endpoint,
 * key reference and pinned model IDs. Also the shape older builds stored on a
 * Claude account profile before connections were shared with Codex.
 */
export const ClaudeGatewaySchema = z.object({
  baseUrl: HttpsBaseUrlSchema,
  secretId: z.uuid(),
  models: z.array(ClaudeGatewayModelSchema).min(1).max(50)
    .refine(values => new Set(values).size === values.length, { error: () => i18n.t("providers:validation.uniqueModels") }),
}).strict();

export type ClaudeGateway = z.infer<typeof ClaudeGatewaySchema>;
export type ClaudeGatewayCheckResult = {
  ok: boolean;
  message: string;
  models: string[];
};
