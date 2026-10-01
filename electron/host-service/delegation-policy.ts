import {
  DelegationPermissionSettingsSchema,
  resolveDelegationPermissionPolicy,
  type DelegationAccess,
  type DelegationPermissionPolicy,
} from "../../src/lib/runs/delegation-policy";
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
  const policy = resolveDelegationPermissionPolicy({
    providerId: args.providerId,
    permissionProfile: args.permissionProfile,
    access: args.access,
    requestedProfile: args.requestedProfile,
    permissionCeiling: args.permissionCeiling,
    parent: store.loadEffective(args.parentTaskId),
    settings: store.loadSettings()?.[args.providerId],
    recorded: store.loadTask(args.delegatedTaskId),
  });
  // The first admission pins this policy; later starts may only narrow it.
  store.saveTask(args.delegatedTaskId, policy);
  return policy;
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
