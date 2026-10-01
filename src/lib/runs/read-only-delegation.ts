import { CLAUDE_EDIT_TOOLS } from "@/lib/agents/permission";

/**
 * The posture of a read-only delegated task: a second opinion, a review or a
 * piece of research that must never change the workspace and must never stop
 * to ask for approval. Both properties are what let it run beside another
 * child in the same workspace.
 *
 * Claude enforces it three ways at once, so no single allow rule can undo it:
 * `dontAsk` denies every tool that is not on the allowlist below instead of
 * prompting, the disallowed list removes edit tools and mutating Stave tools
 * outright (a deny beats any allow rule a settings file adds), and the sandbox
 * denies filesystem writes from every Bash command it runs.
 */

const STAVE_LOCAL_MCP_TOOL_PREFIX = "mcp__stave-local-mcp__";

/** Stave Local MCP tools that only read Stave state. */
export const READ_ONLY_DELEGATION_STAVE_TOOLS = [
  "stave_get_workspace_information",
  "stave_get_task",
  "stave_list_delegated_tasks",
  "stave_list_repositories",
  "stave_list_repository_memories",
  "stave_list_tracker_issues",
  "stave_list_automations",
  "stave_list_automation_information_references",
  "stave_list_wake_ups",
  "stave_get_wake_up",
  "stave_martin_get_context",
  "stave_martin_list_projects",
  "stave_get_mission",
  "stave_list_missions",
  "stave_get_mission_report",
  "stave_get_project",
] as const;

/**
 * Every other Stave Local MCP tool: anything that edits workspace metadata,
 * memory, schedules or projects, starts or answers a task, spends tokens, or
 * drives the embedded browser. Listed by name so the deny holds even where a
 * permission path would otherwise allow every Stave tool.
 */
export const DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS = [
  "stave_add_workspace_amplify_link",
  "stave_add_workspace_confluence_page",
  "stave_add_workspace_crane_issue",
  "stave_add_workspace_custom_field",
  "stave_add_workspace_figma_resource",
  "stave_add_workspace_jira_issue",
  "stave_add_workspace_resource",
  "stave_add_workspace_slack_thread",
  "stave_add_workspace_storybook_resource",
  "stave_add_workspace_todo",
  "stave_append_workspace_notes",
  "stave_clear_workspace_notes",
  "stave_replace_workspace_notes",
  "stave_remove_workspace_custom_field",
  "stave_remove_workspace_resource",
  "stave_remove_workspace_todo",
  "stave_set_workspace_custom_field",
  "stave_update_workspace_storybook_resource_access",
  "stave_update_workspace_todo",
  "stave_remember",
  "stave_forget",
  "stave_create_automation",
  "stave_create_automation_information_resource",
  "stave_update_automation",
  "stave_remove_automation",
  "stave_set_automation_enabled",
  "stave_run_automation_now",
  "stave_create_wake_up",
  "stave_update_wake_up",
  "stave_set_wake_up_paused",
  "stave_remove_wake_up",
  "stave_create_workspace",
  "stave_register_repository",
  "stave_run_task",
  "stave_delegate_task",
  "stave_follow_up_delegated_task",
  "stave_stop_delegated_task",
  "stave_respond_user_input",
  "stave_martin_link_project",
  "stave_martin_unlink_project",
  "stave_report_stage",
  "stave_block_stage",
  "stave_propose_mission",
  "stave_start_mission",
  "stave_note_project",
  "stave_lens_open_session",
  "stave_lens_close_session",
  "stave_lens_present_session",
  "stave_lens_navigate",
  "stave_lens_reload",
  "stave_lens_click",
  "stave_lens_type",
  "stave_lens_evaluate",
  "stave_lens_download",
  "stave_lens_list_downloads",
  "stave_lens_set_appearance",
  "stave_lens_set_style",
  "stave_lens_snapshot",
  "stave_lens_screenshot",
  "stave_lens_get_text",
  "stave_lens_get_html",
  "stave_lens_get_console",
  "stave_lens_get_network",
  "stave_lens_get_annotations",
  "stave_lens_inspect",
  "stave_lens_measure",
  "stave_lens_list_sessions",
  "stave_lens_list_saved_accounts",
  "stave_lens_create_saved_account",
  "stave_lens_update_saved_account",
  "stave_lens_delete_saved_account",
  "stave_lens_fill_saved_account",
] as const;

