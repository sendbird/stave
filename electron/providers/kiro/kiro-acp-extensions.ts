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
  "session/steer",
  "session/steer/clear",
]);

/**
 * Kiro reports turn usage on its own namespaced notification instead of the
 * stable ACP `usage_update`: a context-window percentage (the window size is
 * never disclosed) plus a metered spend list denominated in the plan's own
 * unit, usually credits rather than a currency.
 */
const KiroMetadataSchema = z
  .object({
    contextUsagePercentage: z.number().min(0).max(100).optional(),
    meteringUsage: z
      .array(
        z
          .object({
            value: z.number().nonnegative(),
            unit: z.string().trim().min(1).optional(),
            unitPlural: z.string().trim().min(1).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function mapKiroMetadataEvent(
  method: string,
  params: unknown,
): BridgeEvent | null {
  if (method !== "_kiro.dev/metadata") {
    return null;
  }
  const parsed = KiroMetadataSchema.safeParse(params);
  if (!parsed.success) {
    return null;
  }
  const { contextUsagePercentage, meteringUsage } = parsed.data;
  // Kiro re-sends the same notification without `meteringUsage` several times
  // per turn; only the final one carries spend. Sum the entries that share the
  // dominant unit so a multi-unit plan still reports something meaningful.
  const metered = meteringUsage?.filter((entry) => entry.value > 0) ?? [];
  const unit = metered[0]?.unitPlural ?? metered[0]?.unit;
  const amount = metered
    .filter((entry) => (entry.unitPlural ?? entry.unit) === unit)
    .reduce((total, entry) => total + entry.value, 0);
  if (contextUsagePercentage === undefined && metered.length === 0) {
    return null;
  }
  return {
    type: "context_usage",
    ...(contextUsagePercentage !== undefined
      ? { usedPercent: contextUsagePercentage }
      : {}),
    ...(metered.length > 0 && unit
      ? { costAmount: amount, costCurrency: unit }
      : {}),
  };
}

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
      const event =
        mapKiroStatusEvent(method, params) ??
        mapKiroMetadataEvent(method, params);
      if (event) {
        args.emit(event);
        return true;
      }
      return (
        KIRO_STATUS_METHODS.has(method) ||
        KIRO_IGNORED_METHODS.has(method) ||
        method === "_kiro.dev/metadata"
      );
    },
  };
}
