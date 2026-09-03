# Tasks

## Summary

Tasks is a top-level surface that lists the tracker tickets assigned to you — from Crane and from Jira Cloud — and lets you start a local Stave run from one without leaving the app. You pick the project, the workspace, the provider and the autonomy level, edit the instruction, and either start the turn immediately or stage the prompt in the composer.

## When To Use It

- You are deciding what to work on next and want your ticket queue in the same window as your workspaces.
- You have picked a ticket and want a worktree, a task, and a prefilled prompt without copying the ticket by hand.
- You want a Crane ticket to show "running in Stave" for your team while the work happens locally.

Other surfaces fit better when:

- Somebody else starts the work from Crane. That arrives as a remote dispatch approval dialog; see [Crane Connector Guide](crane-connector.md).
- You want to see what already-running Stave work needs you. That is [Fleet Action Required](fleet-needs-me.md), not Tasks.
- You want a recurring, unattended run. That is the Automation Center.

## Before You Start

At least one tracker has to be connected. Tasks shows only what a connected source can return.

- **Crane** — pair this installation in `Settings → Integrations → Crane`. Tasks reuses the existing connector secret and its `crane` scope; there is nothing extra to authorize.
- **Jira Cloud** — in `Settings → Integrations → Jira`, enable the connector and enter your site URL, your account email, and an API token. **Test connection** checks the credential *and* runs your saved JQL, so a query that no longer parses is reported there rather than showing up as a silently empty list. The token is validated once, then stored encrypted by the OS keychain and read only by the desktop main process. Neither the token nor the email is ever readable back by the app window.
- A **registered Stave project** is required to kick off, because a run needs a repository and a worktree.
- Tasks is desktop-only. The browser dev build shows an explanatory empty state instead.

## Quick Start

1. Press `Cmd+K` then `T`, or click the checklist icon in the top bar.
2. Use `j` / `k` to move through the list, or type `/` and search for a key.
3. Press `Cmd+Enter` on the highlighted ticket.
4. Confirm the project and the proposed branch, review the instruction, and choose **Start in Stave**.

The workspace is created, the ticket is filed in the workspace Information panel, and Stave jumps to the new task with the turn already running.

## Interface Walkthrough

### Entry Points

- Top bar checklist icon. It carries a badge counting overdue and due-today tickets, and it is hidden entirely while no source can produce rows.
- `Cmd+K T` chord, and the `Open Tasks` and `Refresh Tasks` commands in the command palette.

### Key Controls

- **Header** — per-source sync age, a `stale` chip when a source has missed two refresh intervals, a `partial` chip when the tracker had more rows than the page budget allows, plus Refresh and Close.
- **View tabs** — *Assigned to me*, *All open*, *Recently done* (closed in the last 14 days), *In Stave* (has a Stave run). Switching tabs clears the filter chips, because the chips mean something different in each view.
- **Filter chips** — Source, Status, Priority, Project, Label, and an *In Stave / Not in Stave* selector. Each chip is multi-select and shows what is selected; Reset clears the chips and keeps the tab.
- **Group and Sort** — group by Status or Due date; sort by Priority, Due date, Updated, or Key. Group headers collapse and show a count.
- **Row** — source glyph, ticket key, priority glyph, title, labels, mirrored Jira key, Stave run badge, status, estimate, due date, assignee initials. Right-click for kick off, open in browser, copy key or link, attach to the current workspace, and jump to the Stave task.
- **Detail pane** — the ticket's metadata grid, its description rendered as Markdown, its comments, and a card for the bound Stave run. The primary button becomes *Open in Stave* once a run exists; *Kick off again* stays available in the `⋯` menu.

### Keyboard

| Key | Action |
| --- | --- |
| `j` / `↓` | Next ticket |
| `k` / `↑` | Previous ticket |
| `Enter` | Open the kickoff sheet |
| `Cmd+Enter` | Open the kickoff sheet for the highlighted ticket |
| `o` | Open the ticket in your browser |
| `/` | Focus the search box |
| `r` | Refresh every source |
| `Esc` | Close the surface |

Keys are ignored while you are typing in a field, and while the kickoff sheet is open.

## Common Workflows

### Kick Off A Ticket

1. Select the ticket and press `Enter`.
2. **Where it runs** — the project defaults to the mapping for the ticket's team or Jira project, then to the project you last used for that source, then to the open project. Choose a new workspace (the branch name is proposed from the ticket key and title, and honours the project's branch naming rule) or an existing one.
3. **What to do** — the instruction is prefilled from the ticket title, link, and description. Edit it freely; *Reset to ticket* restores the generated text.
4. **How it runs** — provider, model, reasoning effort, autonomy preset, and Advisor, exactly as in the Crane approval dialog. *Remember for `<SCOPE>`* stores the project and model choice for that team or Jira project; access levels always re-derive from your current settings.
5. **How it starts** — *Start now* runs the turn immediately. *Stage prompt only* prepares the workspace and drops the prompt in the composer for you to send.
6. For a Crane ticket, *Report progress to Crane* registers a Crane job so the ticket shows as running in Stave. It is available only when the run starts now, and only while the Crane connector is on.

