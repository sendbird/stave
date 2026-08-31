import { z } from "zod";
import type { AcpProviderExtensionRuntime } from "../acp/acp-provider-runtime";
import type { BridgeEvent } from "../types";

const KiroStatusSchema = z
  .object({
    sessionId: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

const KIRO_STATUS_METHODS = new Set([
  "_kiro.dev/compaction/status",
  "_kiro.dev/clear/status",
  "_kiro.dev/mcp/server_initialized",
  "_session/terminate",
]);

const KIRO_IGNORED_METHODS = new Set([
  "_kiro.dev/commands/available",
  "_kiro.dev/mcp/oauth_request",
  "_kiro.dev/metadata",
]);

function mapKiroStatusEvent(
  method: string,
  params: unknown,
): BridgeEvent | null {
  if (!KIRO_STATUS_METHODS.has(method)) {
    return null;
  }
  const parsed = KiroStatusSchema.safeParse(params);
  if (!parsed.success || !parsed.data.message?.trim()) {
    return null;
  }
  return {
    type: "system",
    content: parsed.data.message.trim(),
  };
}

/** Keep Kiro namespaced notifications outside the stable ACP mapper. */
export function createKiroExtensionRuntime(args: {
  emit: (event: BridgeEvent) => void;
}): AcpProviderExtensionRuntime {
  return {
    onNotification: (method, params) => {
      const event = mapKiroStatusEvent(method, params);
      if (event) {
        args.emit(event);
        return true;
      }
      return KIRO_STATUS_METHODS.has(method) || KIRO_IGNORED_METHODS.has(method);
    },
  };
}
