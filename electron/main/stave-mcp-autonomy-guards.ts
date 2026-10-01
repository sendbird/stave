import type { AutomationUpsertInput } from "../../src/lib/automations";
import { PERMISSION_RUNTIME_OPTION_KEYS } from "../../src/lib/policy/turn-policy";
import { RuntimeOptionsObjectSchema } from "./ipc/schemas";

/**
 * What a Stave Local MCP caller (a model, or a CLI in a terminal) may ask for.
 * Every MCP client authenticates with the same local token, so the server
 * treats them all as an agent: none of them may widen a turn's permissions,
 * schedule work that runs without the user turning it on, or grant consent.
 */

type PermissionKey = (typeof PERMISSION_RUNTIME_OPTION_KEYS)[number];

/**
 * `stave_run_task` runtime options: model, effort and the other non-permission
 * fields. The schema stays strict, so a permission key is rejected with an
 * error rather than dropped; the spawned turn takes its permissions from the
 * user's settings and the turn policy.
 */
export const McpRunTaskRuntimeOptionsSchema = RuntimeOptionsObjectSchema.omit(
  Object.fromEntries(PERMISSION_RUNTIME_OPTION_KEYS.map((key) => [key, true])) as Record<PermissionKey, true>,
);

function assertNoUnattendedAutomation(input: AutomationUpsertInput) {
  if (input.trustPolicy === "unattended") {
    throw new Error("Unattended automations can only be configured in Stave's Automations panel.");
  }
  const runtime = input.runtime;
  if (runtime.provider === "claude-code" &&
      (runtime.permissionMode === "bypassPermissions" || runtime.allowDangerouslySkipPermissions)) {
    throw new Error("A bypass-permissions automation can only be configured in Stave's Automations panel.");
  }
  if (runtime.provider === "codex" && runtime.fileAccess === "danger-full-access") {
    throw new Error("A full-access automation can only be configured in Stave's Automations panel.");
  }
}

/** A schedule a model proposes is saved paused; the user turns it on. */
export function mcpAutomationCreateInput(input: AutomationUpsertInput): AutomationUpsertInput {
  assertNoUnattendedAutomation(input);
  return { ...input, enabled: false };
}

/** An MCP edit keeps a paused automation paused. */
export function mcpAutomationUpdateInput(
  input: AutomationUpsertInput,
  current: { enabled: boolean } | null | undefined,
): AutomationUpsertInput {
  assertNoUnattendedAutomation(input);
  return { ...input, enabled: input.enabled && current?.enabled === true };
}

/** MCP may pause an automation; only the user resumes one. */
export function assertMcpAutomationEnabledChange(enabled: boolean) {
  if (enabled) {
    throw new Error("Only the user can turn an automation on. Ask them to enable it in Stave's Automations panel.");
  }
}
