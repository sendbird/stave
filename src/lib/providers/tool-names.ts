import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";

/**
 * Tool names that write to the working tree, across the providers Stave drives.
 *
 * A `diff` event is the authoritative signal that a turn changed files, but not
 * every provider emits one for every edit path (a shell `sed`/`git apply`, an
 * MCP-side writer). The name list is the second, cheaper signal; together they
 * decide whether a post-turn diff check has anything new to look at.
 *
 * Matching is case-insensitive and ignores an MCP prefix, so
 * `mcp__something__write_file` matches `write_file`.
 */
const FILE_MUTATING_TOOL_NAMES = new Set([
  "edit",
  "multiedit",
  "write",
  "notebookedit",
  "applypatch",
  "apply_patch",
  "str_replace",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "create_file",
  "edit_file",
  "write_file",
  "update_file",
  "delete_file",
  "patch_file",
]);

/** Shell tools: a command can edit files, so they count as possible mutations. */
const SHELL_TOOL_NAMES = new Set([
  "bash",
  "shell",
  "run_command",
  "execute_command",
  "local_shell",
  "terminal",
]);

function normalizeToolName(toolName: string) {
  const trimmed = toolName.trim().toLowerCase();
  const segments = trimmed.split("__");
  return segments[segments.length - 1] ?? trimmed;
}

export function isFileMutatingToolName(toolName: string) {
  const normalized = normalizeToolName(toolName);
  return (
    FILE_MUTATING_TOOL_NAMES.has(normalized) || SHELL_TOOL_NAMES.has(normalized)
  );
}

/**
 * Whether this batch of provider events shows the turn touching the working
 * tree. Deliberately inclusive: a false positive costs one extra diff check,
 * while a false negative would silently skip the guard on a real edit.
 */
export function eventsIndicateFileEdits(
  events: readonly NormalizedProviderEvent[],
) {
  return events.some((event) => {
    if (event.type === "diff") {
      return true;
    }
    if (event.type === "tool" || event.type === "tool_progress") {
      return isFileMutatingToolName(event.toolName);
    }
    return false;
  });
}
