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
   first task model, effort, Codex Fast mode (for GPT models), and prompt.
6. Create the workspace.

The `Start now` switch controls whether Stave sends the first prompt
immediately. When it is off, the prompt remains ready in the new task composer.
The selected model, effort, and Codex Fast mode stay attached to that task in
either case. The Fast dropdown appears only when the first task uses Codex.

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
- first task provider model, reasoning effort, Codex Fast mode, title, and prompt
- optional additional instructions for the first task

## Task details and source coverage

`Review task details` lets you edit decisions, constraints and excluded scope,
completion criteria, and open questions. Empty sections are optional. These
fields and additional instructions are included in the first task itself,
independently of the Information panel context budget. `Preview full first-task
prompt` shows the same text that is saved or sent.

The proposal distinguishes pasted text, an unverified reference, and a Jira
read through the connected site. Jira reads include the connector's bounded
title and description, not comments or linked pages. Links to a different Jira
site are not resolved against the signed-in site. Other sources retain their
configured MCP path, but tool-produced claims alone do not verify source coverage.

Interpretation uses at most 12,000 characters of pasted source and 12,000 of
retrieved Jira text. The complete supplied input and connector-returned text
remain in the first-task prompt, and shortened interpretation is indicated.
AI resolution accepts up to 80,000 input characters. Skip AI preserves the
supplied text without model interpretation. Existing custom prompt templates
remain supported; the previous default gains the new task-detail fields.

## Bounded resolution and recovery

Resolution allows a maximum of two model attempts, up to 30 seconds each within
a 60-second overall window including source acquisition. Source acquisition
has a 10-second UI deadline; an already-issued Jira read can finish in the
background under the connector's own HTTP timeout. Late results are ignored.
Cancellation releases the dialog and requests cancellation of provider work.

Without configured source MCP servers, interpretation uses the existing durable
secondary-run executor with a 32 KiB output limit and 512-event limit. With
configured MCP servers, the existing provider path is retained with a provider
timeout and response validation; its IPC response is still collected before
validation. The shared secondary policy is not relaxed to allow MCP access.
Skip AI, unavailable interpretation, timeout, and unusable model output have
separate preview explanations. Source-read, per-attempt, and total durations
are retained on the proposal for diagnostics; no source body is logged.

The initial prompt, provider, and runtime overrides are saved with the workspace
before its first send. Startup addresses the created task by its returned ID.
If a send is blocked, the prompt stays ready. If submission cannot be confirmed,
open the created task and check its messages before sending again. Kickoff does
not automatically repeat a send or create another workspace after that failure.
Workspace initialization warnings remain visible alongside startup warnings.

For local visual checks, `?stavePreview=kickoff` renders the real dialog with
fixture project state and disables workspace creation. It does not verify live
provider execution or connector authentication.

## Related Docs

- [Project Instructions](project-instructions.md)
- [Local MCP user guide](local-mcp-user-guide.md)
- [Workspace Latest Turn Summary](workspace-latest-turn-summary.md)
