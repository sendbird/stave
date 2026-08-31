# Turn Activity

## Summary

Turn Activity shows the live work behind the current agent turn, including
running tools, child tasks, todos, and elapsed time. Choose a compact docked
shelf, a larger draggable card, or a full-height right-rail panel when you
need more room to follow a busy turn.

## When To Use It

- Use `Docked` for a quick status check while writing the next prompt.
- Use `Floating` when the activity list should stay visible over the chat.
- Use `Panel` when a long or data-heavy activity list needs the full right rail,
  or when the turn has already ended and you still want to read what it did.

## Before You Start

- Start or open a task with an active turn so the activity surface has content.
- Expand the right rail if you want to open the panel directly.

## Quick Start

1. Start a turn and find the Turn Activity shelf above the prompt input.
2. In its header, choose the floating-card or right-rail icon to change the
   placement.
3. In `Floating`, drag the header to position the card over the chat.
4. Choose the docked icon from the activity header to return to the shelf.

## Interface Walkthrough

### Entry Points

- The default `Docked` surface appears above the prompt input while a turn is
  active.
- The right rail includes a `Turn Activity` panel icon. Opening it shows the
  current panel view or offers a button to move the activity there.

### Key Controls

- `Dock turn activity above the input`: return to the compact composer shelf.
- `Float turn activity over the chat`: show a larger card in the message pane.
- `Show turn activity in the side panel`: move the activity into the right rail
  and open that panel automatically. The panel keeps the activity list expanded.
- In `Floating`, drag the card header. The position is retained for the next
  session and is kept reachable if the window is resized.

### Activity Rows

- A row that stands for a tool call is a button. Choosing it scrolls the
  conversation to that tool call and focuses it, so a suspicious step in the
  list leads straight to its input and output.
- Rows without a tool call behind them — todos, `Approval needed`, `Activity
  paused`, the Advisor slot — stay plain text rather than becoming buttons that
  navigate nowhere.
- A finished row shows how long its step took. When the provider reports no
  duration, the row derives one from the step's own start and end, so the
  column is filled for both providers instead of only for Claude.
- In `Panel`, each work row also shows how far into the turn it started, such
  as `+1m 30s`. The docked shelf is one composer width and omits that column.

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
- A delegation that ran as a configured Worker is marked once. The `Worker`
  prefix is added only when the title names the delegated task, so a provider
  that reports nothing but "worker" gives a row reading `Worker`, not
  `Worker · Worker`.

### Hooks That Run More Than Once

One hooks file usually declares several handlers for the same event, and the
provider reports every handler run separately. Turn Activity states the moment
once and counts the handlers — `Session start hooks` with a `2 handlers`
badge — instead of listing a row per run.

- The row's status is the most urgent of its handlers, so one failure among
  several is still visible at a glance.
- When a handler fails, the row says so — `1 of 2 handlers failed`.
- The duration is the longest handler's, and in `Panel` the start offset is the
  earliest handler's, so the row spans the whole group rather than one member.

### The Last Turn

When a turn ends, `Panel` keeps it on screen instead of emptying. The header
shows a `Last turn` marker and names the outcome — `Turn finished`, `Turn
stopped`, or `Turn failed` — and the rows, agent tree, timings and metrics stay
exactly as the turn left them. The next turn replaces it.

- `Turn stopped` covers a turn you stopped yourself, one reclaimed after the
  provider went silent, and a managed task you took over.
- The elapsed time is the turn's total, not a clock that keeps running.
- Rows still lead to their tool call in the conversation.
- The agent tree is read-only here. Child tasks that outlive the turn keep
  their full controls in the child task rows below it.
- `Docked` and `Floating` clear when the turn ends, as before. The docked shelf
  has to give the composer its space back, and a floating card would leave a
  finished turn hanging over the chat with no reason to go away.

### Execution Metrics

The activity list ends with a six-tile metrics grid: `Elapsed`, `Changes`,
`Verification`, `Usage`, `Agents`, and `Headroom`. `Headroom` combines the
remaining context tokens and the account limit usage, so the grid divides
evenly across the 2-, 3-, and 6-column layouts instead of leaving a stray tile.

- A tone color marks a tile that needs attention: failed verification, a
  blocked agent, or low context or account headroom.
- `Usage` fills while the turn runs rather than only at the end.
- The dot next to a tile label reports where its number came from: filled for
  `Reported`, outlined for `Derived`, faint for `Unavailable`.
- Hover a tile to read the provenance detail behind its value.

## Common Workflows

### Follow a busy turn

1. Select `Panel` from the activity header.
2. Keep the right rail open while tools and child tasks update.
3. Return to `Docked` when you only need a compact status indicator.

### Read a turn back after it ends

1. Select `Panel` from the activity header, or open the `Turn Activity`
   right-rail panel.
2. Let the turn finish. The list stays, headed `Last turn`.
3. Choose a row to jump to that step's input and output in the conversation.

### Keep activity visible while reading chat

1. Select `Floating`.
2. Drag the header to an open corner of the message pane.
3. Expand the list when you need to inspect more work items.

## Files And Data

- The placement preference is stored with the app settings and defaults to
  `Docked`.
- A manually dragged floating position is stored with the layout state.

## Limitations And Advanced Options

- Only one Turn Activity surface is shown at a time; changing placement moves
  the existing surface rather than creating a second copy.
- `Floating` is positioned within the chat area and may be clamped after a
  window resize so its header remains reachable.
- A busy turn keeps only its most recent plain tool calls, so the oldest of
  them leave the list while subagents and child tasks stay. The limit is the
  same in every placement.
- Choosing a row whose message is no longer loaded in the conversation does
  nothing. Load the older messages first, then choose the row again.
- `Headroom` reports remaining context only when the provider states it. A
  live turn usually shows the account limit alone.
- Only the most recent turn is kept, only for the last several tasks you ran
  one in, and only until the app is restarted. Turn history older than that
  lives in the conversation itself, not here: the stored turn journal keeps
  only terminal events once a turn closes, so there is nothing to rebuild an
  older activity list from.
- A task that is archived, or whose workspace or project is removed, drops its
  last turn with it.

## Troubleshooting

### The activity list is not visible

- Symptom: no shelf appears above the prompt input.
- Cause: the current placement is `Floating` or `Panel`, or there is no active
  turn yet.
- Fix: open the `Turn Activity` right-rail panel and choose `Show turn
  activity here`, or start a turn and select `Docked` from its header.

## Related Docs

- [Child Tasks](child-tasks.md)
- [Fleet Needs Me](fleet-needs-me.md)
