# Side Questions

## Summary

- Ask the task's provider a quick question about the task while its agent
  works: what it is doing, why it chose something, what it decided.
- The answer appears in a panel over the conversation, or over
  [Review](review-mode.md) when the task shows it. Nothing is added to the
  task's conversation, its next turn or the message you are writing.

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

1. Choose **Side question** at the right of the task's tab strip, type your
   question and press `Enter`. Or type `/aside` followed by your question in
   the composer and press `Enter`.
2. The side question panel opens over the conversation, or over Review, and
   shows the answer. Ask a follow-up in the same field; earlier questions stay
   above it.
3. Close the panel with its close button or `Esc`.

## Interface Walkthrough

### Entry Points

- **Side question** at the right of the tab strip, beside **+**, for the task
  that pane group shows. With panes split, each group's button asks about its
  own task.
- The composer's slash command `/aside` (listed under **Stave commands** when
  you type `/`). `/aside` alone opens the panel with an empty question.
- `Cmd/Ctrl+K` then `Q` opens the panel for the active task, bringing the task
  to the front when another tab has focus. Change the letter in
  **Settings → Command Palette → Shell chords**.
- **Ask a side question** in the command palette.
- The question button next to the **Turn** picker in the Task panel's
  **Activity** tab.
- The panel opens over whatever the task shows: its conversation, or
  [Review](review-mode.md), which stays open. Switching between the two keeps
  the panel open.

### Key Controls

- With no questions yet, the panel offers a few starter questions; choose one
  to ask it as written.
- The question field: `Enter` asks, `Shift+Enter` adds a line. It grows with
  the question up to six lines.
- **Copy to composer** adds the answer to your draft as a quote, below what
  the draft already says, and shows the task's conversation if Review was
  open. Nothing is sent until you send it.
- The copy button under an answer copies it, as Markdown, to the clipboard.
- The eraser at the top of the panel clears the task's side questions.
- `Esc` closes the panel. It never stops the task's turn, unlike `Esc`
  elsewhere in the task pane.

## Common Workflows

### Ask About A Running Turn

1. While the turn runs, write your next message in the composer if you like.
2. Choose **Side question** beside the tabs, or press `Cmd/Ctrl+K` then `Q`,
   and ask.
3. The turn keeps running; your draft and the conversation stay as they were.

### Keep An Answer

1. Choose **Copy to composer**.
2. Edit the quoted answer in the composer, and send it if the agent should see
   it.

## Files And Data

- The provider receives a read-only, one-off request: a bounded excerpt of the
  conversation (built the same way as for a provider switch, see
  [Conversation Context](conversation-context.md)), what the running turn is
  doing (its latest steps and reply so far), up to three earlier answered
  side questions on the task, and your question.
- The request runs on the task's provider, model and account with no tools:
  Claude gets none, and Codex runs with its shell, command, app and image
  tools switched off. No MCP servers, plugins, network or secrets bound to the
  task reach it.
- Side questions are kept only while Stave is open, up to the 20 newest per
  task. It is not saved to the task, and it does not appear in the task's
  history, Activity or turn records.

## Limitations And Advanced Options

- A side question cannot look at files, run commands or change anything; it
  answers from the conversation excerpt and the current activity only.
- A follow-up sees only the three newest answered side questions, clipped;
  older ones stay on screen but are not sent.
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
