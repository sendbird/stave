import {
  DelegationPermissionSettingsSchema,
  permissionOptions,
  resolveDelegationPermissionPolicy,
  type DelegationAccess,
  type DelegationPermissionPolicy,
} from "../../src/lib/runs/delegation-policy";
import { autonomyOfOptions, resolveTurnPolicy } from "../../src/lib/policy/turn-policy";
import { ensureHostServicePersistenceReady } from "./persistence";
import { setTaskPermissionObserver } from "../providers/runtime";

export function registerDelegationPolicyObserver() {
  setTaskPermissionObserver(({ taskId, providerId, options }) =>
    ensureHostServicePersistenceReady().delegationPolicies.saveEffective(
      taskId,
      providerId,
      options,
    ),
  );
}
export function syncDelegationPermissionSettings(raw: unknown) {
  ensureHostServicePersistenceReady().delegationPolicies.saveSettings(
    DelegationPermissionSettingsSchema.parse(raw),
  );
  return { ok: true };
}
export function resolveHostDelegationPolicy(args: {
  parentTaskId: string;
  delegatedTaskId: string;
  providerId: "claude-code" | "codex";
  permissionProfile?: "inherit" | "auto" | "guided" | "manual";
  access?: DelegationAccess;
  requestedProfile?: "inherit" | "auto" | "guided" | "manual";
  permissionCeiling?: import("../../src/lib/agents/schema").AgentPermission;
}): DelegationPermissionPolicy {
  const store = ensureHostServicePersistenceReady().delegationPolicies;
  const parent = store.loadEffective(args.parentTaskId);
  // A delegated Agent's saved permission matters only when it is read only;
  // any other value is full access, so it no longer lowers the helper.
  const readOnlyAgent = args.permissionCeiling === "read-only";
  const policy = helperAutonomyPolicy(args.providerId, parent, args.permissionProfile, resolveDelegationPermissionPolicy({
    providerId: args.providerId,
    permissionProfile: args.permissionProfile,
    access: readOnlyAgent ? "read-only" : args.access,
    requestedProfile: args.requestedProfile,
    parent,
    settings: store.loadSettings()?.[args.providerId],
    recorded: store.loadTask(args.delegatedTaskId),
  }));
  // The first admission pins this policy; later starts may only narrow it.
  store.saveTask(args.delegatedTaskId, policy);
  return policy;
}

/**
 * A helper takes its parent's autonomy, never more. A same-provider helper
 * already inherits the parent's resolved options; one on the other provider
 * starts from the user's settings there, so an autonomous parent lifts it to
 * that provider's prompt-free options. A profile the caller narrowed to
 * (`manual`/`guided`) and a read-only helper are left as resolved.
 */
export function helperAutonomyPolicy(
  providerId: "claude-code" | "codex",
  parent: { providerId: "claude-code" | "codex"; options: Record<string, unknown> } | null | undefined,
  profile: "inherit" | "auto" | "guided" | "manual" | undefined,
  policy: DelegationPermissionPolicy,
): DelegationPermissionPolicy {
  if (!parent || policy.access === "read-only" || profile === "manual" || profile === "guided") return policy;
  const lifted = resolveTurnPolicy({
    providerId, options: policy.options, root: "",
    actor: { kind: "helper", parent: autonomyOfOptions(parent.providerId, parent.options), access: "inherit" },
  });
  return lifted.autonomy === "autonomous"
    ? { ...policy, options: permissionOptions(providerId, { ...policy.options, ...lifted.options }) }
    : policy;
}

/**
 * What a delegation the model leaves unspecified falls back to: the provider
 * and effort of the parent's latest turn. Null when the parent never ran a
 * Claude or Codex turn here, so the caller has to name a provider.
 */
export function resolveHostDelegationDefaults(args: { parentTaskId: string }) {
  return ensureHostServicePersistenceReady().delegationPolicies.loadParentTurnDefaults(
    args.parentTaskId,
  );
}
