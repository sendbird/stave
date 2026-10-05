# Turn Activity

## Summary

Turn Activity shows the live work behind the current agent turn: running
tools, delegated tasks, todos, and elapsed time. While anything is in flight,
a one-line summary sits on the **composer shelf** directly above the prompt
input, with the queue of messages waiting to send beneath it. The details —
every row the turn reported — open inline under that line, in a floating card
over the chat, or in the **Activity** tab of the right rail's Task panel.

## When To Use It

- Glance at the run line while writing the next prompt: what is running, the
  to-do progress, how long it has gone, and whether it needs you.
- Open the details inline (`Above the prompt`) for a quick look at the rows.
- Use `Floating card` when the rows should stay visible over the chat.
- Use `Task panel` when a long or data-heavy turn needs the full right rail,
  or when the turn has already ended and you still want to read what it did.

## Before You Start

- Start or open a task with an active turn so the shelf has something to say.
- Expand the right rail if you want to open the Task panel directly.

## Quick Start

1. Start a turn. The run line appears above the prompt input:
   `Working · Edit file · ChatInput.tsx`, the to-do progress, the elapsed time
   and **Stop**.
2. Choose the chevron at the end of the line to unfold the turn's rows under
   it, and choose it again to fold them away.
3. Choose the panel button beside it to open the Task panel on **Activity**.
4. To change where the chevron opens the details, open **Settings → Chat** and
   pick **Open Run Details In**.

## Interface Walkthrough

### The Composer Shelf

The shelf is one surface tucked behind the top of the prompt input. Its run,
usage-limit, review and queue lines are divided by a hairline. It takes no room
when there is no run, usage-limit pause, review or queued message to show.

