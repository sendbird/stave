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
  // A child runs with nobody watching it, so a Codex child must also be able to
  // answer Stave Local MCP elicitations on its own. `approvalPolicy: never`
  // does not cover that: elicitation is a separate channel, and an unanswered
  // request is auto-declined once it times out, which would silently strip the
  // child of every Stave tool. Scheduled routines carry the same flag for the
  // same reason.
  if (args.providerId === "codex" && trustPolicy === "unattended") {
    return { ...options, codexAutoApproveStaveLocalMcpTools: true };
  }
  return options;
}
