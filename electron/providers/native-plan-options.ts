import type { ProviderRuntimeOptions } from "../../src/lib/providers/provider.types";

function needsNativePlan(runtimeOptions: ProviderRuntimeOptions | undefined, secondaryReadOnly?: boolean) {
  return !secondaryReadOnly && Boolean(runtimeOptions?.agentInstructions?.trim());
}

/** Assigned primary agents publish progress through the existing TodoWrite contract. */
export function claudeNativePlanEnv(runtimeOptions: ProviderRuntimeOptions | undefined, secondaryReadOnly?: boolean) {
  // https://code.claude.com/docs/en/agent-sdk/todo-tracking#model-availability
  return needsNativePlan(runtimeOptions, secondaryReadOnly)
    ? { CLAUDE_CODE_ENABLE_TODO_TOOLS: "1", CLAUDE_CODE_ENABLE_TASKS: "0" }
    : {};
}

export function codexNativePlanConfig(runtimeOptions: ProviderRuntimeOptions | undefined, secondaryReadOnly?: boolean) {
  // Codex >= 0.152 opts in through tools.update_plan.enabled.
  return needsNativePlan(runtimeOptions, secondaryReadOnly) ? { "tools.update_plan.enabled": true } : {};
}
