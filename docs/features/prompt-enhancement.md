# Prompt Enhancement

## Summary

Prompt enhancement rewrites a rough task draft into a clearer, execution-ready prompt before you send it. The improved text replaces the draft for review; it does not start a provider turn by itself.

## When To Use It

- Use it when the task intent is clear but the draft is terse, disorganized, or missing useful structure.
- Use it before sending a one-off task that does not belong in durable project instructions.
- Edit the result manually when the task needs details that were not present in the original draft.

## Before You Start

- Open a task with an available Claude or Codex provider.
- Enter at least one non-whitespace character in the prompt composer.

## Quick Start

1. Write a rough prompt in the task composer.
2. Select **Enhance** in the upper-right corner of the draft.
3. Review the rewritten prompt and adjust any details.
4. Send the prompt when it matches the outcome you want.

## Interface Walkthrough

### Entry Points

The **Enhance** action appears in the upper-right corner of a non-empty task draft. It replaces the composer Focus hint; the existing global composer-focus shortcuts remain available.

### Key Controls

- **Enhance**: starts an isolated utility request that rewrites the current draft.
- **Enhancing…**: indicates that a rewrite is running and prevents duplicate requests.
- **Undo**: restores the original draft after a successful rewrite, provided the enhanced text has not been edited again.

## Common Workflows

### Refine A Rough Task

1. Include the outcome, important constraints, and any exact references you already know.
2. Select **Enhance**.
3. Confirm that slash commands, `$skill` and `@info` tokens, file paths, URLs, code, and quoted text remain intact.
4. Add any missing requirements yourself before sending.

### Keep Editing While Enhancement Runs

1. Start enhancement.
2. Continue editing the draft if needed.
3. Stave keeps the newer draft instead of replacing it with a late enhancement result.

## Files And Data

- The current task draft remains in the normal workspace draft store.
- Enhancement runs as a separate read-only utility request and does not add a message to the task conversation.
- No project files are changed by the enhancement action.

## Limitations And Advanced Options

- Enhancement improves only what the draft supports. It does not invent requirements, files, constraints, or acceptance criteria.
- The action depends on an available utility runner. Stave prefers Claude Haiku or Codex Luna when they are installed, and uses Cursor Ask or Kiro as last-resort compatibility runners when Claude and Codex are unavailable.
- A rewrite can still be incomplete or inaccurate, so review it before sending.

## Troubleshooting

### Enhance Is Missing

- Symptom: no **Enhance** action appears in the composer.
- Cause: the draft is empty or composer interactions are currently unavailable.
- Fix: enter prompt text and wait for any blocking task state to finish.

### The Draft Was Not Replaced

- Symptom: enhancement finishes but the original or newer draft remains.
- Cause: the task or draft changed while the request was running.
- Fix: review the current draft and select **Enhance** again if a rewrite is still useful.

### Enhancement Fails

- Symptom: Stave reports that prompt enhancement is unavailable or failed.
- Cause: the selected utility provider is unavailable or its request failed.
- Fix: verify provider availability in Settings, then retry.

## Related Docs

- [Project Instructions](project-instructions.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
- [Attachments](attachments.md)
