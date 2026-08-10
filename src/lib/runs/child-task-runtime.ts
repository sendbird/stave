import type {
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import {
  applyAutomationTrustPolicyToRuntime,
  automationPermissionModeToTrustPolicy,
  createDefaultRoutineRuntime,
  routineRuntimeToProviderOptions,
} from "@/lib/routines";
import type { ChildTaskPermissionProfile } from "@/lib/runs/child-task";

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
  permissionProfile: ChildTaskPermissionProfile;
}): ProviderRuntimeOptions {
  const base = createDefaultRoutineRuntime(args.providerId);
  const runtime = applyAutomationTrustPolicyToRuntime(
    args.model ? { ...base, model: args.model } : base,
    automationPermissionModeToTrustPolicy(args.permissionProfile),
  );
  return routineRuntimeToProviderOptions(runtime);
}
