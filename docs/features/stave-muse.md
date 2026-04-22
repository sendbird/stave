# Stave Muse

## Summary

- Stave Muse is a global chat widget for controlling Stave outside any individual task conversation.
- It can answer product questions, switch projects or workspaces, open panels, update the Information panel, and hand implementation-heavy requests off to task chat.

## When To Use It

- Use it when you want to control Stave itself rather than continue a single task thread.
- Use it for navigation, settings, workspace summaries, and lightweight Information panel updates.
- Use it for connected-tool workflows that stay in exposed interfaces, such as reading Slack, creating Jira issues, updating Confluence or Figma links, and syncing those results back into the Information panel.
- Use normal task chat when you want code changes, longer terminal work, or an implementation run that should live with task history.

## Before You Start

- Open a project if you want project-aware answers or workspace actions.
- Select a workspace if you want to update the Information panel directly.
- Review `Settings → Muse` if you want to change the Muse target scope, model routing, prompts, or handoff behavior.
- Custom prompt fields in `Settings → Muse` add to Muse's built-in guardrails rather than replacing them.

## Quick Start

1. Open `Muse` from the top bar, command palette, or the floating launcher above the Home item in the lower-left corner.
2. Pick the target scope: `App`, `Project`, or `Workspace`.
3. Ask a question or give a control command such as `open information`, `switch workspace release`, or `summarize stave`.

## Interface Walkthrough

### Entry Points

- Top bar: `Muse`
- Command palette: `Open Stave Muse`
- Floating launcher: `Stave Muse`
- Settings: `Muse`

### Key Controls

- Target selector: chooses whether Muse should reason about the whole app, the current project, or the current workspace by default.
- Composer: sends global questions or commands.
- Settings button: opens `Settings → Muse`.
- Prompt settings: let you customise Muse router, chat, and planner instructions.
- Clear button: clears the Muse conversation without affecting task chat history.
- Send / stop button: sends the prompt, then turns into the abort control while Muse is responding.
- Minimize button: collapses the widget without clearing the conversation.

## Common Workflows

### Control Stave

1. Ask for navigation or UI actions such as `open changes`, `show scripts`, `collapse sidebar`, or `open settings`.
2. Muse applies the action immediately when it can be resolved locally.
3. The widget replies with a short confirmation in the conversation.

### Update Workspace Information

1. Switch the target to `Current Workspace` or select a workspace first.
2. Ask for a direct edit such as `add todo release checklist`, `note update API freeze on Friday`, or paste a Jira / PR / Figma / Slack / Confluence link.
3. The `Information` panel state updates immediately when direct edits are enabled in settings.

### Run Connected Tool Workflows

1. Ask Muse to use linked tools such as Slack, Jira, Confluence, Figma, or GitHub.
2. Muse can read those sources, create or update external records, and then write the resulting links or metadata back into the exposed Stave Information panel fields.
3. This stays inside Muse as long as the work does not require changing the Stave repository itself.

### Handoff Complex Work To Task Chat

1. Ask for heavier work such as debugging, code changes, git workflows, or longer implementation.
2. If `Auto Handoff To Task` is enabled, Muse creates a task and forwards the request there. Explicit requests to open a task also hand off directly.
3. Continue the implementation inside the created task chat.

## Files And Data

- Muse UI state is stored in the app store and persisted with the rest of lightweight local UI state.
- Muse settings live under the main Settings dialog.
- Task handoff still uses normal task history and workspace snapshots.

## Limitations And Advanced Options

- Muse is optimized for Stave control, not for replacing task chat.
- Some app actions are deterministic and run locally; others still require provider reasoning.
- Complex repository work is intentionally redirected to task chat so execution history stays attached to a task.
- Muse does not satisfy requests by inspecting the Stave codebase, reading persistence files, or editing the local database directly.
- Muse provider turns run from a neutral temp working directory instead of the active repo or workspace.

## Troubleshooting

### Information Edits Do Not Apply

- Symptom: Muse answers, but notes or todos do not change.
- Cause: no workspace is selected, or direct Information edits are disabled.
- Fix: select a workspace and check `Settings → Muse → Direct Information Edits`.

### A Request Creates A Task Instead Of Staying In The Widget

- Symptom: Muse opens a new task and forwards the request.
- Cause: the router classified the request as implementation-heavy and `Auto Handoff To Task` is enabled.
- Fix: disable `Auto Handoff To Task` in `Settings → Muse` if you want those requests to stay in the widget.

### A Connected Tool Request Fails Before Muse Starts Responding

- Symptom: Muse immediately returns a system-style error for Slack, Jira, Confluence, or Figma instead of starting an AI turn.
- Cause: the selected provider is unavailable, the connected tool is disabled, or authentication is missing for the current Claude/Codex integration.
- Fix: re-authenticate or re-enable the integration, or switch Muse to `Claude Code` or `Codex` if `Stave Auto` was selected for a connected-tool workflow.

## Related Docs

- [Command Palette](command-palette.md)
- [Workspace Scripts](workspace-scripts.md)
