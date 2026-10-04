import { DEFAULT_PROVIDER_TIMEOUT_MS } from "./runtime-option-contract";
import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";
import {
  normalizedPermissionOptions,
  type DelegationPermissionOptions,
  type DelegationPermissionSettings,
} from "../runs/delegation-policy";

/** Unanswered managed approvals expire; the user can answer them through Fleet. */
export const MANAGED_TASK_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The user's own permission settings for a turn the user did not send and no
 * consent widened: a managed task's omitted fields, a wake-up, an agent run on
 * "Your settings". The same source and normalization as delegation's
 * `provider-settings`: the settings the renderer synced to the host, with
 * guarded defaults (Claude `default` + sandbox, Codex `untrusted` +
 * workspace-write, network off) for any field — or provider — never synced.
 * Undefined for providers without synced permission settings, whose runtime
 * keeps its own.
 */
export function userSettingsPermissionOptions(
  providerId: ProviderId,
  settings: DelegationPermissionSettings | null | undefined,
): DelegationPermissionOptions | undefined {
  if (providerId !== "claude-code" && providerId !== "codex") return undefined;
  return normalizedPermissionOptions(providerId, settings?.[providerId] ?? {});
}

/** Managed ownership changes who controls a task, never its permissions. */
export function resolveManagedTaskRuntimeOptions(args: {
  providerId: ProviderId;
  runtimeOptions?: ProviderRuntimeOptions;
  /** Synced user permissions fill omitted fields; explicit trusted options win. */
  defaultPermissionOptions?: DelegationPermissionOptions;
  /**
   * Settings.providerTimeoutMs as seen by the host (synced through the
   * automation timeout key). Caller-supplied `runtimeOptions.providerTimeoutMs`
   * still wins; this is only the managed-task fallback.
   */
  defaultProviderTimeoutMs?: number;
}): ProviderRuntimeOptions {
  const requested = {
    ...args.defaultPermissionOptions,
    ...Object.fromEntries(
      Object.entries(args.runtimeOptions ?? {}).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  } as ProviderRuntimeOptions;
  // Interactive turns always pass `settings.providerTimeoutMs`. Managed
  // callers typically omit it, and the provider runtime's last-resort
  // fallback used to be 5 minutes — far shorter than the 12-hour product
  // default a regular task gets.
  const providerTimeoutMs =
    requested.providerTimeoutMs ??
    args.defaultProviderTimeoutMs ??
    DEFAULT_PROVIDER_TIMEOUT_MS;
  return { ...requested, providerTimeoutMs };
}
