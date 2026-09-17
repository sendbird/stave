/**
 * Server-level `instructions` for the Stave local MCP server.
 *
 * Hosts surface this string once per session next to the server name, and it
 * stays visible even when the host defers the tool schemas themselves (tool
 * search / lazy loading). It therefore has to do two jobs in very little
 * space: name the tool families so the model can find the right one without
 * probing, and repeat the two rules that most often waste a round trip.
 *
 * Keep it short. Every line is resident in every turn of every provider
 * session that connects to the server.
 */
export function buildStaveLocalMcpServerInstructions(options?: {
  browserToolsEnabled?: boolean;
}) {
  const lines = [
    "Tools for the Stave desktop app that is running this session.",
    "Families: stave_*_workspace_* manage the workspace Information panel (notes, todos, custom fields, linked Jira/PR/Figma/Slack/Storybook resources; registration is idempotent by key/URL); stave_remember/stave_forget/stave_list_project_memories manage project memory; stave_create_workspace, stave_run_task, stave_delegate_task and stave_*_child_task* create and drive tasks; stave_*_routine* and stave_*_task_heartbeat* manage scheduled work; stave_respond_approval/stave_respond_user_input answer pending prompts.",
    "Context already injected into the prompt as [Retrieved Context] or [Stave Workspace Context] is current; do not call stave_get_workspace_information just to re-read it.",
  ];
  if (options?.browserToolsEnabled !== false) {
    lines.push(
      "stave_lens_* drive the workspace's embedded browser; prefer stave_lens_snapshot, scoped stave_lens_get_text, or a screenshot before raw HTML, console, or network dumps, and address elements by snapshot ref.",
    );
  }
  return lines.join("\n");
}
