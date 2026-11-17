/**
 * Server-level `instructions` for the Stave local MCP server.
 *
 * Hosts surface this string once per session next to the server name, and it
 * stays visible even when the host defers the tool schemas themselves (tool
 * search / lazy loading). It therefore has to do two jobs in very little
 * space: name the tool families so the model can find the right one without
 * probing, repeat the two rules that most often waste a round trip, and say
 * when to show an inline HTML page: with deferred schemas, this line is the
 * only place a model learns that it may reach for one unasked.
 *
 * Keep it short. Every line is resident in every turn of every provider
 * session that connects to the server.
 */
export function buildStaveLocalMcpServerInstructions(options?: {
  browserToolsEnabled?: boolean;
}) {
  const lines = [
    "Tools for the Stave desktop app that is running this session.",
    "Families: stave_*_workspace_* manage the workspace Information panel (notes, todos, custom fields, linked Jira/PR/Figma/Slack/Storybook resources; idempotent by key/URL); stave_remember/stave_forget/stave_list_repository_memories manage repository memory; stave_create_workspace/stave_run_task create and drive tasks; stave_delegate_task and stave_*_delegated_task* start and drive subagents (answers return inline or next turn); stave_*_automation* (start a task on a schedule) and stave_*_wake_up* (check back on a task) manage the user's Schedules (new ones start paused); stave_respond_user_input answers a pending question. Approvals are answered only by the user in Stave.",
    "stave_render_html shows an HTML page inline in this chat. Use it without being asked when a reply compares 3+ options across several attributes, shows numbers across groups or over time, or explains a flow, architecture, or UI layout; keep short answers, code, and plain lists as text. Check the page with stave_preview_html first.",
    "Context already injected into the prompt as [Retrieved Context] or [Stave Workspace Context] is current; do not call stave_get_workspace_information just to re-read it.",
  ];
  if (options?.browserToolsEnabled !== false) {
    lines.push(
      "stave_lens_* drive the workspace's embedded browser; prefer stave_lens_snapshot, scoped stave_lens_get_text, or a screenshot before raw HTML, console, or network dumps, and address elements by snapshot ref.",
    );
  }
  return lines.join("\n");
}
