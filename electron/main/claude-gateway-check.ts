import { z } from "zod";
import type { ClaudeGateway, ClaudeGatewayCheckResult } from "../../src/lib/providers/claude-gateway";
import { describeApiConnectionHttpStatus } from "../../src/lib/providers/api-connections";

const CatalogSchema = z.object({ data: z.array(z.object({ id: z.string().max(200) })).max(5000) });

/**
 * The model a listed or configured ID routes to. Claude Code compatibility
 * endpoints (Vercel AI Gateway's `/claude-code`) list picker IDs such as
 * `claude-code/anthropic/claude-sonnet-5[1m]`: the `claude-code/` prefix and the
 * `[1m]` context marker are display-only and stripped before routing, so
 * `anthropic/claude-sonnet-5` is the same model. The creator prefix is kept,
 * because whether an endpoint accepts a bare `claude-…` ID is its own choice.
 */
export function gatewayRoutingModelId(id: string) {
  return id.trim().replace(/^claude-code\//, "").replace(/\[1m\]$/i, "");
}

/** A bounded metadata request, never an inference or a provider-auth fallback. */
export async function checkClaudeGateway(args: {
  gateway: ClaudeGateway;
  token: string;
  request?: typeof fetch;
}): Promise<ClaudeGatewayCheckResult & { httpStatus?: number }> {
  const failed = (message: string, httpStatus?: number) => ({ ok: false, message, models: [], ...(httpStatus ? { httpStatus } : {}) });
  try {
    const response = await (args.request ?? fetch)(`${args.gateway.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${args.token}`, "anthropic-version": "2023-06-01" },
      redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return failed(describeApiConnectionHttpStatus(response.status), response.status);
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
    const advertised = new Set(catalog.data.data.map(entry => gatewayRoutingModelId(entry.id)));
    const models = args.gateway.models.filter(model => advertised.has(gatewayRoutingModelId(model)));
    return { ok: models.length === args.gateway.models.length, models,
      message: models.length === args.gateway.models.length
        ? "The gateway lists every model on this connection. Send a turn to confirm the key, streaming and tools work."
        : `The gateway does not list ${args.gateway.models.filter(model => !models.includes(model)).join(", ")}. Check the exact model IDs with whoever runs the gateway.`,
    };
  } catch { return failed("Could not read the model list. Check that the gateway supports GET /v1/models; some gateways don't, and turns can still work."); }
}
