import type { BridgeEvent } from "./types";

function modelId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value)
    ? value : undefined;
}

/** Thread response.model and model/rerouted: verified against CLI 0.156.1 schema. */
export function createCodexModelResolutionTracker(requestedModel?: string) {
  let currentModel = modelId(requestedModel);
  const pending: Record<string, unknown>[] = [];

  const resolve = (actualModel: unknown, fromModel?: unknown, reason?: unknown): BridgeEvent[] => {
    const actual = modelId(actualModel);
    if (!actual || actual === currentModel) return [];
    const previous = modelId(fromModel) ?? currentModel;
    currentModel = actual;
    const events: BridgeEvent[] = [{
      type: "model_resolved", resolvedProviderId: "codex", resolvedModel: actual,
    }];
    if (previous && previous !== actual) {
      const explanation = reason === "highRiskCyberActivity"
        ? "Codex rerouted this turn under its high-risk cyber activity policy."
        : "Codex selected a different model; the runtime did not provide a recognized reason.";
      events.push({ type: "system", content: `Model changed: ${previous} → ${actual}.\n${explanation}` });
    }
    return events;
  };

  return {
    resolve,
    /** Notifications can precede the turn/start response continuation. */
    noteReroute(params: Record<string, unknown>, activeTurnId: string): BridgeEvent[] {
      if (typeof params.turnId !== "string") return [];
      if (!activeTurnId) {
        pending.push(params);
        return [];
      }
      return resolve(params.toModel, params.fromModel, params.reason);
    },
    flush(turnId: string): BridgeEvent[] {
      return pending.splice(0).flatMap((reroute) => reroute.turnId === turnId
        ? resolve(reroute.toModel, reroute.fromModel, reroute.reason) : []);
    },
  };
}
