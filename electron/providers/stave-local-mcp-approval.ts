import { READ_ONLY_DELEGATION_STAVE_TOOLS, READ_ONLY_STAVE_METADATA_TOOLS } from "../../src/lib/runs/read-only-delegation";

/**
 * The Stave Local MCP tools that are safe enough to run without ever asking the
 * user, regardless of the provider's permission posture.
 *
 * This list is shared by every in-app runtime on purpose. Claude resolves a
 * per-tool decision from a `ClaudePermissionMode`, Codex answers an
 * `mcpServer/elicitation/request` under a server-wide auto-approve flag, and
 * Cursor/Kiro answer `session/request_permission`. Those vocabularies drifted:
 * a Codex run with any non-default sandbox setting prompted for read-only
 * calls like `stave_get_workspace_information` that Claude has always allowed
 * silently. Keeping the membership question in one module is what makes the
 * runtimes answer it the same way.
 *
 * Membership rule: a tool belongs here when it only reads Stave state or edits
 * the workspace's own metadata (notes, todos, resources, automation definitions),
 * or when it asks the user itself and its own card is the consent
 * (`stave_request_secret`). Anything that spends tokens, starts an agent, or
 * stops one does not — those stay on each provider's normal approval path.
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
  // Writes only `<workspace>/.stave/context/plans/<name>.md`, Stave's plan store.
  "stave_write_plan_file",
  // Project memory is Stave metadata too: one short sentence per row, capped
  // and user-editable from the Information panel.
  "stave_remember",
  "stave_forget",
  "stave_list_repository_memories",
  // Reading the tracker cache is local and read-only. Starting a run from a
  // ticket is not, so kickoff has no tool at all and stays a user action.
  "stave_list_tracker_issues",
  "stave_list_automations",
  "stave_create_automation",
  "stave_update_automation",
  "stave_remove_automation",
  "stave_set_automation_enabled",
  "stave_list_automation_information_references",
  "stave_create_automation_information_resource",
  // Reading delegation state is safe. Creating a delegated task and stopping one
  // are not, so `stave_delegate_task` and `stave_stop_delegated_task` stay on the
  // approval path alongside `stave_run_task`.
  "stave_list_delegated_tasks",
  // Same line the automation tools sit on: defining or pausing scheduled work only
  // edits a definition, so it belongs here, while anything that starts a turn
  // right now (`stave_run_automation_now`) does not. A wake-up has no immediate
  // trigger at all, so all six of its tools are definition edits.
  "stave_list_wake_ups",
  "stave_get_wake_up",
  "stave_create_wake_up",
  "stave_update_wake_up",
  "stave_set_wake_up_paused",
  "stave_remove_wake_up",
  // Agent run tools exist only on a turn carrying that agent run's grant, and
  // those turns run unattended: asking would stop an agent run at every stage
  // report. They read or record Stave's own agent run state.
  "stave_get_agent_run",
  "stave_report_stage",
  "stave_block_stage",
  // The masked card it shows in the calling task is the consent: the user
  // saves, binds or declines there. An approval prompt first would ask twice.
  // Read-only tasks are denied it in `read-only-delegation.ts`.
  "stave_request_secret",
]);

/**
 * Reduces a provider-decorated tool name to its bare Stave tool name.
 *
 * Callers hand us wildly different shapes for the same tool: Claude reports
 * `mcp__stave-local-mcp__stave_list_delegated_tasks`, while Codex elicitation
 * metadata may report `stave-local__stave_list_delegated_tasks`, a dotted
 * `stave-local.stave_list_delegated_tasks`, or the bare name. Normalising here
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

/**
 * Stave tools that answer another task's prompt. An agent never grants
 * consent for another task, so no permission mode or autonomy answers these
 * on its own; they always reach the user. (`stave_respond_approval` is not
 * served to MCP clients at all; it stays listed in case an old client asks.)
 */
const STAVE_LOCAL_MCP_NEVER_AUTO_APPROVED_TOOL_NAMES = new Set([
  "stave_respond_approval",
  "stave_respond_user_input",
]);

export function isNeverAutoApprovedStaveLocalMcpTool(toolName: string) {
  return STAVE_LOCAL_MCP_NEVER_AUTO_APPROVED_TOOL_NAMES.has(
    normalizeStaveLocalMcpToolName(toolName),
  );
}

/**
 * Which Stave tools Claude's prompt-free modes run without asking. `auto`
 * runs every Stave tool except the respond tools: spawn tools are capped by
 * the host (a spawned turn never gets wider than the user's settings) and
 * schedules a model creates are saved disabled. `dontAsk` (the read-only
 * posture) runs the tools that read Stave state and the ones that record the
 * work in it (`READ_ONLY_STAVE_METADATA_TOOLS`); it denies the rest rather
 * than starting work.
 */
export function isPromptFreeStaveLocalMcpTool(
  toolName: string,
  permissionMode: "auto" | "dontAsk",
) {
  const leaf = normalizeStaveLocalMcpToolName(toolName);
  return permissionMode === "auto"
    ? !STAVE_LOCAL_MCP_NEVER_AUTO_APPROVED_TOOL_NAMES.has(leaf)
    : (READ_ONLY_DELEGATION_STAVE_TOOLS as readonly string[]).includes(leaf) ||
      (READ_ONLY_STAVE_METADATA_TOOLS as readonly string[]).includes(leaf);
}
