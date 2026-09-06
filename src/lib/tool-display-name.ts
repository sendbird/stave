const FRIENDLY_TOOL_DISPLAY_NAMES: Record<string, string> = {
  stave_lens_open_session: "Open browser",
  stave_lens_close_session: "Close browser",
  stave_lens_present_session: "Show browser",
  stave_lens_navigate: "Open page",
  stave_lens_list_saved_accounts: "View saved accounts",
  stave_lens_create_saved_account: "Save account",
  stave_lens_update_saved_account: "Update saved account",
  stave_lens_delete_saved_account: "Remove saved account",
  stave_lens_fill_saved_account: "Fill saved account",
  stave_lens_screenshot: "Capture screen",
  stave_lens_get_html: "Read page markup",
  stave_lens_get_text: "Read page text",
  stave_lens_evaluate: "Check page state",
  stave_lens_get_console: "Check console",
  stave_lens_get_network: "Check network",
  stave_lens_download: "Download file",
  stave_lens_list_downloads: "View downloads",
  stave_lens_get_annotations: "Read annotations",
  stave_lens_set_style: "Adjust page style",
  stave_lens_inspect: "Inspect element",
  stave_lens_measure: "Measure layout",
  stave_lens_click: "Click element",
  stave_lens_type: "Enter text",
  stave_lens_snapshot: "Inspect page",
  stave_lens_reload: "Reload page",
  stave_lens_set_appearance: "Change page appearance",
  stave_lens_list_sessions: "View browser sessions",

  stave_list_projects: "View projects",
  stave_register_project: "Add project",
  stave_create_workspace: "Create workspace",
  stave_run_task: "Run task",
  stave_get_task: "Open task",
  stave_delegate_task: "Delegate to child task",
  stave_list_child_tasks: "View child tasks",
  stave_follow_up_child_task: "Send child task follow-up",
  stave_stop_child_task: "Stop child task",
  stave_list_routines: "View routines",
  stave_create_routine: "Create routine",
  stave_update_routine: "Update routine",
  stave_remove_routine: "Remove routine",
  stave_set_routine_enabled: "Update routine status",
  stave_run_routine_now: "Run routine now",
  stave_list_routine_information_references: "View routine references",
  stave_create_routine_information_resource: "Add routine resource",
  stave_list_task_heartbeats: "View task heartbeats",
  stave_get_task_heartbeat: "Open task heartbeat",
  stave_create_task_heartbeat: "Add task heartbeat",
  stave_update_task_heartbeat: "Update task heartbeat",
  stave_set_task_heartbeat_paused: "Update heartbeat status",
  stave_remove_task_heartbeat: "Remove task heartbeat",
  stave_get_workspace_information: "Read workspace context",
  stave_replace_workspace_notes: "Replace workspace notes",
  stave_append_workspace_notes: "Add workspace note",
  stave_clear_workspace_notes: "Clear workspace notes",
  stave_add_workspace_todo: "Add workspace todo",
  stave_update_workspace_todo: "Update workspace todo",
  stave_remove_workspace_todo: "Remove workspace todo",
  stave_add_workspace_resource: "Attach workspace resource",
  stave_remove_workspace_resource: "Remove workspace resource",
  stave_add_workspace_custom_field: "Add workspace field",
  stave_set_workspace_custom_field: "Update workspace field",
  stave_remove_workspace_custom_field: "Remove workspace field",
  stave_remember: "Remember project fact",
  stave_forget: "Forget project fact",
  stave_list_project_memories: "View project memory",
  stave_add_workspace_jira_issue: "Attach Jira issue",
  stave_add_workspace_crane_issue: "Attach Crane issue",
  stave_add_workspace_confluence_page: "Attach Confluence page",
  stave_add_workspace_storybook_resource: "Attach Storybook resource",
  stave_update_workspace_storybook_resource_access: "Update Storybook access",
  stave_add_workspace_figma_resource: "Attach Figma resource",
  stave_add_workspace_slack_thread: "Attach Slack thread",
  stave_add_workspace_amplify_link: "Attach deployment link",
  stave_respond_approval: "Respond to approval",
  stave_respond_user_input: "Respond to question",
};

const KNOWN_STAVE_TOOL_NAMES = new Set(Object.keys(FRIENDLY_TOOL_DISPLAY_NAMES));

function getToolLeafName(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();
  const withoutGenericPrefix = normalized.replace(/^tool[-_:]?/, "");
  const namespaceLeaf = withoutGenericPrefix.split(":").at(-1) ?? withoutGenericPrefix;
  const mcpLeaf = namespaceLeaf.split("__").at(-1) ?? namespaceLeaf;
  const actionLeaf = mcpLeaf.split(".").at(-1) ?? mcpLeaf;
  return actionLeaf.replace(/[\s-]+/g, "_");
}

function getToolNameSegments(toolName: string): string[] {
  return toolName
    .trim()
    .toLowerCase()
    .split(/__|:|\./)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isStaveNamespaceSegment(segment: string | undefined): boolean {
  const normalized = segment?.trim().toLowerCase().replaceAll(/[_ ]+/g, "-");
  return normalized === "stave-local" || normalized === "stave-local-mcp";
}

/** Returns true only for tools owned by Stave's managed MCP surface. */
export function isStaveToolName(toolName: string): boolean {
  const segments = getToolNameSegments(toolName);
  const [first, second] = segments;
  const hasManagedNamespace =
    isStaveNamespaceSegment(first) ||
    (first === "mcp" && isStaveNamespaceSegment(second)) ||
    (first === "tool" && isStaveNamespaceSegment(second));

  if (hasManagedNamespace) {
    return true;
  }

  return segments.length === 1 && KNOWN_STAVE_TOOL_NAMES.has(getToolLeafName(toolName));
}

function capitalizeFirst(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/**
 * Converts provider/MCP identifiers into action-oriented UI copy.
 *
 * The raw identifier is intentionally not mutated in provider events or tool
 * payloads; this helper is only for human-facing titles.
 */
export function toStaveToolDisplayName(toolName: string): string {
  const trimmed = toolName.trim();
  if (!trimmed) {
    return "Tool";
  }

  if (!isStaveToolName(trimmed)) {
    return trimmed;
  }

  const leafName = getToolLeafName(trimmed);
  const friendlyName = FRIENDLY_TOOL_DISPLAY_NAMES[leafName];
  if (friendlyName) {
    return friendlyName;
  }

  const displayName = leafName.replace(/^stave_/, "").replaceAll(/[_-]+/g, " ").trim();
  return displayName ? capitalizeFirst(displayName) : "Tool";
}

/**
 * Human-facing tool title. Stave tools get product copy; external MCP names
 * remain untouched so the UI does not rebrand or reinterpret another server.
 */
export function toToolDisplayName(toolName: string): string {
  return toStaveToolDisplayName(toolName);
}
