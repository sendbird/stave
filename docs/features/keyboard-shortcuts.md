# Keyboard Shortcuts

Every keyboard shortcut in Stave, in one place. The same list is inside the app:
press `Cmd/Ctrl+/`, run **Open keyboard shortcuts** from the
[Command Palette](command-palette.md), or open **Settings → Keyboard & Commands** and
choose **View all shortcuts**. The in-app list is generated from the same table
the app uses to handle the keys, so it always matches what the keys do, including
the keys you changed in Settings.

`Cmd/Ctrl` means Cmd on macOS and Ctrl on Windows and Linux. In the in-app list,
macOS shows the symbols ⌘ ⇧ ⌥ ⌃.

The tooltips of the top bar and right rail controls show the same keys for the
control's shortcut, with your Settings applied. The right rail is one stop in
the Tab order; the arrow keys move between its toggles.

## Typing In A Field

Shortcuts marked **Not while typing** do nothing while focus is in a text field,
the prompt composer, the editor, or the terminal, so they never take a key you
meant to type. Undo, back, and forward are always in this group: `Cmd/Ctrl+Z` in
a field is the field's own undo.

Most app shortcuts that use `Cmd/Ctrl` still work from the terminal, while
Ctrl-only combinations stay with the shell (for example Ctrl+C).

## Reopen, Back, And Forward

- `Cmd/Ctrl+Shift+T` reopens the tab you closed most recently in the current
  workspace: a task, a file, the commit graph, or a Lens tab (Lens tabs come back
  on the page they showed). Each workspace remembers its last 20 closed tabs.
  Tabs whose task, file, or workspace is gone are skipped. Terminals and CLI
  sessions cannot be reopened, because closing them ends their process.
- `Cmd/Ctrl+[` and `Cmd/Ctrl+]` go back and forward through the tasks, files, and
  Lens tabs you activated, across workspaces, the way a browser does. Visiting
  somewhere new after going back drops the forward steps.
- `Cmd/Ctrl+Z` outside a text field undoes the last **Settle** or **Snooze** in
  the Work queue while its Undo toast is still showing.

## Navigation

| Action | Keys | Where |
| --- | --- | --- |
| Go home | `Cmd/Ctrl+K` then `H` | Anywhere |
| Open Fleet View | `Cmd/Ctrl+K` then `F` | Anywhere |
| Open Schedules | `Cmd/Ctrl+K` then `A` | Anywhere |
| Open Issues | `Cmd/Ctrl+K` then `T` | Anywhere |
| Open Agents | `Cmd/Ctrl+K` then `G` | Anywhere |
| Go back | `Cmd/Ctrl+[` | Workspace, not while typing |
| Go forward | `Cmd/Ctrl+]` | Workspace, not while typing |
| Select workspace | `Cmd/Ctrl+Shift+1..9` | Sidebar order, not while typing |
| Quick open file | `Cmd/Ctrl+P` | Anywhere |
| Open command palette | `Cmd/Ctrl+Shift+P` | Anywhere |
| Open settings | `Cmd/Ctrl+,` | Anywhere |

## Tasks And Tabs

| Action | Keys | Where |
| --- | --- | --- |
| New task | `Cmd/Ctrl+N` | Not while typing (works in the terminal) |
| Close tab / task | `Cmd/Ctrl+W` | Anywhere; closes the tab without archiving the task |
| Reopen closed tab | `Cmd/Ctrl+Shift+T` | Workspace |
| Next task | `Cmd/Ctrl+Shift+J` or `Cmd/Ctrl+Shift+ArrowDown` | Not while typing |
| Previous task | `Cmd/Ctrl+Shift+K` or `Cmd/Ctrl+Shift+ArrowUp` | Not while typing |
| Split pane right | `Cmd/Ctrl+\` | Not while typing |
| Split pane down | `Cmd/Ctrl+Shift+\` | Not while typing |

## Panels

| Action | Keys | Where |
| --- | --- | --- |
| Toggle workspace sidebar | `Cmd/Ctrl+K` then `B` | Anywhere |
| Toggle source control panel | `Cmd/Ctrl+K` then `C` | Anywhere |
| Open explorer panel | `Cmd/Ctrl+K` then `E` | Anywhere |
| Search in files | `Cmd/Ctrl+Shift+F` | Anywhere |
| Toggle information panel | `Cmd/Ctrl+K` then `I` | Anywhere |
| Open Workspace Tools | `Cmd/Ctrl+K` then `S` | Anywhere |
| Open Lens tab | `Cmd/Ctrl+K` then `L` | Anywhere |
| Visual comment | `Cmd/Ctrl+Alt+.` | Lens, not while typing; change it in Settings |
| Focus editor | `Cmd/Ctrl+K` then `\` | Anywhere |
| Toggle terminal | `Cmd/Ctrl+K` then `` ` `` | Anywhere |
| Switch between conversation and Review | `Cmd/Ctrl+Alt+R` | Workspace; switches the active task |
| Ask a side question | `Cmd/Ctrl+K` then `Q` | Anywhere; opens the panel beside the active task's conversation |

