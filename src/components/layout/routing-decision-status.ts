import { getUtilityInferenceCapability, toHumanModelName } from "@/lib/providers/model-catalog";
import { routingDecisionNativeOrder, type RoutingDecisionConfig } from "@/lib/providers/routing-decision";

export function nativeDecisionModelName(providerId: "codex" | "claude-code") {
  return toHumanModelName({ model: getUtilityInferenceCapability({ providerId }).defaultModel });
}

/** What the Routing decision field reports as in effect; `kind` names the status copy. */
export type RoutingDecisionStatus =
  | { kind: "autoOff" }
  | { kind: "classifierOff" }
  | { kind: "inherit" }
  | { kind: "gateway"; model: string; connection: string; first: string; second: string }
  | { kind: "primary"; first: string; second: string };

/**
 * Classification runs only while Auto and model classification are both on.
 * A gateway choice whose connection is gone falls straight to the native
 * order, so it reports that order rather than the gateway.
 */
export function resolveRoutingDecisionStatus(args: {
  value?: RoutingDecisionConfig;
  allowInherit?: boolean;
  /** Label of the saved gateway connection, when it still exists. */
  connectionLabel?: string;
  /** Display name of the saved gateway model. */
  modelName?: string;
  autoRoutingEnabled: boolean;
  classifierEnabled: boolean;
}): RoutingDecisionStatus {
  if (!args.autoRoutingEnabled) return { kind: "autoOff" };
  if (!args.classifierEnabled) return { kind: "classifierOff" };
  if (args.allowInherit && !args.value) return { kind: "inherit" };
  const [first, second] = routingDecisionNativeOrder(args.value ?? { mode: "automatic" }).map(nativeDecisionModelName) as [string, string];
  if (args.value?.mode === "gateway" && args.connectionLabel) {
    return { kind: "gateway", model: args.modelName ?? args.value.model, connection: args.connectionLabel, first, second };
  }
  return { kind: "primary", first, second };
}
