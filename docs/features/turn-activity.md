# Turn Activity

## Summary

Turn Activity shows the live work behind the current agent turn, including
running tools, child tasks, todos, and elapsed time. Choose a compact docked
shelf, a larger draggable card, or a full-height right-rail panel when you
need more room to follow a busy turn.

## When To Use It

- Use `Docked` for a quick status check while writing the next prompt.
- Use `Floating` when the activity list should stay visible over the chat.
- Use `Panel` when a long or data-heavy activity list needs the full right rail.

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
  and open that panel automatically.
- In `Floating`, drag the card header. The position is retained for the next
  session and is kept reachable if the window is resized.

## Common Workflows

### Follow a busy turn

1. Select `Panel` from the activity header.
2. Keep the right rail open while tools and child tasks update.
3. Return to `Docked` when you only need a compact status indicator.

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