/** Git subcommands that only read the repository. */
const READ_ONLY_GIT_SUBCOMMANDS = [
  "status",
  "diff",
  "log",
  "show",
  "blame",
  "rev-parse",
  "ls-files",
  "grep",
] as const;

/** What a read-only Claude delegated task may run without asking. */
export const CLAUDE_READ_ONLY_DELEGATION_ALLOWED_TOOLS: readonly string[] = [
  "Read",
  "Grep",
  "Glob",
  "LS",
  "NotebookRead",
  "WebFetch",
  "WebSearch",
  ...READ_ONLY_GIT_SUBCOMMANDS.map((command) => `Bash(git ${command}:*)`),
  ...READ_ONLY_DELEGATION_STAVE_TOOLS.map(
    (tool) => `${STAVE_LOCAL_MCP_TOOL_PREFIX}${tool}`,
  ),
];

/**
 * What a read-only Claude delegated task may never run. `AskUserQuestion` is
 * here because the task must never wait on a person.
 */
export const CLAUDE_READ_ONLY_DELEGATION_DISALLOWED_TOOLS: readonly string[] = [
  ...CLAUDE_EDIT_TOOLS,
  "AskUserQuestion",
  ...DENIED_READ_ONLY_DELEGATION_STAVE_TOOLS.map(
    (tool) => `${STAVE_LOCAL_MCP_TOOL_PREFIX}${tool}`,
  ),
];

function ruleToolName(rule: string) {
  const open = rule.indexOf("(");
  return open === -1 ? rule : rule.slice(0, open);
}

/**
 * The Claude options of a read-only delegated task under `inherited`, the
 * policy it would otherwise have inherited. Only the inherited restrictions
 * carry over — denied tools, credential deny lists — because everything else
 * the inherited policy could do is already more than this posture allows.
 */
export function claudeReadOnlyDelegationOptions(inherited: {
  claudeDisallowedTools?: string[];
  claudeSandboxCredentialFiles?: string[];
  claudeSandboxCredentialEnvVars?: string[];
}) {
  const disallowed = [
    ...new Set([
      ...(inherited.claudeDisallowedTools ?? []),
      ...CLAUDE_READ_ONLY_DELEGATION_DISALLOWED_TOOLS,
    ]),
  ];
  const denied = new Set(disallowed);
  return {
    claudePermissionMode: "dontAsk" as const,
    claudePlanModeApprovalScope: "strict" as const,
    claudeAllowDangerouslySkipPermissions: false,
    claudeSandboxEnabled: true,
    claudeSandboxReadOnly: true,
    claudeAllowUnsandboxedCommands: false,
    claudeAllowedTools: CLAUDE_READ_ONLY_DELEGATION_ALLOWED_TOOLS.filter(
      (rule) => !denied.has(rule) && !denied.has(ruleToolName(rule)),
    ),
    claudeDisallowedTools: disallowed,
    ...(inherited.claudeSandboxCredentialFiles?.length
      ? { claudeSandboxCredentialFiles: inherited.claudeSandboxCredentialFiles }
      : {}),
    ...(inherited.claudeSandboxCredentialEnvVars?.length
      ? {
          claudeSandboxCredentialEnvVars:
            inherited.claudeSandboxCredentialEnvVars,
        }
      : {}),
  };
}

/** Codex holds read-only natively: a read-only sandbox that never asks. */
export function codexReadOnlyDelegationOptions() {
  return {
    codexFileAccess: "read-only" as const,
    codexApprovalPolicy: "never" as const,
    codexNetworkAccess: false,
    codexAutoApproveStaveLocalMcpTools: false,
  };
}
