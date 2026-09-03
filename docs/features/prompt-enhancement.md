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
- **Enhancing**: indicates that the rewrite request is running. The composer is locked and dimmed for the whole request, so the draft cannot be edited into an inconsistent state.
- **Applying**: indicates that the rewritten prompt is being revealed. Words the rewrite left unchanged stay in place, and new or rewritten words fade in with a short accent highlight so the edit is visible as an edit. The reveal takes about a second and is skipped entirely when the system prefers reduced motion.
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

- Enhancement expands terse drafts into complete agent instructions using what the draft says plus reference material that exists for the task: the last few conversation turns, the Information panel (notes, open todos, linked issues), and the repo's `AGENTS.md` or `CLAUDE.md`. Each source is attached only when present and is clipped, so an empty workspace sends only the draft. It still does not invent requirements, files, constraints, or acceptance criteria.
- **Settings → Background AI → Prompt enhancement** holds your **Prompt style** (language, tone, what to always include) and the **Learn from kept and undone rewrites** switch. When learning is on, the last few rewrites you kept are shown to the model as examples to match and the ones you undid as examples to avoid. Both are stored locally with your settings; **Forget remembered rewrites** clears the memory.
- The action depends on an available utility runner. Auto uses Codex Luna, then Claude Haiku, then Cursor or Kiro. A later runner is used only when that provider is signed in.
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
