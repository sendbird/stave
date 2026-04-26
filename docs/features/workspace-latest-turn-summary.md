# Workspace Latest Turn Summary

## Summary

- Stave can automatically write a short latest-turn summary to the top of each workspace Information panel.
- The summary captures both what the user asked for and what the AI actually did, so it is easier to recover context when switching between tasks or workspaces.

![Information panel with latest-turn summary, notes, todos, and linked resources](../screenshots/information-panel.png)

This rendered example shows the Information panel with the latest-turn summary pinned above notes, todos, linked resources, and other workspace memory.

## When To Use It

- Use it when you bounce between multiple tasks and want a quick reminder of the last completed turn in a workspace.
- Use it when the Information panel is your shared workspace memory surface for notes, links, plans, and status.
- Use normal task chat when you need the full execution history, exact diffs, or every intermediate assistant/tool step.

## Before You Start

- Open a project workspace in Stave.
- Complete at least one task turn in that workspace.
- Review `Settings → Prompts` if you want to change the summary prompt or the preferred models.

## Quick Start

1. Open a workspace and run a task turn to completion.
2. Open the right-side `Information` panel.
3. Read the `Summary` section at the top for the short `user` and `ai` recap.

## Interface Walkthrough

### Entry Points

- Right rail: `Information`
- Settings: `Prompts`

### Key Controls

- `Summary` section: shows the newest automatic workspace summary and starts expanded until you collapse it.
- `user`: short restatement of the completed turn's request.
- `ai`: short summary of what the assistant changed, concluded, or reported.
- Model badge: shows which model produced the summary.
- `Settings → Prompts → Workspace Latest Turn Summary`: lets you change the primary model, fallback model, and prompt template.

## Common Workflows

### Configure Automatic Summaries

1. Open `Settings → Prompts`.
2. Find `Workspace Latest Turn Summary`.
3. Set the primary model, fallback model, and prompt template.
4. Leave the prompt empty if you want to disable automatic summaries.

### Verify A New Summary

1. Send a task message and wait for the turn to finish.
2. Open the workspace `Information` panel.
3. Confirm the top summary section updates with the latest request/work recap and a fresh timestamp.

## Files And Data

- The latest-turn summary is stored in the workspace snapshot alongside the rest of the Information panel state.
- The prompt and model preferences are stored in the app settings.

```json
{
  "workspaceTurnSummaryPrimaryModel": "gpt-5.4-mini",
  "workspaceTurnSummaryFallbackModel": "claude-haiku-4-5"
}
```

## Limitations And Advanced Options

- The summary section shows the latest completed turn summary for the workspace, not a full history of older summaries.
- Summary generation runs after the main task turn finishes, so the section can update a moment after the task chat stops streaming.
- If the primary model is unavailable or fails, Stave tries the configured fallback model.

## Troubleshooting

### The Summary Section Does Not Update

- Symptom: the `Summary` section stays empty after a completed task turn.
- Cause: the summary prompt is blank, both configured models are unavailable, or the workspace has not completed a turn yet.
- Fix: check `Settings → Prompts → Workspace Latest Turn Summary`, restore the default prompt if needed, and verify that at least one configured provider is available.

## Related Docs

- [Local MCP user guide](local-mcp-user-guide.md)
- [Project Instructions](project-instructions.md)
- [Notifications](notifications.md)
