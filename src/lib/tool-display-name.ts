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

  stave_list_repositories: "View repositories",
  stave_register_repository: "Add repository",
  stave_create_workspace: "Create workspace",
  stave_run_task: "Run task",
  stave_get_task: "Open task",
  stave_delegate_task: "Start subagent",
  stave_list_delegated_tasks: "View subagents",
  stave_follow_up_delegated_task: "Send subagent follow-up",
  stave_stop_delegated_task: "Stop subagent",
  stave_list_automations: "View schedules",
  stave_create_automation: "Create schedule",
  stave_update_automation: "Update schedule",
  stave_remove_automation: "Remove schedule",
  stave_set_automation_enabled: "Update schedule status",
  stave_run_automation_now: "Run schedule now",
  stave_list_automation_information_references: "View schedule references",
  stave_create_automation_information_resource: "Add schedule resource",
  stave_list_wake_ups: "View check-backs",
  stave_get_wake_up: "Open check-back",
  stave_create_wake_up: "Add check-back",
  stave_update_wake_up: "Update check-back",
  stave_set_wake_up_paused: "Update check-back status",
  stave_remove_wake_up: "Remove check-back",
  stave_get_workspace_information: "Read workspace context",
  stave_replace_workspace_notes: "Replace workspace notes",
  stave_append_workspace_notes: "Add workspace note",
  stave_write_plan_file: "Write plan file",
  stave_render_html: "Show HTML page",
  stave_preview_html: "Preview HTML page",
  stave_clear_workspace_notes: "Clear workspace notes",
  stave_add_workspace_todo: "Add workspace todo",
  stave_update_workspace_todo: "Update workspace todo",
  stave_remove_workspace_todo: "Remove workspace todo",
  stave_add_workspace_resource: "Attach workspace resource",
  stave_remove_workspace_resource: "Remove workspace resource",
  stave_add_workspace_custom_field: "Add workspace field",
  stave_set_workspace_custom_field: "Update workspace field",
  stave_remove_workspace_custom_field: "Remove workspace field",
  stave_remember: "Remember repository fact",
  stave_forget: "Forget repository fact",
  stave_list_repository_memories: "View repository memory",
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
