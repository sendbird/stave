import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tarsCheckCommandRules, tarsCheckScripts, tarsPackageManagerOf } from "../../src/lib/tars/check-commands";
import type { DelegationPermissionPolicy } from "../../src/lib/runs/delegation-policy";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";

/** The built-in agent a Tars run's review stage delegates to (`tarsWorkflow`). */
export const TARS_REVIEWER_AGENT_ID = "reviewer";
const LOCKFILES = ["bun.lock", "bun.lockb", "pnpm-lock.yaml", "yarn.lock", "package-lock.json"] as const;

/** The check-command rules for one checkout, read from its package.json; none when it has none. */
export function readTarsCheckCommandRules(workspacePath: string): string[] {
  const manifest = path.join(workspacePath, "package.json");
  if (!existsSync(manifest)) return [];
  let parsed: { scripts?: unknown; packageManager?: unknown };
  try { parsed = JSON.parse(readFileSync(manifest, "utf8")) as typeof parsed; } catch { return []; }
  const manager = tarsPackageManagerOf({ packageManagerField: parsed.packageManager,
    lockfiles: LOCKFILES.filter((name) => existsSync(path.join(workspacePath, name))) });
  return tarsCheckCommandRules(manager, tarsCheckScripts(parsed.scripts));
}

/**
 * Where a delegation's parent is a Tars run's lead task, the checkout that
 * run works in; null for any other parent, so no other delegation is affected.
 */
export function tarsExecutionCheckoutOf(parentTaskId: string, responsibilities: readonly TarsResponsibility[],
  registry: readonly PersistenceRepositoryRegistryEntry[]): string | null {
  const row = responsibilities.find((entry) => entry.taskId === parentTaskId && entry.executionWorkspaceId);
  if (!row) return null;
  const repository = registry.find((entry) => path.resolve(entry.repositoryPath) === path.resolve(row.repositoryPath));
  const checkout = repository?.workspacePathById?.[row.executionWorkspaceId!];
  return checkout && path.isAbsolute(checkout) ? checkout : null;
}

/**
 * User decision D6: a Tars run's read-only reviewer may run the repository's
 * check commands. Only a Claude read-only delegation to the reviewer whose
 * parent is a Tars lead task gains the rules; the read-only sandbox, the
 * deny-by-default mode and the removed edit tools stay, so the delegation
 * still cannot write (`isReadOnlyDelegationPolicy` holds). Everything else is
 * returned unchanged.
 */
export function withTarsReviewerCheckCommands(policy: DelegationPermissionPolicy, args: {
  agentConfigId?: string; checkout: string | null; readRules?: (checkout: string) => string[];
}): DelegationPermissionPolicy {
  if (policy.providerId !== "claude-code" || policy.access !== "read-only" || args.agentConfigId !== TARS_REVIEWER_AGENT_ID || !args.checkout) return policy;
  const rules = (args.readRules ?? readTarsCheckCommandRules)(args.checkout);
  if (!rules.length) return policy;
  const allowed = [...new Set([...(policy.options.claudeAllowedTools ?? []), ...rules])];
  return { ...policy, options: { ...policy.options, claudeAllowedTools: allowed } };
}