The letter after `Cmd/Ctrl+K` is the default. Change or turn off any of them under
**Settings → Keyboard & Commands → Shell Shortcut Chords**; the list in the app follows your
choice.

## Composer And Models

| Action | Keys | Where |
| --- | --- | --- |
| Focus prompt composer | `Cmd/Ctrl+L` or `Cmd/Ctrl+J` | Active task |
| Stage comment | `Cmd/Ctrl+Enter` | While typing in the composer; change it in Settings |
| Stop active turn | `Esc` | Task pane or composer |
| Allow request once | `Enter` | Active task with a pending request, not while typing |
| Answer with guidance | `Tab` | Active task with a pending request, not while typing |
| Choose an answer | `1..9` | An agent question in the composer, not while typing |
| Next question or send answers | `Enter` | An agent question in the composer; Shift+Enter adds a line to a written answer |
| Ask the side question | `Enter` | While typing in the side question panel; Shift+Enter adds a line |
| Close the side question panel | `Esc` | Side question panel; the task's turn keeps running |
| Open model selector | `Alt+P` | Active task |
| Model shortcut slots | `Alt+1..0` | Active task; assign them in Settings → Keyboard & Commands |
| Increase effort | Unassigned; pick a letter after `Cmd/Ctrl+K` in Settings → Keyboard & Commands → Shell Shortcut Chords | Active task; steps through the selected model's levels and stops at the highest; does nothing while a request or question waits |
| Decrease effort | Unassigned; pick a letter after `Cmd/Ctrl+K` in Settings → Keyboard & Commands → Shell Shortcut Chords | Active task; stops at the lowest level; does nothing while a request or question waits |
| Preset shortcut slots | `Ctrl+1..9` | Anywhere; the first nine presets in Settings → Presets & Macros → Presets |

## Editing

| Action | Keys | Where |
| --- | --- | --- |
| Save file | `Cmd/Ctrl+S` | Editor |
| Send review comments | `Cmd/Ctrl+Alt+Enter` | Editor diff view |
| Undo settle or snooze | `Cmd/Ctrl+Z` | While a Work queue Undo toast shows, not while typing |
| Dialog primary action | `Enter` or `Cmd/Ctrl+Enter` | Dialogs; use `Cmd/Ctrl+Enter` in multi-line fields |

## Surfaces

These keys work only while their surface is open or focused.

| Action | Keys | Where |
| --- | --- | --- |
| Next item that needs you | `N` | Fleet View, not while typing |
| Close Fleet View | `Esc` | Fleet View; steps back first: an open panel, then the focused row, then the search |
| Next inbox row | `ArrowDown` | Fleet's inbox or the notification list, with a row focused |
| Previous inbox row | `ArrowUp` | Fleet's inbox or the notification list, with a row focused |
| Open inbox row | `Enter` | A focused Fleet or notification row: opens its control panel or its task |
| Allow a Fleet request once | `A` | A focused Fleet row with an approval |
| Deny a Fleet request | `D` | A focused Fleet row with an approval |
| Answer a Fleet question | `1..9` | A focused Fleet row with a short question |
| Next issue | `J` or `ArrowDown` | Issues, not while typing |
| Previous issue | `K` or `ArrowUp` | Issues, not while typing |
| Kick off issue | `Enter` or `Cmd/Ctrl+Enter` | Issues, not while typing |
| Open ticket | `O` | Issues, not while typing |
| Refresh issues | `R` | Issues, not while typing |
| Search issues | `/` | Issues, not while typing |
| Close Issues | `Esc` | Issues |
| Close Schedules | `Esc` | Schedules |
| Close Agents | `Esc` | Agents |
| Close AI usage | `Esc` | AI usage |
| Search the commit graph | `Cmd/Ctrl+F` | Commit graph |
| Reload the commit graph | `Cmd/Ctrl+R` | Commit graph |
| Go to HEAD | `Cmd/Ctrl+H` | Commit graph |
| Toggle Settings sidebar | `Cmd/Ctrl+B` | Settings, not while typing |
| Pin or unpin command | `Alt+P` | Command palette |

## Window And Help

| Action | Keys | Where |
| --- | --- | --- |
| Open shortcut guide | `Cmd/Ctrl+/` | Not while typing |
| Zoom in | `Cmd/Ctrl+Plus` | Anywhere |
| Zoom out | `Cmd/Ctrl+-` | Anywhere |
| Reset zoom | `Cmd/Ctrl+0` | Anywhere |
| Toggle developer tools | `F12` or `Cmd/Ctrl+Shift+I` | Anywhere |
| Quit Stave | `Cmd+Q` | macOS |

## Changing Shortcuts

The list is read-only. You can change:

- the letter after `Cmd/Ctrl+K` for each shell chord,
- the model slots behind `Alt+1..0`,
- the stage-comment and visual-comment keys,

all under **Settings → Keyboard & Commands**. Preset slots follow the preset order in
**Settings → Presets & Macros → Presets**.

## Related Docs

- [Command Palette](command-palette.md)
- [Integrated Terminal](integrated-terminal.md)
