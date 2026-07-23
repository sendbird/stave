# Routines

## Summary

- Routines schedule repeatable Claude or Codex work from Stave.
- Each run creates a normal task conversation, so you can inspect the result, answer an approval request, or continue the work manually.

## When To Use It

- Use a routine for recurring repository reviews, status summaries, maintenance checks, or other prompts that should run at a regular interval.
- Use Workspace Scripts instead when the work is a deterministic shell command or long-running local service rather than an AI task.

## Before You Start

- Open the Stave desktop app and configure the provider you want to use.
- Open or register the repository, workspace, or folder where the routine should run.
- Add reusable notes, todos, or linked resources to the workspace Information panel if the routine needs them.

## Quick Start

1. Open `Routines` from the global navigation bar at the top right.
2. Select `New`.
3. Enter the routine name and complete task instructions.
4. Choose the interval, environment, model, effort, and permission settings.
5. Attach any relevant Information resources.
6. Select `Save`, then use `Run now` to test the routine.
7. Open `Run history` and select `Open task result` to inspect the full conversation.

## Interface Walkthrough

### Entry Points

- Open `Routines` from the global navigation bar. It remains available without
  selecting a task or workspace because routines can target any registered
  project, workspace, or folder.
- The panel lists saved routines, their next run time, current status, and recent runs.

### Key Controls

- `New`: creates a routine.
- `Run now`: starts an independent run immediately.
- `Edit routine`: changes any saved specification.
- `Pause` / `Resume`: disables or restores scheduled runs without deleting the routine.
- `Delete`: removes an idle routine and its routine-history entries. Task conversations created by earlier runs remain in their workspaces.
- `Open task result`: opens the task conversation created for that run.

## Common Workflows

### Create Or Edit A Routine

1. Enter a name and the full prompt that should be sent on each run.
2. Set an interval in minutes, hours, days, or weeks.
3. Choose an existing Stave workspace or use `Choose another folder`.
4. Select Claude or Codex, then configure the model, effort, file access, approval behavior, sandbox, network access, or web search options supported by that provider.
5. Attach Information sections or individual resources from the selected workspace.
6. Save the routine. Use the pencil button later to edit the same specification.

Information references are resolved from the latest persisted Information panel values when a run starts. Renaming or updating an attached note or resource therefore changes the context used by future runs without requiring a new routine.

### Run And Inspect A Routine

1. Use `Run now`, or leave scheduled runs enabled and wait for the next interval.
2. Watch the latest run status in the routine list and run history.
3. If a run is `Waiting`, open the task result and respond to the approval or user-input request.
4. When the run completes, review its result preview or open the full task conversation.

## Files And Data

- Routine definitions and the latest 50 run records per routine are stored in Stave's local SQLite application data.
- Each occurrence is also stored as a normal, user-owned task in the selected workspace.
- Deleting a routine does not delete those task conversations.

## Limitations And Advanced Options

- Scheduled runs execute only while the Stave desktop app is open. Stave does not currently install an operating-system background job or launch itself for a due routine.
- If Stave was closed when an interval became due, the routine runs once after Stave opens and schedules the next interval from that time. It does not replay every missed occurrence.
- A routine does not start a second overlapping run. If the previous run is still active when the next interval is due, that occurrence is recorded as skipped.
- Live Lens browser state is not attachable because it is not a durable Information resource.

## Troubleshooting

### A Run Is Waiting

- Symptom: the run status stays at `Waiting`.
- Cause: the selected permission policy requires an approval or the model requested user input.
- Fix: select `Open task result`, respond in the task conversation, and let the run continue.

### A Folder Has No Information Resources

- Symptom: a newly selected folder cannot attach Information resources yet.
- Cause: the folder has not been registered as a Stave workspace.
- Fix: save the routine once, add the resources in that workspace's Information panel, then edit the routine and attach them.

### A Scheduled Run Did Not Start

- Symptom: the next run time passed while no task appeared.
- Cause: the desktop app was closed, or the previous run was still active.
- Fix: open Stave and inspect the run history. Stave runs one missed occurrence after startup or records an overlapping occurrence as skipped.

## Related Docs

- [Provider Sandbox and Approval](provider-sandbox-and-approval.md)
- [Workspace Scripts](workspace-scripts.md)
- [Latest Turn Summary](workspace-latest-turn-summary.md)
