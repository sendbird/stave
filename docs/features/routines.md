# Routines

## Summary

- Routines schedule repeatable Claude or Codex work from Stave.
- Each run creates a normal task conversation, so you can inspect the result, answer an approval request, or continue the work manually.

## When To Use It

- Use a routine for recurring repository reviews, status summaries, maintenance checks, or other prompts that should run at a regular interval.
- Use Workspace Scripts instead when the work is a deterministic shell command or long-running local service rather than an AI task.

## Before You Start

- Open the Stave desktop app and configure the provider you want to use.
- Open or register the repository where the routine should run.
- Add reusable notes, todos, or linked resources to the repository's Default
  Workspace Information panel if the routine needs them.

## Quick Start

1. Open the `Library` from the workflow icon in the global navigation
   bar at the top right, or press `Cmd/Ctrl+K` then `A`.
2. Select `New automation`.
3. Enter the automation name and complete task instructions.
4. Pick a cadence preset such as `Daily`, `Weekdays`, or `Weekends`.
5. Pick a permission mode: `Auto`, `Guided`, or `Manual`.
6. Choose the repository, model, and effort.
7. Use `Add Information resource`, choose a resource type, and enter the new
   resource that each run should receive.
8. Select `Save`, then use `Run now` to test the automation.
9. Switch to the `Run history` tab and select a run to inspect its full result.

## Interface Walkthrough

### Entry Points

- The Library is a full-window surface, like Fleet View. It replaces
  the main content column while the sidebar, top bar, and right rail stay in
  place. `Escape` or the header `X` closes it.
- Open it from the workflow icon in the global navigation bar, from the command
  palette (`Open Library`), or with `Cmd/Ctrl+K` then `A`.
- It remains available without selecting a task or workspace because automations
  can target any registered repository.

### Layout

The surface has two tabs, and each one is a list-plus-detail split so the
automation list and the run history are never stacked in one scroll view.

- `Automations`: the saved automation list on the left, and the selected
  automation's configuration on the right. The detail pane shows the latest run
  status only; the full history lives in the other tab.
- `Run history`: every recorded run on the left, filtered by status and by
  automation, and the selected run's full detail on the right.

### Key Controls

- `New automation`: creates an automation.
- `Run now`: starts an independent run immediately.
- `Edit`: changes any saved specification.
- `View run history`: switches to the `Run history` tab pre-filtered to the
  selected automation.
- `Pause schedule` / `Enable schedule`: stops or restores scheduled runs without
  deleting the automation. A paused automation still runs from `Run now`, and is
  shown as `Manual only`.
- `Delete`: removes an idle automation and its run-history entries. Task
  conversations created by earlier runs remain in their workspaces.
- `Open task`: opens the task conversation created for that run.
- `Run again`: re-runs the automation that produced the selected run.

### Run Detail

Selecting a run shows its trigger, permission mode, duration, scheduled and
actual timestamps, repository, model, immutable execution ID, config hash, the
full recorded result or error, and the instructions the run was given.

## Common Workflows

### Create Or Edit A Routine

1. Enter a name and the full prompt that should be sent on each run.
2. Pick a cadence. See [Cadence](#cadence) below.
3. Pick a permission mode. See [Permission Modes](#permission-modes) below.
4. Choose a registered repository. Automations always execute from that
   repository's root in its Default Workspace.
5. Select Claude or Codex, then choose the model and effort.
6. Select `Add Information resource`, choose Notes, Todo, Pull request, Jira,
   Confluence, Storybook, Amplify, Slack, Figma, or Custom field, then complete
   that resource type's input form. Stave creates the entry in the repository's
   Default Workspace and attaches it to the routine immediately. The editor
   shows each attached resource with its context summary and removal control.
7. Save the automation. Use `Edit` later to change the same specification.

### Cadence

Pick one preset instead of assembling an interval by hand. The editor shows the
resolved schedule and the next run time under the presets.

- `Manual only`: no schedule. The automation runs only from `Run now`.
- `Every 15 minutes` and `Hourly`: plain intervals with no time anchor.
- `Daily`: once a day at a chosen local time.
- `Weekdays`: Monday through Friday at a chosen local time.
- `Weekends`: Saturday and Sunday at a chosen local time.
- `Weekly`: one or more chosen days each week at a chosen local time.
- `Custom`: set the raw interval, unit, days, and time yourself.

Anchored schedules use local wall-clock time and keep that time across daylight
saving changes.

### Permission Modes

Automations expose a single permission control instead of the full per-provider
permission matrix. The mode decides how much the run may do while nobody is
watching.

- `Auto`: no approval prompts. The run goes end to end. Use it for reports,
  triage, and chores you already trust unattended.
- `Guided`: sensitive provider actions take the strict approval path, so a run
  can pause and wait for you in its task. This is the default.
- `Manual`: the guarded presets are skipped and the run uses the provider
  permissions you set by hand. Choosing `Manual` reveals the provider-specific
  controls for permission mode, sandbox, file access, network access, and web
  search.

The effective provider settings are always printed under the mode picker, and
`Auto` and `Guided` write those settings into the saved specification, so the
editor never shows a value the scheduler would silently discard.

Information references are resolved from the latest persisted Default
Workspace Information panel values when a run starts. Renaming or updating an
attached note or resource therefore changes the context used by future runs
without requiring a new routine.

### Run And Inspect A Routine

1. Use `Run now`, or leave scheduled runs enabled and wait for the next occurrence.
2. Watch the latest run status in the automation list and on the automation detail pane.
3. Open the `Run history` tab and select a run to read its full detail.
4. If a run is `Waiting`, select `Open task` and respond to the approval or user-input request.
5. When the run completes, review its recorded result or open the full task conversation.

## Files And Data

- Routine definitions and the latest 50 run records per routine are stored in Stave's local SQLite application data.
- Each occurrence is also stored as a normal, user-owned task in the selected
  repository's Default Workspace.
- Deleting a routine does not delete those task conversations.

## Limitations And Advanced Options

- Scheduled runs execute only while the Stave desktop app is open. Stave does not currently install an operating-system background job or launch itself for a due routine.
- If Stave was closed when an interval became due, the routine runs once after Stave opens and schedules the next interval from that time. It does not replay every missed occurrence.
- A routine does not start a second overlapping run. If the previous run is still active when the next interval is due, that occurrence is recorded as skipped.
- Live Lens browser state is not attachable because it is not a durable Information resource.

## Troubleshooting

### A Run Is Waiting

- Symptom: the run status stays at `Waiting`.
- Cause: the automation uses the `Guided` permission mode and a sensitive action needs an approval, or the model requested user input.
- Fix: select `Open task`, respond in the task conversation, and let the run continue. Switch the automation to `Auto` if it should never stop to ask.

### A Resource Cannot Be Attached

- Symptom: `Create & attach` stays disabled.
- Cause: a required field such as Notes text, Todo text, Custom field label, or
  resource URL is empty or invalid.
- Fix: complete the resource-specific form with a valid value. External
  resources require an `http` or `https` URL.

### A Scheduled Run Did Not Start

- Symptom: the next run time passed while no task appeared.
- Cause: the desktop app was closed, or the previous run was still active.
- Fix: open Stave and inspect the run history. Stave runs one missed occurrence after startup or records an overlapping occurrence as skipped.

## Related Docs

- [Provider Sandbox and Approval](provider-sandbox-and-approval.md)
- [Workspace Scripts](workspace-scripts.md)
- [Latest Turn Summary](workspace-latest-turn-summary.md)
