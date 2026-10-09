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
- The tools need no approval, including in read-only modes. Showing a page
  writes only to Stave's own page store, never to your repository; checking a
  page first writes nothing at all.

## Quick Start

1. Ask for a visual result, for example "Show this week's spend per provider as
   a bar chart."
2. The agent may first check its page: the trace shows a **Preview HTML page**
   step, and nothing appears yet.
3. The trace shows a **Show HTML page** step, and the page appears above the
   agent's reply.
4. Use the buttons in the page header to **View source**, **Save as HTML
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

### Checking A Page Before It Is Shown

An agent cannot see the page it writes, so it can check it first with the
`stave_preview_html` tool. Stave renders the page in a hidden window exactly as
the conversation would show it, with the same isolation, your **Network
access** option, and your current theme, and gives the agent:

- screenshots of up to 4,000 pixels of the page, top to bottom;
- the page's height and the height its frame will take in the conversation;
- console errors and warnings (with line numbers in the agent's HTML), requests
  that failed or that **Network access** blocked, and any attempt to navigate
  away.

Nothing appears in the conversation and nothing is saved; the trace shows only
a **Preview HTML page** step. The agent then fixes what it found and shows the
page.

- The hidden window uses its own temporary browsing session: no cookies or
  storage from Stave or Lens, and nothing kept after the preview. It refuses
  every navigation, new window, download, and permission request.
- A preview that does not finish within 15 seconds is stopped. At most two run
  at once.
- The agent picks light or dark; by default it gets the one on your screen. If
  it asks for the other one, it sees Stave's default theme for that appearance
  instead of yours.
- Until the app window has reported your **Network access** option at startup,
  previews load nothing from the network.

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
- Interactive views from third-party MCP servers are shown in their tool row;
  see [MCP App Views](#mcp-app-views).

## MCP App Views

A tool on an MCP server you connected to Codex or Claude can declare an
interactive view (the MCP Apps UI extension, spec `2026-01-26`): its metadata
names a `ui://` resource with the type `text/html;profile=mcp-app`, under
`_meta.ui.resourceUri` or the older `_meta["ui/resourceUri"]`. When such a tool
runs, Stave shows the view in that tool's row instead of the plain text result.
The row opens on its own; **Full screen** in the view's header lifts it over the
window.

**Settings → Chat → Inline HTML pages → Show MCP App views** turns this on or
off (on by default). Off shows those tools as plain text.

### Provider Support

| Provider | Support |
|---|---|
| Codex | Full. Stave declares the extension when it starts the Codex App Server, reads the view when the call completes, and relays the view's tool calls and resource reads to the same server and thread. |
| Claude | The view shows the call's input and result. Claude Code has no way for Stave to call the server's tools or read its other resources, so a Claude view's tool calls and resource reads are refused, and the view is told so when it starts. Needs a Claude Code version that reports tool UI metadata and resource reads to Stave. |
| Cursor, Kiro | Not supported; the tool row shows its text result. |

Stave's own Local MCP server declares no views, so every view comes from a
server you added.

### What A View Can Do

A view runs in the same isolated frame as an inline page, with stricter rules:

- **Network**: only the sites the view's server declares for it (separately
  for data requests, scripts and styles, embedded frames, and the base URL),
  up to 32 of each. Without a declaration, a view runs its own inline code and
  loads nothing else. The **Network access** option above does not apply to
  views.
- **Device access**: only what the server declares (camera, microphone,
  location, clipboard writing) is delegated to the frame, and Stave's window
  still declines camera, microphone, and location requests.
- **Tools**: a view can run a tool on its own server only when that tool lists
  `app` in its visibility. Stave asks you first unless the tool is marked
  read-only, and shows the arguments it will use.
- **Messages**: a view can propose a message for the conversation. Stave asks
  you first; a message you allow is sent as yours, or waits in the queue while
  the agent is working. A view never changes a turn that is running.
- **Context**: a view can leave a short note (up to 16 KB) about what you see in
  it. The agent receives the latest note from each view with your next message,
  labelled as untrusted data.
- **Links** open in your browser only right after you click in the view.

A view cannot send messages larger than 256 KB or have more than 16 requests
waiting at once.

### Files

- Views are captured when the call completes, because a resumed conversation
  may no longer carry the tool's metadata. They are stored under Stave's user
  data folder in `mcp-app-views/`, with the call's input and result, and are
  removed when the workspace is archived.
- A view is at most 5 MB. Stave waits up to 20 seconds for the server to return
  it; a view that is missing, of the wrong type, too large, or too slow leaves
  the row as plain text.
- Turning the setting on or off restarts the Codex App Server once its running
  turns finish, and the next Codex turn starts a new native thread, as an MCP
  configuration change does.

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
