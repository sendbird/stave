import { z } from "zod";

export const CLAUDE_GATEWAY_PRESET_URL = "https://ai-gateway.vercel.sh/claude-code";

export const ClaudeGatewayModelSchema = z.string().trim().max(200)
  .regex(/^(?:claude-code\/)?(?:anthropic\/)?claude-[a-z0-9][a-z0-9.\[\]-]*$/);

export const ClaudeGatewaySchema = z.object({
  baseUrl: z.string().trim().max(2048).url().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }, "Use an HTTPS base URL without credentials, query parameters, or a fragment.")
    .transform(value => value.replace(/\/+$/, "")),
  secretId: z.uuid(),
  models: z.array(ClaudeGatewayModelSchema).min(1).max(50)
    .refine(values => new Set(values).size === values.length, "Model IDs must be unique."),
}).strict();

export type ClaudeGateway = z.infer<typeof ClaudeGatewaySchema>;
export type ClaudeGatewayCheckResult = {
  ok: boolean;
  message: string;
  models: string[];
};
