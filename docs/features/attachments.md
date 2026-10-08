# Attachments

Stave lets you attach files, images and other tasks to a chat message, so the model can work from the exact local context instead of guessing from a short text description.

## When To Use Attachments

- The task depends on a specific file the model cannot infer from the prompt.
- You want to ask about a screenshot, design mock, or error image.
- You want to share logs, configs, or fixtures that are easier to read as a file than paste inline.
- You want another task's investigation or plan to inform this message.

For general repository-wide rules, use [Repository Instructions](repository-instructions.md) instead of pasting a file into every prompt.

## Quick Start

1. Open the task you want to send a message in.
2. Click the paperclip button in the prompt composer to open the file picker. Dragging a file onto the composer does not attach it.
3. For images, paste them directly from your clipboard with `Cmd/Ctrl+V`.
4. Review the chips and thumbnails above the composer, then send the turn.

## Attach A File From Your Workspace

1. In the prompt composer, click the paperclip.
2. The OS file dialog opens inside your current workspace.
3. Pick one or more files.
4. The files appear as removable chips above the composer.
5. Send the turn. Stave reads each file, tags its language, and forwards the content with your message.

You can remove a file before sending by clicking the `x` on the chip.

## Attach An Image

- Copy an image from your browser, screenshot tool, or clipboard.
- Focus the prompt composer and press `Cmd/Ctrl+V`.
- A thumbnail appears above the composer. Click the thumbnail to open a full-size preview.
- Remove an image with the `x` on its thumbnail.

You can paste more than one image into the same message. Each one is attached as a separate image.

## Attach Another Task As Context

Hand a finished investigation, plan or review from one task to another without
copying its answer by hand.

1. In the prompt composer, type `@` and part of the task's title, such as
   `@login`. The **Tasks** group lists this workspace's tasks, most recent
   first (the current task, archived tasks and subagent tasks are left out).
2. Choose the task, or press Enter or Tab while it is highlighted. The typed
   `@login` leaves the prompt and the task appears as a chip below it:
   `Task / Research the login flow · Latest reply`.
3. To bring a task from another workspace, drag its row from the sidebar onto
   the composer. The composer shows a dashed outline while it accepts the drop.
4. Choose the scope on the chip to switch what is sent:
   - **Latest reply** (default): the task's last answer, usually its
     conclusion.
   - **Recent conversation**: its latest exchanges, both your messages and the
     replies, oldest first.
5. Send. The sent message shows the same chip; the provider receives the
   task's text as retrieved context for this message only.

If an included reply is still streaming, its draft chip shows **Partial reply**.
Sending now includes the text available at dispatch, labelled as partial rather
than a final answer in the context the agent receives. The draft label disappears
when the reply finishes; previously sent chips do not describe later reply state.

Up to five tasks can be attached to one message. A long reply is clipped in
the middle so its opening and its conclusion both arrive. A task with no reply
yet is named as empty instead of being skipped, and the agent is told not to
search the filesystem for it.

Writing `stave task id: <id>` in the prompt still works for tasks in the
current workspace that are already loaded.

A [review task](review-tasks.md) is a subagent, so `@` does not list it.
When it finishes, select **Attach** on its line above the composer instead. The
chip works like any other task chip with **Latest reply** selected.

### What Is Included

- Stave reads the attached task when the message is dispatched. A queued
  message therefore uses the source task's content at send time, rather than
  a frozen copy from when you attached it.
- **Latest reply** includes up to 6,000 characters from the most recent
  non-empty assistant reply. **Recent conversation** selects up to 16
  non-empty messages with a 12,000-character text budget; it is not the full
  conversation.
- If the source task is not loaded, Stave reads its newest stored page of up
  to 40 messages. It does not load the entire task history.
- Task attachments carry conversation text, not the original files, image
  bytes, tool outputs or native provider reasoning. Attach a needed file or
  image separately.
- The chip on a sent message identifies the source and scope; it is not a
  saved preview of the exact text delivered. The text is supplied as background
  for that turn, and the chip itself is excluded from later provider history.

Remove a task with the chip's `x` before sending. Attaching it does not start,
resume or modify the source task. Select a chip's title, in the composer or on
a sent message, to open the attached task.

## Mixed Paste

If your clipboard contains image data and file references at the same time, Stave splits them:

- Image bytes become image attachments.
- File references become workspace-file attachments.
- Plain text stays as text in the composer.

## Tips

- Keep attachments focused. One or two targeted files usually beats a dozen vaguely related ones.
- Prefer the paperclip file picker when you want the exact workspace-relative path preserved in the conversation.
- Prefer paste for screenshots, error modals, and design previews.
- If you do not see an image thumbnail after paste, make sure your clipboard actually contains image data and not just text.

## Troubleshooting

### Paste Did Nothing

- Symptom: nothing appears after `Cmd/Ctrl+V`.
- Cause: the clipboard has text only, or your focus was outside the prompt composer.
- Fix: click inside the composer, then paste again. If the source was a screenshot tool, retake the screenshot so the clipboard contains image bytes.

### The File Picker Does Not Open

- Symptom: clicking the paperclip does nothing.
- Cause: you are running Stave in a browser-only mode instead of the desktop app.
- Fix: use a packaged desktop build. The file picker needs the desktop runtime.

### I Want To Drop A File Or Folder

- Symptom: dropping a file or folder onto the composer does not attach anything.
- Cause: the composer only accepts task rows by drag; files arrive through the paperclip picker or a clipboard paste, and attachments are file-scoped, not folder-scoped.
- Fix: click the paperclip, pick the files you want (open the folder in Explorer first if needed), and attach them individually.

## Related Docs

- [Review Tasks](review-tasks.md)
- [Integrated Terminal](integrated-terminal.md)
- [Repository Instructions](repository-instructions.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
