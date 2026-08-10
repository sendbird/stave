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
  const trustPolicy = automationPermissionModeToTrustPolicy(
    args.permissionProfile,
  );
  const runtime = applyAutomationTrustPolicyToRuntime(
    args.model ? { ...base, model: args.model } : base,
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
