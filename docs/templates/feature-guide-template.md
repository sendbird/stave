# Feature Guide Template

Copy this template to `docs/features/<feature-name>.md` when shipping a user-facing feature or a material workflow change.

Keep the document user-facing, task-oriented, and reusable for a future docs website. Put architecture detail in `docs/architecture/` instead of here.

## Summary

- Describe the feature in one or two direct sentences.
- State the primary user outcome.

## When To Use It

- Explain who the feature is for.
- Call out the core situations where it helps.
- Mention when another feature or workflow is a better fit.

## Before You Start

- List prerequisites, permissions, environment assumptions, or setup requirements.
- Link to install/setup docs if the feature depends on another system.

## Quick Start

1. Show the shortest successful path.
2. Keep it to the minimum number of steps.
3. Use concrete UI labels, commands, and file names.

## Interface Walkthrough

### Entry Points

- Document where users open the feature from.
- Name the relevant tabs, menus, dialogs, or shortcuts.

### Key Controls

- Explain the main controls in the order users encounter them.
- Focus on meaning and outcome, not raw component names.

## Optional Screenshots

- Add one or two screenshots only when they materially help users find the entry point or confirm the expected UI state.
- Place screenshots near `Summary`, `Quick Start`, or `Interface Walkthrough`.
- Use a short caption and avoid personal paths, private prompt content, or transient task data.

## Common Workflows

### Create Or Configure Something

1. Describe the normal creation path.
2. Include defaults, validation rules, and expected result.

### Run Or Verify Something

1. Explain how to test, run, or preview the feature.
2. State what success looks like in the UI.

## Files And Data

- List the user-facing files, config entries, or persistent state involved.
- Add a minimal example only when it materially helps understanding.

```json
{
  "replace": "with a small, real example"
}
```

## Limitations And Advanced Options

- Document what the GUI supports directly.
- Call out anything that still requires manual editing, CLI use, or an advanced workflow.

## Troubleshooting

### Problem Title

- Symptom: what the user sees.
- Cause: the most likely reason.
- Fix: the concrete next action.

## Related Docs

- Link to nearby feature guides, setup guides, or architecture docs.

## Author Checklist

- Use this template structure unless there is a strong reason not to.
- Add or update the public docs entry in `site/src/public-docs.ts`.
- If the feature changes an existing workflow, update that guide instead of creating overlapping docs.
- Keep copy stable enough to reuse in a docs website later.
- If screenshots are included, keep them few, durable, and clearly captioned.
