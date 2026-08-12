import { clampCodexEffortToModel } from "@/lib/providers/model-catalog";
import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  applyAutomationTrustPolicyToRuntime,
  automationPermissionModeToTrustPolicy,
  createDefaultRoutineRuntime,
  routineRuntimeToProviderOptions,
  type RoutineRuntimeConfig,
} from "@/lib/routines";
import type {
  ChildTaskEffort,
  ChildTaskPermissionProfile,
} from "@/lib/runs/child-task";

/**
 * Clamps a requested delegation effort to a tier the child's provider and
 * model actually accept, stepping down rather than rejecting — the same
 * direction `resolveAdvisorEffort` moves for the same reason: a delegation
 * that asked for more reasoning than the model offers should get the closest
 * tier below it, not a silent fall back to the default.
 *
 * Omitted effort keeps the routine default the child always ran at, so
 * existing delegations that never mention effort behave exactly as before.
 */
function applyChildTaskEffort(args: {
  base: RoutineRuntimeConfig;
  model: string;
  effort: ChildTaskEffort | undefined;
}): RoutineRuntimeConfig {
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
      // vocabulary (nor the routine runtime's), so a clamp that lands there
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

/**
 * A child's permissions are built from its declared profile alone. The parent's
 * settings, its bound secrets and its permission mode are never in scope here,
 * so there is no path by which a delegation quietly inherits more authority
 * than it asked for.
 *
 * The profile reuses the automation vocabulary (`auto` / `guided` / `manual`)
 * and its existing trust-policy mapping rather than introducing a second set of
 * permission words.
 */
export function buildChildTaskRuntimeOptions(args: {
  providerId: ProviderId;
  model?: string;
  effort?: ChildTaskEffort;
  permissionProfile: ChildTaskPermissionProfile;
}): ProviderRuntimeOptions {
  const base = createDefaultRoutineRuntime(args.providerId);
  const trustPolicy = automationPermissionModeToTrustPolicy(
    args.permissionProfile,
  );
  const runtime = applyAutomationTrustPolicyToRuntime(
    applyChildTaskEffort({
      base,
      model: args.model ?? base.model,
      effort: args.effort,
    }),
    trustPolicy,
  );
  const options = routineRuntimeToProviderOptions(runtime);
  if (args.providerId !== "codex") {
    // The Claude branch of `routineRuntimeToProviderOptions` already states
    // every permission field explicitly, so `resolveManagedTaskRuntimeOptions`
    // (which fills gaps with `??`) has nothing left to default.
    return options;
  }
  // The Codex branch does not mention `codexAutoApproveStaveLocalMcpTools`, and
  // a child always runs as an externally managed task — so leaving it unset
  // hands the decision to the managed-task default of `true`, whatever the
  // child's declared profile said. Both values are therefore explicit here.
  //
  // An unattended child needs `true`: nobody is watching it, and
  // `approvalPolicy: never` does not cover elicitation, which is a separate
  // channel whose unanswered requests are auto-declined on timeout — that would
  // silently strip the child of every Stave tool. Scheduled routines carry the
  // same flag for the same reason.
  //
  // A `guided` or `manual` child asked for its approvals to be reviewed, so it
  // gets `false` and keeps prompting inside its own task.
  return {
    ...options,
    codexAutoApproveStaveLocalMcpTools: trustPolicy === "unattended",
  };
}
