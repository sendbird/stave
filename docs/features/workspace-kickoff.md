# Workspace Kickoff

## Summary

Workspace Kickoff creates a Stave workspace from an external work source or a
free-form prompt. Stave resolves the source with the configured provider and MCP
servers, proposes the branch and workspace details, fills the Information panel,
and lets you edit everything before creating the worktree.

If model resolution is unavailable, deterministic URL and text parsing still
produces a usable preview.

## Quick Start

1. Open a project in Stave.
2. Select the sparkle action next to the project's new-workspace action, or run
   `Kick off Workspace` from the command palette.
3. Paste a source URL, issue key, report, or task description.
4. Select `Resolve source`, or `Skip AI` for deterministic parsing.
5. Review the branch, label, base branch, linked Information panel items, and
   first task model, effort, and prompt.
6. Create the workspace.

The `Start now` switch controls whether Stave sends the first prompt
immediately. When it is off, the prompt remains ready in the new task composer.
The selected model and effort stay attached to that task in either case.

## Source Configuration

Open `Settings → Kickoff` to configure source matching and resolution.

Each source defines:

- URL host suffixes and an optional path regular expression
- an optional key regular expression for non-URL input
- the Information panel section that receives the linked item
- MCP server names used during resolution
- a source-specific resolution hint

Built-in definitions cover Jira, Confluence, Slack, Figma, and GitHub. These are
ordinary settings and can be disabled, edited, removed, or restored. Internal
services can be added without changing Stave code.

MCP server names must match servers discovered from the current Claude project
configuration or Codex user configuration. Missing servers are shown in the UI
but do not block preview or workspace creation.

## Project Branch Rules

Set a repository-specific naming rule under
`Settings → Projects → Kickoff Branch Naming Rule`. The resolver receives this
rule together with the project's normal instructions. The preview always shows
the sanitized git branch before creation.

## Information Panel Sections

The Information panel header includes a section menu. Summary, todos, notes,
plans, GitHub, and custom fields are shown by default. Jira, Confluence,
Storybook, Amplify, Slack, and Figma appear automatically when they contain data
or can be explicitly enabled.

An explicitly hidden section keeps its data and remains available to agent
context. Resetting the menu restores content-aware defaults.

## Resolution Behavior

Stave tries the configured primary model, then the fallback model. Claude
resolution can use the MCP servers declared by the matched source. Codex runs
the kickoff turn with read-only filesystem access and no approval prompts.
While resolution or workspace creation is running, the kickoff dialog cannot be
dismissed with Escape or an outside click. Resolution can still be stopped with
the explicit cancel action.

The editable proposal contains:

- branch name and workspace label
- source summary
- Information panel links, notes, and todos
- first task provider model, reasoning effort, title, and prompt
- optional additional instructions for the first task

## Related Docs

- [Project Instructions](project-instructions.md)
- [Local MCP user guide](local-mcp-user-guide.md)
- [Workspace Latest Turn Summary](workspace-latest-turn-summary.md)
