# Conversation Reading

The composer follows the conversation reading size, including the Task panel cap. The minimal composer uses a proportional monospace size; its prompt glyph and caret scale with the first line. The resting editor keeps room for two lines.

Code fences with no language, or `text`, `plaintext`, `plain`, or `txt`, display without syntax colors. Copy controls remain available. Plain code uses the surrounding text color on the conversation surface, while syntax-highlighted code uses the editor palette. This preserves readability in custom themes with different editor and conversation surfaces.

## Tables, math, JSON and terminal output

These blocks of a reply render as more than text. Tables and code fences switch once their block has finished streaming; until then they show as written.

- **Tables** whose cells hold only text (bold and italic are fine) sort by column: select a header for ascending, again for descending, and a third time for the written order. Numbers sort by value, including `1,204`, `$12.50`, `42%` and `12 ms`; empty cells and `—` stay last. A table with more than 10 rows also gets a **Filter rows** field that keeps the rows containing every word typed. A table with a link, inline code, an image or math keeps its written order.
- **Math** written as `$…$` inside a line, a `$$` block, or a `math` code fence is typeset. A dollar sign is math only when it reads as math, so `$5 and $10` and `$HOME/$USER` stay text. A formula block has **Show code** for its TeX source.
- **JSON** in a `json` code fence, or in a fence with no language whose body is a JSON object or array, shows as a tree that folds. Small documents open fully; large ones open near the top and show 100 entries per object or array before a **Show … more** button. **Show code** switches to the highlighted text, and **Copy** copies the JSON as written. JSON that does not parse, or a block over 200 KB, stays a code block.
- **Data views** in a `stave-view` fence, or shown with the `stave_show_view` tool, draw as a native table, chart, stat tiles, timeline or heatmap; see [Data views](structured-views.md).
- **Terminal output** in an `ansi`, `console`, `terminal` or `output` fence, or any fence holding ANSI color escapes, shows its colors in the conversation's palette for the current theme. **Copy** copies the text without the escape codes.

## Conversation width

The task chat and Tars share one width for their messages and their message box. Choose **Narrow**, **Default** or **Wide** in **Settings > Chat > Layout > Conversation width**. The width steps up with the conversation area's own width, so opening a side panel or pinning the Tars tray can move it down a step:

| Conversation area | Narrow | Default | Wide |
| --- | --- | --- | --- |
| Narrower than 1024px | 704px | 768px | 896px |
| 1024px to 1439px | 736px | 832px | 1024px |
| 1440px and wider | 768px | 896px | 1152px |

An area narrower than its step uses its full width, less its margins.

Everything in a reply ends on the message column's edges: code blocks scroll sideways inside it, long links and unbroken words wrap, and cards, lists and quotes stay inside it. A table whose columns need more room than the column grows past it on both sides equally, up to 128px wider than the column and never past the conversation's margins; a table that fits keeps the column's edges.
