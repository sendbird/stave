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

Fresh sessions and provider switch-back use bounded history. The prompt budget
is 12,000 characters: when it overflows, Stave keeps the earliest available user
request plus recent message excerpts, retains role labels, and explicitly marks
omissions. Later corrections take precedence. This is a bounded excerpt, not a
lossless summary. The earliest available request may not be the original request
if older messages have already been paged out or transport bounds applied.

Keep the task objective, accepted constraints, verified results, and next steps
in a maintained plan or task source context. Older messages remain stored, but
they are not all automatically loaded into every provider session. Attached
task sources and workspace information help continuity; Stave does not yet
maintain a versioned, provider-independent summary of every task.

## Troubleshooting

### The Meter Is Missing

- Symptom: the composer has no fill bar.
- Cause: no stored message has reported conversation context yet.
- Fix: finish a turn, or continue with a provider that reports context.

### Compact Is Disabled

- Symptom: `Compact context` is visible but cannot be pressed.
- Cause: a turn is still running, or the task is waiting on an approval or question.
- Fix: finish or stop that interaction, then try again.
