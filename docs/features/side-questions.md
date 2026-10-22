# Side Questions

## Summary

- Ask the task's provider a quick question about the task while its agent
  works: what it is doing, why it chose something, what it decided.
- The answer appears in a panel beside the conversation. Nothing is added to
  the task's conversation, its next turn or the message you are writing.

## When To Use It

- A turn is running and you want to understand it without interrupting or
  steering it.
- You are back at a task and want a short explanation of where it stands.
- To change what the agent does, send a message (or steer) instead: a side
  question never reaches the task's agent.

## Before You Start

- The task uses Claude or Codex. Tasks on other providers show that side
  questions are not available for them.

## Quick Start

1. In the composer, type `/aside` followed by your question, and press
   `Enter`.
2. The side question panel opens beside the conversation and shows the
   answer.
3. Close the panel with its close button or `Esc`.

## Interface Walkthrough

### Entry Points

- The composer's slash command `/aside` (listed under **Stave commands** when
  you type `/`). `/aside` alone opens the panel with an empty question.
- `Cmd/Ctrl+K` then `Q` opens the panel for the active task. Change the letter
  in **Settings → Command Palette → Shell chords**.
- The question button next to the **Turn** picker in the Task panel's
  **Activity** tab.

### Key Controls

- The question field: `Enter` asks, `Shift+Enter` adds a line.
- **Copy to composer** adds the answer to your draft as a quote, below what
  the draft already says. Nothing is sent until you send it.
- **New question** clears the answer for another question.
- `Esc` closes the panel. It never stops the task's turn, unlike `Esc`
  elsewhere in the task pane.

## Common Workflows

### Ask About A Running Turn

1. While the turn runs, write your next message in the composer if you like.
2. Open the side question from **Activity** or with `Cmd/Ctrl+K` then `Q`, and
   ask.
3. The turn keeps running; your draft and the conversation stay as they were.

### Keep An Answer

1. Choose **Copy to composer**.
2. Edit the quoted answer in the composer, and send it if the agent should see
   it.

## Files And Data

- The provider receives a read-only, one-off request: a bounded excerpt of the
  conversation (built the same way as for a provider switch, see
  [Conversation Context](conversation-context.md)), what the running turn is
  doing (its latest steps and reply so far), and your question.
- The request runs on the task's provider, model and account, read-only: no
  MCP servers, no plugins, no network and no secrets bound to the task. Claude
  gets no tools at all; Codex runs in a read-only sandbox.
- The answer is kept only while Stave is open and only the latest one per
  task. It is not saved to the task, and it does not appear in the task's
  history, Activity or turn records.

## Limitations And Advanced Options

- A side question cannot change anything. On Claude it answers from the
  conversation excerpt and the current activity only; on Codex it may also
  read files in its read-only sandbox.
- Each question stands alone: earlier side answers are not sent with the next
  one.
- `/aside` is handled by Stave, so it is never sent to the provider.

## Troubleshooting

### No Answer Came Back

- Symptom: the panel says **No answer came back**.
- Cause: the provider could not answer (for example, it is signed out or
  offline); the detail under the message says why.
- Fix: choose **Retry**, or check the provider's account in Settings.

## Related Docs

- [Turn Activity](turn-activity.md)
- [Conversation Context](conversation-context.md)
- [Keyboard Shortcuts](keyboard-shortcuts.md)