### Attach A Ticket To Work In Progress

Right-click a row and choose **Attach to `<workspace>`**. The ticket is registered in that workspace's Information panel — a Crane ticket that mirrors a Jira issue is filed in both sections. Attaching the same ticket twice changes nothing.

### Verify A Kickoff

- The row shows a *Running* badge with a pulsing dot, and the detail pane's run card shows an animated indicator.
- For a Crane kickoff with write-back, the run card reads *Reported to Crane*; without it, *Local only*.
- A finished run flips the badge to *Done in Stave*; a failed one to *Failed*, with the error code on the run card.

## Files And Data

- Cached tickets and kickoff links live in the Stave SQLite database (`tracker_tasks_cache`, `tracker_task_kickoffs`). They hold ticket fields and run state, never credentials.
- The Jira credential lives in its own encrypted document in the app's user-data directory. Only ciphertext is written, and the vault refuses to write at all when OS encryption is unavailable.
- View state (tab, group, sort, source selection) and the last-used project per source live in `localStorage`, so they are not part of settings export.
- Settings live under `trackerTasks` (default view, refresh interval, default start mode) and `jiraConnector` (enabled, site URL, JQL, page size, project mappings) in the Stave settings document.

**Egress:** Stave reads from your trackers. The only thing it writes back is Crane job lifecycle state — status, sequence, timestamps, and safe error codes — and only when you leave *Report progress to Crane* on. Prompts, responses, reasoning, file contents, paths, diffs, and credentials never leave the machine. Jira is read-only; no status transition, comment, or worklog is ever written.

## Limitations And Advanced Options

- Jira Cloud only. Jira Data Center and Server are not supported yet.
- The Jira list is defined by one JQL query, edited in Settings. The default is `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`.
- Kickoff does not transition the ticket's status in either tracker. Move the ticket yourself if your team expects that.
- A source stops paging at a bounded number of rows and reports `partial`; narrow the JQL or the assignee filter rather than expecting the whole backlog.
- Background refresh runs only while the surface is open, at the interval set in `Settings → Tasks`. Use `r` or Refresh at any time.
- Kickoff is not exposed over MCP. The read-only `stave_list_tracker_tasks` tool is; starting a paid, externally visible run stays a human action.

## Troubleshooting

### The top bar has no Tasks icon

- Symptom: no checklist icon, and `Cmd+K T` opens an empty surface.
- Cause: no source is *ready* — a connector is off, unpaired, or has no credential.
- Fix: open `Settings → Integrations` and finish the Crane pairing or the Jira credential. The Tasks empty state lists what each source is waiting for.

### Tasks is empty and I do not know why

- Symptom: the surface opens but lists nothing.
- Cause: usually no source is producing rows — a connector is off, unpaired, missing a credential, or its server does not serve the list.
- Fix: the empty state names every source and its state, so read it first. It says **No tracker is sending tickets** when nothing can produce rows, and **Nothing assigned right now** only when a source is working and genuinely has nothing for you. `Settings → Tasks → Sources` shows the same live state, and a source that needs setup has a **Set up** button next to it.

### Crane shows a note about not serving the task list

- Symptom: a grey note reads "Crane: This Crane installation does not serve the task list yet", and only Jira rows appear.
- Cause: the paired Crane deployment does not have the task API. Pairing, dispatched jobs, and receipts are unaffected — those use a different, already-shipped route.
- Fix: nothing to do in Stave. The rows appear once the Crane side ships the routes; until then use Jira, or start Crane work from Crane itself.

### A red banner says a source did not sync

- Symptom: rows still show, with a per-source error banner above them.
- Cause: `unauthorized` means the credential was rejected; `invalid_jql` means the saved query no longer parses; `rate_limited` means the tracker is throttling.
- Fix: use Retry for a transient failure. For `unauthorized`, replace the Jira API token; for `invalid_jql`, fix or reset the query in Settings.

### Kickoff fails with "project is not registered"

- Symptom: the sheet stays open with an error toast.
- Cause: the mapped project path is no longer a registered Stave project.
- Fix: pick a registered project in the sheet, or re-add the project, then update the mapping in `Settings → Integrations`.

### The list is empty but the tracker has my tickets

- Symptom: *Assigned to me* is empty while the browser shows assigned work.
- Cause: the view hides finished work, and for Jira the list is whatever the JQL returns.
- Fix: switch to *All open*, then widen the JQL in Settings if the tickets are still missing.

## Related Docs

- [Crane Connector Guide](crane-connector.md) — pairing, and jobs started from Crane
- [Fleet Action Required Guide](fleet-needs-me.md) — approvals and questions across running work
- [Provider Sandbox and Approval Guide](provider-sandbox-and-approval.md) — what the autonomy presets mean
- [Local MCP User Guide](local-mcp-user-guide.md) — the read-only tracker listing tool
