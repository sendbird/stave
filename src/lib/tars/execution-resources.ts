import type { AgentRunStartInput } from "../agent-runs/domain";
import type { AdaptiveRoutingIntent } from "../agent-runs/resources";
import { selectedProviderAccount } from "../providers/provider-account-selection";
import type { TarsResponsibility } from "./types";

/**
 * Project the saved selection into the existing Run admission contract, never
 * provider permissions. Execution is separate from the conversation's reasoning
 * model: without an explicit pin (`model` null) the run routes automatically,
 * so Stave Auto picks each turn's model and effort and helpers, including the
 * reviewer, may run on the other provider. A pin locks the whole team to that
 * model and its provider, at the model's default effort.
 */
export function buildTarsExecutionResources(
  row: Pick<TarsResponsibility, "providerId" | "model" | "runtimeHints">,
): Pick<AgentRunStartInput, "accounts" | "routingIntent"> {
  const hints = row.runtimeHints;
  const accountKey = row.providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
  const routingIntent: AdaptiveRoutingIntent = row.model
    ? { model: row.model, modelProviderId: row.providerId, autoRouting: false }
    : { autoRouting: true };
  return {
    ...(hints ? { accounts: { [accountKey]: selectedProviderAccount(row.providerId, hints) } } : {}),
    routingIntent,
  };
}

/** The execution provider and pin a delegate action admits: the explicit pin, else the conversation's provider on automatic routing. */
export function tarsExecutionTarget(settings: { providerId: "claude-code" | "codex"; executionModel?: { providerId: "claude-code" | "codex"; model: string } | undefined }) {
  return settings.executionModel
    ? { providerId: settings.executionModel.providerId, model: settings.executionModel.model }
    : { providerId: settings.providerId, model: null };
}
