/**
 * The Stave Local MCP tools that are safe enough to run without ever asking the
 * user, regardless of the provider's permission posture.
 *
 * This list is shared by both runtimes on purpose. Claude and Codex express
 * permissions with completely different vocabularies — Claude resolves a
 * per-tool decision from a `ClaudePermissionMode`, while Codex answers an
 * `mcpServer/elicitation/request` under a server-wide auto-approve flag — and
 * the two drifted: a Codex run with any non-default sandbox setting prompted
 * for read-only calls like `stave_get_workspace_information` that Claude has
 * always allowed silently. Keeping the membership question in one module is
 * what makes the two runtimes answer it the same way.
 *
 * Membership rule: a tool belongs here when it only reads Stave state or edits
 * the workspace's own metadata (notes, todos, resources, routine definitions).
 * Anything that spends tokens, starts an agent, or stops one does not — those
 * stay on each provider's normal approval path.
 */
const STAVE_LOCAL_MCP_ALWAYS_ALLOWED_TOOL_NAMES = new Set([
  "stave_get_workspace_information",
  "stave_replace_workspace_notes",
  "stave_append_workspace_notes",
  "stave_clear_workspace_notes",
  "stave_add_workspace_todo",
  "stave_update_workspace_todo",
  "stave_remove_workspace_todo",
  "stave_add_workspace_resource",
  "stave_remove_workspace_resource",
  "stave_add_workspace_jira_issue",
  "stave_add_workspace_crane_issue",
  "stave_add_workspace_confluence_page",
  "stave_add_workspace_storybook_resource",
  "stave_update_workspace_storybook_resource_access",
  "stave_add_workspace_figma_resource",
  "stave_add_workspace_slack_thread",
  "stave_add_workspace_amplify_link",
  "stave_add_workspace_custom_field",
  "stave_set_workspace_custom_field",
  "stave_remove_workspace_custom_field",
  "stave_list_routines",
  "stave_create_routine",
  "stave_update_routine",
  "stave_remove_routine",
  "stave_set_routine_enabled",
  "stave_list_routine_information_references",
  "stave_create_routine_information_resource",
  // Reading delegation state is safe. Creating a child task and stopping one
  // are not, so `stave_delegate_task` and `stave_stop_child_task` stay on the
  // approval path alongside `stave_run_task`.
  "stave_list_child_tasks",
  // The one deliberate exception to the "spends tokens" rule: an Advisor
  // consult can only run against a grant the user armed for this exact turn
  // (composer pill / Alt+A), against the target and per-turn budget the user
  // chose. The spend was authorised at arm time; prompting again per consult
  // would break the "quick second opinion" flow the feature exists for. The
  // consult itself is read-only and tool-less.
  "stave_consult_advisor",
  // Same line the routine tools sit on: defining or pausing scheduled work only
  // edits a definition, so it belongs here, while anything that starts a turn
  // right now (`stave_run_routine_now`) does not. A heartbeat has no immediate
  // trigger at all, so all six of its tools are definition edits.
  "stave_list_task_heartbeats",
  "stave_get_task_heartbeat",
  "stave_create_task_heartbeat",
  "stave_update_task_heartbeat",
  "stave_set_task_heartbeat_paused",
  "stave_remove_task_heartbeat",
]);

/**
 * Reduces a provider-decorated tool name to its bare Stave tool name.
 *
 * Callers hand us wildly different shapes for the same tool: Claude reports
 * `mcp__stave-local-mcp__stave_list_child_tasks`, while Codex elicitation
 * metadata may report `stave-local__stave_list_child_tasks`, a dotted
 * `stave-local.stave_list_child_tasks`, or the bare name. Normalising here
 * keeps that decoding in one place instead of at each call site.
 */
export function normalizeStaveLocalMcpToolName(toolName: string) {
  const normalized = toolName.trim().toLowerCase();
  const afterNamespace = normalized.split("__").at(-1) ?? normalized;
  return afterNamespace.split(".").at(-1) ?? afterNamespace;
}

/**
 * Whether a Stave Local MCP tool may be auto-approved no matter what permission
 * mode or sandbox policy the run is under.
 *
 * Fails safe: an unrecognised or undecodable name is not in the set, so it
 * falls through to the caller's normal approval path.
 */
export function isAlwaysAllowedStaveLocalMcpTool(toolName: string) {
  return STAVE_LOCAL_MCP_ALWAYS_ALLOWED_TOOL_NAMES.has(
    normalizeStaveLocalMcpToolName(toolName),
  );
}
