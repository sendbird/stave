# Conversation Reading

The composer follows the conversation reading size, including the Task panel cap. The minimal composer uses a proportional monospace size; its prompt glyph and caret scale with the first line. The resting editor keeps room for two lines.

Code fences with no language, or `text`, `plaintext`, `plain`, or `txt`, display without syntax colors. Copy controls remain available. Plain code uses the surrounding text color on the conversation surface, while syntax-highlighted code uses the editor palette. This preserves readability in custom themes with different editor and conversation surfaces.

## Conversation width

The task chat and Tars share one width for their messages and their message box. Choose **Narrow**, **Default** or **Wide** in **Settings > Chat > Layout > Conversation width**. The width steps up with the conversation area's own width, so opening a side panel or pinning the Tars tray can move it down a step:

| Conversation area | Narrow | Default | Wide |
| --- | --- | --- | --- |
| Narrower than 1024px | 704px | 768px | 896px |
| 1024px to 1439px | 736px | 832px | 1024px |
| 1440px and wider | 768px | 896px | 1152px |

An area narrower than its step uses its full width, less its margins.

Everything in a reply ends on the message column's edges: code blocks scroll sideways inside it, long links and unbroken words wrap, and cards, lists and quotes stay inside it. A table whose columns need more room than the column grows past it on both sides equally, up to 128px wider than the column and never past the conversation's margins; a table that fits keeps the column's edges.