| State | Shelf |
| --- | --- |
| Idle | Nothing. A queue left after you stopped a turn, or restored after a restart, keeps its own row. |
| A turn is running | The run line: a status mark, `Working · <current step>`, the to-do count and cells, the elapsed time, **Stop**, the panel button and the details toggle. |
| Running with queued messages | The run line, then the queue line. |
| Waiting on an approval or a question | The request's card asks above the shelf; the run line turns amber and reads `Waiting for approval` or `Waiting for your input` without asking again. The details stay folded behind the card. |
| Stalled | The run line turns amber and reads `Stalled · No updates for 2m`, with how to stop or interrupt it. |
| Steering | `Steering · Waiting for the provider to accept your message` until the provider takes the steer. |
| Provider retry or failure | `Retrying` in amber, or `Failed` in red with the reason; a failed turn stays for a few seconds, then the shelf leaves. |
| An agent run | The agent's line replaces the turn's: see [With An Agent Run](#with-an-agent-run). |
| Stopped at a usage limit | The usage-limit line: `Claude usage limit · resets 3:40 PM · in 1h 7m`, with **Resume at reset** and **Resume now**. See [When A Usage Limit Stops Work](#when-a-usage-limit-stops-work). |
| A review runs in its own task | One line per review: `Reviewing · <model> · <elapsed>` with **View** and **Stop**, then `Review ready` with **Attach**, **View** and **Dismiss**. **View** shows the review's answer and activity in a dialog. It shows when the task is idle too. See [Review Tasks](review-tasks.md). |

There is exactly one status line for a run. The Task panel's **Activity** tab
lists the rows without repeating it, and its run header names only an ended
run's outcome.

### Where The Details Open

**Settings → Chat → Open Run Details In** decides what the details toggle at
the end of the run line does. The run line itself stays above the prompt
input whichever you pick, and its panel button always opens the Task panel.

- `Above the prompt` (default): the chevron unfolds the turn's rows under the
  run line, inside the shelf.
- `Floating card`: the toggle shows or hides a draggable card over the chat.
  Drag it by its grip; the position is retained for the next session and kept
  reachable if the window is resized. The card's close button hides it again.
- `Task panel`: there is no chevron; the panel button opens the Task panel's
  **Activity** tab.

**Open Run Details** (off by default) opens the details when a run starts. A
toggle during a run lasts until that run ends; the next run starts from the
setting again. Stave saves every setting with its value, so an install that
already had this switch keeps the value it had; turn it off once in Settings
to start runs folded.

### The Queue

A message sent while a turn runs waits in the queue line under the run line:
`2 queued · <the next message>`, with **Steer** to push it into the running
response now (or **Send** when no turn is running). A queued message that will
go to another model than the composer's says `as <model>`.

Choose the chevron to open the queue, in the order it sends:

- Hover or focus a row for **Steer**, **Send**, **Edit** and **Delete**. Edit
  keeps the message in its place; Enter saves and Esc cancels.
- Drag a row by its grip to change the order.
- A row bound for another model says `Sends as <model>, not <composer model>`;
  a row with files or images counts them.
- **Clear all** empties the queue.

Messages with attachments cannot be steered, so they wait for the current
response to finish.

The queue is saved with the workspace, so it survives a restart with its
order, attachments and the provider and model each message was queued for.
After a restart it does not send on its own: the line reads
`2 queued · paused` with **Resume**. Choose **Resume** to send the messages in
order, or edit, reorder, delete or send one first. A message you queue after
the restart waits behind the restored ones.

### When A Usage Limit Stops Work

When a turn ends because the account ran out of usage, or a queued message is
refused because the account is already at its limit, the task pauses instead
of offering the next queued message to the same limit. The shelf shows the
usage-limit line above the queue:

- `Claude usage limit · resets 3:40 PM · in 1h 7m` names the provider, when
  the limit resets and how long that is. Hover it for the window that ran out
  and what Resume will do.
- **Resume at reset** resumes on its own a minute after the reset. The line
  then reads `Resumes at 3:41 PM · Claude usage limit · in 1h 8m`, with
  **Cancel**. Before it sends, Stave reads usage again; if a window is still
  out (a weekly limit after the 5-hour one), it waits for that reset instead.
- **Resume now** continues straight away. A turn the limit stopped is
  continued first: Stave starts a new turn that asks the agent to check the
  workspace and finish only the remaining work, without replaying the original
  prompt. The queue sends after it.
- The close button forgets the pause when nothing is queued.

Starting a new conversation turn in the task also ends the usage-limit pause.
Utility turns do not release it. A restored queue still needs its own
**Resume** action. When the reset time is unknown (the provider did not report
it), only **Resume now** is offered.

**Resume now** does not bypass account limits or runtime approvals. If the
continuation cannot start, the task stays paused and the reason is shown.
**Cancel** removes the reset-time reservation; it leaves the work paused.

The pause retains the provider, model and account that stopped the work.
Changing the composer or selecting another account does not retarget its
automatic resume or continuation. If Stave cannot read that account's usage,
the work stays paused and the reset-time reservation is cancelled with a
notice. Older pauses without a recorded account need **Resume now**, which
uses the currently selected account for the recorded provider.

The pause and reservation last only until Stave restarts. Keep Stave open for
**Resume at reset** to run. After reopening, review the restored queue and
choose **Resume**; the old reset-time reservation is not restored, and this
queue action does not automatically continue the interrupted turn. Send a
follow-up if you also want the agent to finish that turn's remaining work.

### Narrow Composers

The shelf reads the composer's own width, not the window's:

- 560px and wider: the full line.
- Narrower: the to-do cells, the stage track and the panel button give way.
  The count moves into the words (`Working · 3/7 · Edit file`, or
  `Debugger · Cause 2/3`), Stop and the details toggle stay, and Steer keeps
  its icon. When the Task panel is the only way to the details, its button
  stays.

### The Task Panel

The right rail's **Task** panel is the one place for the active task. Its tabs:

- **Activity**: the turn's rows — the current turn, or the last one once it
  ends — under every placement.
- **Progress**: the task's [agent run](agent-runs.md) while it has one — running,
  paused or ended — and otherwise its flow (Request → Plan → Changes →
  Verification → Pull request), with the task's wake-up under either.
- **Subagents**: every agent the task called, in its turn or as a
  [delegated task](delegated-tasks.md), with its state and answer.
- **Outputs**: saved answers and reported file changes, one entry per ended execution.

A tab can carry a small mark from data the app already holds: a dot on
**Activity** while the turn runs or waits on you, a dot on **Progress** when the
agent run needs you or is blocked, the number of running agents on **Subagents**, and
the number of unchecked outputs on **Outputs**. The tab you choose is kept with
the layout, so the panel reopens where you left it, and a task tab's context
menu opens it straight to **Outputs**, **Progress** or **Subagents**.

The left-navigation **Agent performance** screen compares runs across workspaces.
See [Agent performance and task outputs](results.md) for the difference and examples.

### With An Agent Run

While a task runs an agent or an [agent run](agent-runs.md), its line heads the
shelf for the whole run, between turns included, and the turn it is running
never draws a second status:

- The agent's name, `Working` or `Needs you` with what it waits on, and the
  current step while a turn runs.
- When that turn stalls, steers, retries or fails, the line says so in the
  turn's own words and colors in place of the run's state:
  `<Agent> · Stalled · No updates for 2m · Esc stops it…`, `Steering`,
  `Retrying` or `Failed` with the reason.
- An agent with a workflow draws its stages as the compact track, naming the
  stage and where it stands (`Cause 2/3`); a one-stage run shows its turn's
  to-dos.
- **Stop**, **Take control**, and **Retry** while a stage is stuck; a legacy
  run offers **Take over** and **Resume** instead.
- The panel button opens **Progress**; the details toggle unfolds the current
  turn's rows.

A stage that waits for your sign-off asks in its card above the shelf; the
line says the run needs you without repeating the question.

### Activity Rows

- A row that stands for a tool call is a button. Choosing it scrolls the
  conversation to that tool call and focuses it, so a suspicious step in the
  list leads straight to its input and output.
- Rows without a tool call behind them — todos, `Approval needed`, `Activity
  paused` — stay plain text rather than becoming buttons that
  navigate nowhere.
- A finished row shows how long its step took. When the provider reports no
  duration, the row derives one from the step's own start and end, so the
  column is filled for both providers instead of only for Claude.
- In the Task panel, each work row also shows how far into the turn it started,
  such as `+1m 30s`. The inline list is one composer width and omits that
  column.
- In the Task panel, tool, event, and agent rows wrap titles and details so a
  long path or command stays readable. The inline list keeps each field to one
  ellipsized line.

### Provider-Specific Detail

Row titles use one vocabulary for every provider, so the same turn reads the
same way whichever agent ran it. A hook row is titled by the moment in the turn
it fired — `Session start hook`, `Before tool use hook` — rather than by the
provider's own identifier, which is spelled differently by each of them.

Tool rows work the same way. One shell command is `Run command` whether the
provider called the tool `Bash` or `bash`; a web lookup is `Web search` for both
`WebSearch` and `web_search`; an MCP call reads `ibis create page` whether the
provider namespaced it as `mcp__ibis__ibis_create_page` or
`ibis:ibis_create_page`. When the agent wrote its own description of a step,
that description is still the title — Stave cannot invent one for a provider
that sends none, and the agent's own words beat any derived label.

File edits get a row on every provider. Codex applies a whole patch as one
operation, so its row names the first file and counts the rest —
`Edit file · providers/turn-status.ts +1 more` — where Claude, which reports one
edit per file, gets one row each.

What only that provider can say still appears, in its own slot on the second
line: monospaced, dimmer, and separated from the normalized text by a thin
rule. For a hook that is the provider's raw event token when it differs from the
title, the handler kind, and the file the handler was declared in, such as
`command · codex/hooks.json`. So a row never presents a provider identifier as
if it were Stave's own description of the step, and the provider's exact
spelling is still there when a misbehaving hook has to be traced back to its
config.

Hook commands and hook output are never shown. Providers report them, and Stave
drops them before they reach the window.

### Rows That Are Left Out

- Todo bookkeeping calls get no row of their own. Every provider makes them, and
  the todos they write already have rows further down the list.
- A row is never titled from a tool's arguments. Only fields a provider defines
  as labels can name a row, so an MCP call carrying a `name` argument shows the
  tool it called rather than that argument's value.

### Hooks That Run More Than Once

One hooks file usually declares several handlers for the same event, and the
provider reports every handler run separately. Turn Activity states the moment
once and counts the handlers — `Session start hooks` with a `2 handlers`
badge — instead of listing a row per run.

- The row's status is the most urgent of its handlers, so one failure among
  several is still visible at a glance.
- When a handler fails, the row says so — `1 of 2 handlers failed`.
- The duration is the longest handler's, and in the Task panel the start offset
  is the earliest handler's, so the row spans the whole group rather than one
  member.

### The Last Turn

When a turn ends, the Task panel's **Activity** tab keeps it on screen instead
of emptying. The header
shows a `Last turn` marker and names the outcome — `Turn finished`, `Turn
stopped`, or `Turn failed` — and the rows, agent tree, timings and metrics stay
exactly as the turn left them. The next turn replaces it.

- `Turn stopped` covers a turn you stopped yourself, one reclaimed after the
  provider went silent, and a managed task you took over.
- The elapsed time is the turn's total, not a clock that keeps running.
- Rows still lead to their tool call in the conversation.
- The agent tree is read-only here. Delegated tasks that outlive the turn keep
  their full controls in the delegated task rows below it.
- The composer shelf and the floating card clear when the turn ends. The shelf
  has to give the composer its space back, and a floating card would leave a
  finished turn hanging over the chat with no reason to go away.

### Execution Metrics

The activity list ends with a six-tile metrics grid: `Elapsed`, `Changes`,
`Verification`, `Usage`, `Agents`, and `Headroom`. `Headroom` combines the
remaining context tokens and the account limit usage, so the grid divides
evenly across the 2-, 3-, and 6-column layouts instead of leaving a stray tile.
In the Task panel, the four outcome tiles (`Changes`, `Verification`, `Usage`,
`Headroom`) sit on the rail floor instead of scrolling with the rows. They
stay two-up while the rail is at least `24rem` wide, and stack one tile per
row when it is narrower.

- A tone color marks a tile that needs attention: failed verification, a
  blocked agent, or low context or account headroom.
- `Usage` fills while the turn runs rather than only at the end.
- The dot next to a tile label reports where its number came from: filled for
  `Reported`, outlined for `Derived`, faint for `Unavailable`.
- Hover a tile to read the provenance detail behind its value.

## Common Workflows

### Follow a busy turn

1. Choose the panel button on the run line.
2. Keep the right rail open while tools and delegated tasks update; the run
   line above the prompt keeps the state and **Stop**.
3. To make the chevron open the panel every time, pick `Task panel` under
   **Settings → Chat → Open Run Details In**.

### Read a turn back after it ends

1. Open the Task panel's **Activity** tab.
2. Let the turn finish. The list stays, headed `Last turn`.
3. Choose a row to jump to that step's input and output in the conversation.

### Pick up work a usage limit stopped

1. When the usage-limit line appears, choose **Resume at reset** and leave
   Stave open, or choose **Resume now** once you have usage again.
2. To keep the queue but not resume, leave the line as it is; nothing sends
   until you choose.

### Steer or reorder what is queued

1. Send a follow-up while a turn runs; it joins the queue line.
2. Choose **Steer** to push the next message into the running response, or
   open the queue and drag rows into the order they should send.

## Files And Data

- **Open Run Details In** is stored with the app settings and defaults to
  `Above the prompt`; **Open Run Details** defaults to off.
- A manually dragged floating position is stored with the layout state.
- The details toggle's state lasts for the current run only and is not saved.
- Queued messages are saved with the workspace. Whether a restored queue was
  resumed, a usage-limit pause and its **Resume at reset** choice are kept in
  memory only: after a restart the queue is paused again and you choose anew.

## Limitations And Advanced Options

- The run line is always above the prompt input; only the details move.
- `Floating` is positioned within the chat area and may be clamped after a
  window resize so its grip remains reachable.
- A busy turn keeps only its most recent plain tool calls, so the oldest of
  them leave the list while subagents and delegated tasks stay. The limit is the
  same in every placement.
- Choosing a row whose message is no longer loaded in the conversation does
  nothing. Load the older messages first, then choose the row again.
- Dragging a queued message needs a pointer; there is no keyboard reorder.
- **Resume at reset** runs only while Stave is open. A usage limit is
  recognized from the provider's own limit message; a short per-request
  throttle is not treated as one.
- `Headroom` reports remaining context only when the provider states it. A
  live turn usually shows the account limit alone.
- Only the most recent turn is kept, only for the last several tasks you ran
  one in, and only until the app is restarted. Turn history older than that
  lives in the conversation itself, not here: the stored turn journal keeps
  only terminal events once a turn closes, so there is nothing to rebuild an
  older activity list from.
- A task that is archived, or whose workspace or repository is removed, drops its
  last turn with it.

## Troubleshooting

### The details do not open under the run line

- Symptom: the run line shows, but there is no chevron.
- Cause: **Open Run Details In** is `Task panel`, or an approval or question
  card is waiting above the shelf.
- Fix: use the panel button, answer the card, or pick `Above the prompt` in
  **Settings → Chat**.

### The details open by themselves at every turn

- Cause: **Open Run Details** is on (an install that had the earlier
  "expanded" switch on keeps it).
- Fix: turn it off in **Settings → Chat**.

## Related Docs

- [Accounts And API Connections](accounts-and-gateways.md)
- [Attachments](attachments.md)
- [Delegated Tasks](delegated-tasks.md)
- [Fleet Needs Me](fleet-needs-me.md)
- [AgentRuns](agent-runs.md)
