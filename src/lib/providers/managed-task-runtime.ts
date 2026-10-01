import { DEFAULT_PROVIDER_TIMEOUT_MS } from "./runtime-option-contract";
import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";
import type { DelegationPermissionOptions } from "../runs/delegation-policy";

/** Unanswered managed approvals expire; the user can answer them through Fleet. */
export const MANAGED_TASK_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

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
