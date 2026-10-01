import { z } from "zod";
import type { ClaudeGateway, ClaudeGatewayCheckResult } from "../../src/lib/providers/claude-gateway";

const CatalogSchema = z.object({ data: z.array(z.object({ id: z.string().max(200) })).max(5000) });

/** A bounded metadata request, never an inference or a provider-auth fallback. */
export async function checkClaudeGateway(args: {
  gateway: ClaudeGateway;
  token: string;
  request?: typeof fetch;
}): Promise<ClaudeGatewayCheckResult> {
  const failed = (message: string) => ({ ok: false, message, models: [] });
  try {
    const response = await (args.request ?? fetch)(`${args.gateway.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${args.token}`, "anthropic-version": "2023-06-01" },
      redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return failed(`Model list check failed (HTTP ${response.status}). Check the endpoint and saved API key.`);
    }
    const reader = response.body?.getReader();
    if (!reader) return failed("The endpoint returned an empty model list response.");
    const decoder = new TextDecoder();
    let text = "", bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 1_000_000) return failed("The model list response exceeded the size limit.");
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally { await reader.cancel(); reader.releaseLock(); }
    const catalog = CatalogSchema.safeParse(JSON.parse(text));
    if (!catalog.success) return failed("The endpoint did not return a supported model list.");
    const advertised = new Set(catalog.data.data.map(entry => entry.id));
    const models = args.gateway.models.filter(model => advertised.has(model));
    return { ok: models.length === args.gateway.models.length, models,
      message: models.length === args.gateway.models.length
        ? "Configured models are listed by the endpoint. Streaming, tools, reasoning, and cancellation still need a real turn."
        : "Some configured models were not listed. Confirm their exact IDs with the Gateway administrator.",
    };
  } catch { return failed("Could not check the model list. Confirm that this endpoint supports GET /v1/models."); }
}
