# Conversation Context

## Summary

- The composer shows the selected provider's latest context-window usage, once that provider reports enough information.
- When the active provider accepts `/compact`, you can summarize the conversation from that meter without losing the draft you are typing.

## When To Use It

- Use it to check remaining room during a long task. Compaction cannot recover decisions the provider has already forgotten.
- Use Compact when you want to keep working in the same task but free context.
- Use the status bar for account quota. That is a different number.

## Before You Start

- Finish at least one assistant turn so the provider can report context.
- Compact needs an idle composer. Stop or finish the current turn first.

## Quick Start

1. Open a task that has already completed a turn.
2. Look under the composer for a short fill bar and a percent.
3. Open the meter to read the latest reported fill.
4. Choose `Compact context` if you want the provider to summarize the conversation.

## Interface Walkthrough

### Entry Points

- The meter sits in the composer toolbar, left of the attach and send buttons.
- It appears only after a turn reports conversation context.

### Key Controls

- The fill bar uses the same ok / warn / critical tones as other usage meters: under 60%, under 85%, then above.
- The popover shows the percent and, when the provider reported them, used and window token counts.
- `Compact context` sends `/compact` as a utility turn and leaves the composer draft in place.

## Common Workflows

### Check Remaining Room

1. Complete a turn.
2. Open the meter.
3. Read the percent before sending a large follow-up.

### Compact And Continue

1. Wait until the turn is idle.
2. Open the meter and choose `Compact context`.
3. Keep the text already in the composer. It is not replaced.

## Files And Data

- The meter reads the latest assistant message usage for the selected provider, not another provider's usage from the same task.
- Codex uses the last token-usage snapshot and the reported model window. Claude uses the latest primary API message's input, cache, and output counts with that model's reported window. Multi-call billing totals are not context-window occupancy.
- It does not add a new settings key or persist a separate counter.

## Limitations And Advanced Options

- Providers that never report a window or percent do not show the meter.
- Compact is offered for Claude and Codex, or when the loaded slash catalog includes `/compact`.
- Compact is a provider session command. It does not revert workspace files.
- Claude receives its native `/compact` command; optional focus instructions are supported by that CLI. Codex calls the App Server compaction API, waits for a completed compaction item and successful turn completion, and rejects custom compact instructions that the API cannot accept.
- Claude must report a compact boundary too. A command that returns without one is shown as unconfirmed compaction, even when its SDK result is otherwise successful.
- An existing native session is required. If a provider is new to the task, or runtime configuration requires a fresh session, send a normal message to synchronize context first.
- A successful compact boundary invalidates older usage snapshots when no replacement is reported. The meter returns after the provider reports usage again.

### Switching Providers In One Task

Each provider has its own native session. Compact affects only the selected
provider's session; it does not summarize all providers' conversations together.
For example, after Claude → Codex → Claude, Claude resumes its session and
receives the intervening Codex conversation on the next normal message.
Running Compact first preserves that pending history. It does not mark it as
already delivered. Failed and interrupted turns also preserve the prior sync
position.

### Keeping Long Tasks Grounded

Native automatic compaction remains the provider's responsibility. Stave does
not add another automatic summarizer or repeatedly resend the entire transcript
to a healthy resumed session.

### Seeing What A Switch Sends

When the next message will go to another provider than the one that answered
last, the composer shelf shows `Switching to <provider>` before you send, with
a one-line summary. Choose `What it receives` for the details:

- whether the provider starts its own session (it has not worked on the task
  before) or resumes the one it had;
- that the task's [handoff record](task-handoff-record.md) goes first, when
  the task has one;
- how many messages it receives and how many characters that is: the whole
  loaded conversation for a new session, or what happened since it last worked
  here for a resumed one;
- what the 12,000-character budget leaves out, and how many long messages are
  shortened in the middle;
- that messages travel as their text, so their tool calls, images and
  attached files stay behind; a message without text travels as a summary of
  its parts instead (tool calls with their input and output, images and files
  by name), and the notice says how many do.

When the draft starts with a provider command such as `/compact`, the command
goes to the provider as typed, with no excerpt and no handoff record, and the
notice says so instead.

The notice uses the same rules that build the prompt, so the numbers are what
the provider receives. It changes nothing about the message; there is no
setting to choose. It is not shown while a turn runs or when Stave Auto picks
the provider at send time.

Fresh sessions and provider switch-back use bounded history. The prompt budget
is 12,000 characters: when it overflows, Stave keeps the earliest available user
request plus recent message excerpts, retains role labels, and explicitly marks
omissions. Later corrections take precedence. This is a bounded excerpt, not a
lossless summary. The earliest available request may not be the original request
if older messages have already been paged out or transport bounds applied.

Keep the task objective, accepted constraints, verified results, and next steps
in the task's [handoff record](task-handoff-record.md). It is sent ahead of the
excerpt whenever the excerpt is sent, so a provider starting on the task, or
coming back to it, reads what the task settled before the conversation that led
there; a provider continuing its own session receives it again once after you
save a change. Older messages remain stored, but they are not all automatically loaded
into every provider session. Attached task sources and workspace information
help continuity too.

## Troubleshooting

### The Meter Is Missing

- Symptom: the composer has no fill bar.
- Cause: no stored message has reported conversation context yet.
- Fix: finish a turn, or continue with a provider that reports context.

### Compact Is Disabled

- Symptom: `Compact context` is visible but cannot be pressed.
- Cause: a turn is still running, or the task is waiting on an approval or question.
- Fix: finish or stop that interaction, then try again.
