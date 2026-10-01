import { resolveDelegationPermissionPolicy } from "./delegation-policy";
import { clampCodexEffortToModel } from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  createDefaultAutomationRuntime,
  automationRuntimeToProviderOptions,
  type AutomationRuntimeConfig,
} from "@/lib/automations";
import type {
  DelegatedTaskEffort,
  DelegatedTaskPermissionProfile,
} from "@/lib/runs/delegated-task";

/**
 * Clamps a requested delegation effort to a tier the child's provider and
 * model actually accept, stepping down rather than rejecting — the same
 * direction `resolveAdvisorEffort` moves for the same reason: a delegation
 * that asked for more reasoning than the model offers should get the closest
 * tier below it, not a silent fall back to the default.
 *
 * Omitted effort keeps the automation default the child always ran at, so
 * existing delegations that never mention effort behave exactly as before.
 */
function applyDelegatedTaskEffort(args: {
  base: AutomationRuntimeConfig;
  model: string;
  effort: DelegatedTaskEffort | undefined;
}): AutomationRuntimeConfig {
  if (args.base.provider === "codex") {
    if (!args.effort) {
      return { ...args.base, model: args.model };
    }
    const clamped = clampCodexEffortToModel({
      model: args.model,
      effort: args.effort,
    });
    return {
      ...args.base,
      model: args.model,
      // Codex's legacy "minimal" tier is not part of the delegation
      // vocabulary (nor the automation runtime's), so a clamp that lands there
      // collapses to "low" exactly as `resolveCodexAppServerReasoningEffort`
      // does downstream.
      effort: clamped === "minimal" ? "low" : clamped,
    };
  }
  if (!args.effort) {
    return { ...args.base, model: args.model };
  }
  return {
    ...args.base,
    model: args.model,
    // "ultra" is Codex-only; the nearest Claude tier below it is "max".
    effort: args.effort === "ultra" ? "max" : args.effort,
  };
}

/** Build model/effort independently from the host-resolved permission policy. */
export function buildDelegatedTaskRuntimeOptions(args: {
  providerId: ProviderId;
  model?: string;
  effort?: DelegatedTaskEffort;
  permissionProfile?: DelegatedTaskPermissionProfile;
  permissionPolicy?: import("./delegation-policy").DelegationPermissionPolicy;
}): ProviderRuntimeOptions {
  const base = createDefaultAutomationRuntime(args.providerId);
  const runtime = applyDelegatedTaskEffort({
    base,
    model: args.model ?? base.model,
    effort: args.effort,
  });
  const defaults = automationRuntimeToProviderOptions(runtime);
  const policy =
    args.permissionPolicy ??
    resolveDelegationPermissionPolicy({
      providerId: args.providerId as "claude-code" | "codex",
      permissionProfile: args.permissionProfile,
    });
  // Select model/effort explicitly: future automation fields cannot become child grants.
  const options: ProviderRuntimeOptions = { model: defaults.model };
  if (args.providerId === "claude-code") {
    options.claudeEffort = defaults.claudeEffort;
    options.claudeThinkingMode = defaults.claudeThinkingMode;
  } else if (args.providerId === "codex")
    options.codexReasoningEffort = defaults.codexReasoningEffort;
  return { ...options, ...policy.options };
}
