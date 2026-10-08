// temporary-migration: plan-mode-removal
/**
 * Plan mode was removed. Settings, prompt drafts, queued turns, workspace
 * snapshots and automations saved before then can still carry its values:
 * a `"plan"` Claude permission mode or Cursor mode, the permission mode saved
 * before entering plan mode, the Codex plan toggle, the plan-mode approval
 * scope and Stave Auto's plan intent. These helpers rewrite them once, on read,
 * into values the current schemas accept.
 *
 * A retired `"plan"` mode never becomes a mode that grants more than asking:
 * Claude falls back to the mode saved before plan mode, else `default`, and
 * Cursor falls back to `agent`, whose approvals still follow the user's
 * Cursor approval setting. A per-task override (`dropRetiredModes`) is removed
 * instead, so the task follows the user's settings again.
 */

import type { ClaudePermissionMode } from "@/types/chat";

const CLAUDE_PERMISSION_MODES: readonly ClaudePermissionMode[] = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "dontAsk",
  "auto",
];

const RETIRED_PLAN_MODE_KEYS = [
  "claudePermissionModeBeforePlan",
  "claudePlanModeApprovalScope",
  "codexPlanMode",
  "autoRoutingPlanMode",
] as const;

function isClaudePermissionMode(value: unknown): value is ClaudePermissionMode {
  return (
    typeof value === "string" &&
    (CLAUDE_PERMISSION_MODES as readonly string[]).includes(value)
  );
}

/** The Claude permission mode to use in place of a retired `"plan"` value. */
export function replaceRetiredClaudePlanMode(args: {
  value: unknown;
  beforePlan?: unknown;
  fallback: ClaudePermissionMode;
}): unknown {
  if (args.value !== "plan") {
    return args.value;
  }
  return isClaudePermissionMode(args.beforePlan)
    ? args.beforePlan
    : args.fallback;
}

/**
 * Rewrites an object carrying plan-mode fields — settings, prompt-draft
 * runtime overrides or a queued turn — without plan mode. Returns the input
 * unchanged when it has nothing to rewrite.
 */
export function withoutRetiredPlanModeFields<T>(
  value: T,
  options: { dropRetiredModes?: boolean } = {},
): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const hasRetiredKey = RETIRED_PLAN_MODE_KEYS.some((key) =>
    Object.hasOwn(record, key),
  );
  const claudePlan = record.claudePermissionMode === "plan";
  const cursorPlan = record.cursorMode === "plan";
  if (!hasRetiredKey && !claudePlan && !cursorPlan) {
    return value;
  }
  const next: Record<string, unknown> = { ...record };
  if (claudePlan) {
    const beforePlan = record.claudePermissionModeBeforePlan;
    if (isClaudePermissionMode(beforePlan)) {
      next.claudePermissionMode = beforePlan;
    } else if (options.dropRetiredModes) {
      delete next.claudePermissionMode;
    } else {
      next.claudePermissionMode = "default";
    }
  }
  if (cursorPlan) {
    if (options.dropRetiredModes) {
      delete next.cursorMode;
    } else {
      next.cursorMode = "agent";
    }
  }
  for (const key of RETIRED_PLAN_MODE_KEYS) {
    delete next[key];
  }
  return next as T;
}
// end temporary-migration: plan-mode-removal
