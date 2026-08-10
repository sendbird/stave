import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";

/**
 * How long a managed task waits for an approval answer before denying it.
 *
 * A managed task is driven by another agent, and
 * `persistApprovalNotification` deliberately suppresses notifications for it,
 * so a prompt-mode approval has nobody guaranteed to answer. Without a
 * deadline the turn parks forever and the caller never gets a report back.
 */
export const MANAGED_TASK_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Permission modes that cannot make progress on their own inside a managed
 * task: `prompt` decisions in these modes need a human, and `dontAsk` denies
 * everything outside the Stave Local MCP allowlist.
 */
function resolveManagedClaudePermissionMode(
  requested: ProviderRuntimeOptions["claudePermissionMode"],
): NonNullable<ProviderRuntimeOptions["claudePermissionMode"]> {
  // `auto` is the autonomy preset users pick when they mean "just run it".
  // Interactively it still prompts for Bash; in a managed task that reads as a
  // hang, so it resolves to a real bypass here.
  if (!requested || requested === "auto") {
    return "bypassPermissions";
  }
  return requested;
}

/**
 * Fills in the access-level runtime fields a managed task needs.
 *
 * Callers of `stave_run_task` typically pass only `model`/`claudeEffort`, and
 * the provider runtimes fall back to interactive defaults (`acceptEdits` on
 * Claude, `untrusted` on Codex) that stop on every Bash call. This resolves
 * caller value first, managed default second, so an explicit override is still
 * honored while an unspecified one no longer inherits an interactive fallback.
 */
export function resolveManagedTaskRuntimeOptions(args: {
  providerId: ProviderId;
  runtimeOptions?: ProviderRuntimeOptions;
}): ProviderRuntimeOptions {
  const requested = args.runtimeOptions ?? {};
  if (args.providerId === "codex") {
    return {
      ...requested,
      codexApprovalPolicy: requested.codexApprovalPolicy ?? "never",
      codexFileAccess: requested.codexFileAccess ?? "workspace-write",
      codexAutoApproveStaveLocalMcpTools:
        requested.codexAutoApproveStaveLocalMcpTools ?? true,
    };
  }
  const claudePermissionMode = resolveManagedClaudePermissionMode(
    requested.claudePermissionMode,
  );
  const bypassing = claudePermissionMode === "bypassPermissions";
  return {
    ...requested,
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions:
      requested.claudeAllowDangerouslySkipPermissions ?? bypassing,
    claudeSandboxEnabled: requested.claudeSandboxEnabled ?? false,
    claudeAllowUnsandboxedCommands:
      requested.claudeAllowUnsandboxedCommands ?? true,
  };
}
