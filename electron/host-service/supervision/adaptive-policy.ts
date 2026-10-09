import { currentProviderAccountId } from "../../provider-accounts/runtime-scope";
import { AdaptiveRunPolicySchema, type AdaptiveRunPolicy } from "../../../src/lib/agent-runs/resources";
import type { AgentConfig } from "../../../src/lib/agents/schema";
import { getModelCapability, getSdkModelOptions, inferProviderIdFromModel, listCodexReasoningEffortsForModel } from "../../../src/lib/providers/model-catalog";
import { resolveAutoRoutingProfile, routeEffortOverrides } from "../../../src/lib/routing/auto-routing";
import type { AgentRouteSettings } from "../../../src/lib/routing/agent-run-route";
import type { PromptDraftRuntimeOverrides } from "../../../src/types/chat";

/** Capture intent once. A later settings or composer edit cannot widen a Run. */
export function freezeAdaptivePolicy(args: {
  providerId: AdaptiveRunPolicy["providerId"]; model: string; agent: AgentConfig | null;
  draft?: PromptDraftRuntimeOverrides | null; settings: AgentRouteSettings | null; maxTurns: number;
  delegated?: boolean; effort?: string; modelPinned?: boolean; effortPinned?: boolean;
}): AdaptiveRunPolicy {
  const { providerId, agent, draft } = args;
  const fixedModel = agent?.model.mode === "fixed" ? agent.model : null;
  if (fixedModel && fixedModel.providerId !== providerId) throw new Error("The fixed Agent provider must match the adaptive Run provider.");
  if (draft?.model && (draft.modelProviderId ?? inferProviderIdFromModel({ model: draft.model })) !== providerId) throw new Error("The composer pin must match the adaptive Run provider.");
  const model = (!args.delegated && draft?.model) || fixedModel?.model || args.model;
  const fixed = agent?.model.mode === "fixed";
  const modelLocked = fixed || args.modelPinned === true || (!args.delegated && Boolean(draft?.model || draft?.autoRouting === false));
  const requestedEffort = args.effort ?? (providerId === "codex" ? draft?.codexReasoningEffort : draft?.claudeEffort) ??
    fixedModel?.effort ??
    (providerId === "codex" ? getModelCapability({ model })?.defaultCodexReasoningEffort : getModelCapability({ model })?.defaultClaudeEffort);
  const effective = routeEffortOverrides({ providerId, model, effort: requestedEffort });
  const effortLocked = Boolean(args.effortPinned || fixedModel?.effort || (!args.delegated && (providerId === "codex" ? draft?.codexReasoningEffort : draft?.claudeEffort)));
  const initialEffort = effective.claudeEffort ?? effective.codexReasoningEffort ?? null;
  const supported = providerId !== "codex" || !initialEffort || listCodexReasoningEffortsForModel({ model }).some((value) => value === initialEffort);
  if (effortLocked && (requestedEffort !== initialEffort || !supported)) throw new Error("The pinned effort is not supported by this adaptive model. Choose a supported effort before starting.");
  if (!supported) throw new Error("The adaptive model does not support its initial effort. Choose a supported effort before starting.");
  // The routing profile's eligible models; empty means the whole catalog.
  const eligible = args.settings ? resolveAutoRoutingProfile(args.settings.routing).eligibleModelsByProvider[providerId] : undefined;
  const candidates = eligible?.length ? eligible : getSdkModelOptions({ providerId });
  return AdaptiveRunPolicySchema.parse({ version: 1, profile: "balanced", providerId,
    accountProfileId: (providerId === "codex" ? draft?.codexAccountProfileId : draft?.claudeAccountProfileId) ?? currentProviderAccountId(providerId),
    allowedModels: modelLocked ? [model] : [...new Set([model, ...candidates.filter((id) => getModelCapability({ model: id })?.providerId === providerId)])],
    modelLocked, effortLocked, initialEffort,
    teamTurns: Math.min(args.maxTurns, 30), concurrentHelpers: 2, totalHelpers: 4, parentReserve: 1,
    maxChanges: 2, cooldownTurns: 2 });
}
