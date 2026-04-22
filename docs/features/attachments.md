# Attachments

Stave lets you attach files and images to a chat message, so the model can work from the exact local context instead of guessing from a short text description.

## When To Use Attachments

- The task depends on a specific file the model cannot infer from the prompt.
- You want to ask about a screenshot, design mock, or error image.
- You want to share logs, configs, or fixtures that are easier to read as a file than paste inline.

For general repository-wide rules, use [Project Instructions](project-instructions.md) instead of pasting a file into every prompt.

## Quick Start

1. Open the task you want to send a message in.
2. Click the paperclip button in the prompt composer to open the file picker, or drop a file directly onto the composer.
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

### I Want To Drop A Folder

- Symptom: dropping a folder onto the composer does not attach anything.
- Cause: attachments are file-scoped, not folder-scoped.
- Fix: open the folder in Explorer, pick the files you want, and attach them individually.

## Related Docs

- [Integrated Terminal](integrated-terminal.md)
- [Project Instructions](project-instructions.md)
- [Runtime Safety Controls](provider-sandbox-and-approval.md)
