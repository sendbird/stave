# Inline HTML Pages

## Summary

An agent can show a chart, table, diagram, comparison, or UI mockup directly in
the conversation instead of describing it in text. The agent writes an HTML
page and calls the `stave_render_html` tool; Stave shows the page in the
assistant's reply, in a frame that follows your theme and sizes itself to its
content.

## When To Use It

- Ask for a result you would rather see than read: "chart the token usage by
  provider", "show the two layouts side by side", "draw the request flow".
- Review a UI idea before anyone writes product code.
- Keep a visual result in the conversation history, where you can reopen,
  inspect, or save it later.

Use [Lens](lens.md) instead when you want to check a real web app or a running
dev server. Inline pages are results the agent produced, not sites to browse.

## Before You Start

- Inline pages work in every provider that runs inside Stave: Claude, Codex,
  Cursor, and Kiro. The tool comes from Stave's built-in Local MCP server, so
  [Local MCP](local-mcp-user-guide.md) must be on (it is by default).
- The tool needs no approval, including in read-only modes. It writes only to
  Stave's own page store, never to your repository.

## Quick Start

1. Ask for a visual result, for example "Show this week's spend per provider as
   a bar chart."
2. The trace shows a **Show HTML page** step, and the page appears above the
   agent's reply.
3. Use the buttons in the page header to **View source**, **Save as HTML
   file**, or **Expand** the page.

## Interface Walkthrough

### The Page Block

- **Title**: the name the agent gave the page.
- **View source**: shows the page's HTML exactly as the agent wrote it, with a
  **Copy** button.
- **Save as HTML file**: saves that same HTML to a file you choose.
- **Expand**: lifts the page over the window so it has room. The page keeps its
  state (a filter you set, a tab you opened). Press `Esc` or choose **Collapse**
  to return.

The page grows to fit its content, up to 2,000 pixels tall; beyond that it
scrolls inside its frame. Changing between light and dark mode, or switching
themes, restyles open pages without reloading them.

Links inside a page open in your default browser, and only when you click
them. A page cannot show alerts or open windows.

### Network Access

**Settings → Chat → Inline HTML pages → Network access** decides what a page
may load from the internet:

| Option | What a page can do |
|---|---|
| **Allow all** (default) | Load libraries and data from any site, and send data to any site. |
| **Common CDNs only** | Load scripts, styles, and fonts from jsDelivr, unpkg, cdnjs, esm.sh, and Google Fonts. Every other request is blocked. |
| **Block all** | Make no network request at all. The agent has to put its libraries and data in the page itself. |

Changing the option reloads pages already shown, so they follow it at once.

## How A Page Is Isolated

Agent-written HTML is treated as untrusted:

- Each page is served from its own address, separate from the Stave app.
- The frame runs scripts but with no access to Stave, its stored data, your
  files, or the rest of the conversation. The page cannot read the window
  around it.
- A page cannot navigate its own frame, submit a form to another address, or
  load another page under a wider network setting.

**Allow all** lets a page send whatever it contains to any site. A page only
holds what the agent put in it, but if the agent works with material you would
not want sent anywhere, choose **Common CDNs only** or **Block all**.

## Files And Data

- Pages are stored on this computer under Stave's user data folder, in
  `inline-renders/`. The conversation keeps a reference to the page, not a copy.
- Archiving a workspace removes its pages along with its conversation.
- A page is at most 512,000 characters of HTML.

## Limitations And Advanced Options

- A page shows results; it cannot send anything back to the agent yet. To act
  on what you see, reply in the conversation.
- Pages render in the desktop app. The browser-only development preview builds
  them from the conversation instead.
- Interface views offered by third-party MCP servers are not shown inline yet.

## Troubleshooting

### The page says it is no longer available

- Symptom: the block shows "This page is no longer available."
- Cause: the page file was removed, for example by clearing Stave's user data
  folder.
- Fix: ask the agent to show the page again.

### A chart library does not load

- Symptom: the page is blank or shows only text.
- Cause: **Network access** is **Block all**, or **Common CDNs only** and the
  library comes from another host.
- Fix: allow the host in **Network access**, or ask the agent to inline the
  library or draw the chart with plain SVG.

## Related Docs

- [Local MCP](local-mcp-user-guide.md)
- [Lens](lens.md)
- [Turn Activity](turn-activity.md)
