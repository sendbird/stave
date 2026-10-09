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

Scrolling with the mouse wheel or trackpad over a page works like scrolling
the conversation: if the page itself cannot scroll, the conversation does, and
it stops following new text until you scroll back to the bottom.

### Sending A Message From A Page

A page can offer buttons such as "Explain this spike" or "Apply this layout".
When you click one, Stave asks before anything is sent:

- The **Send this message?** dialog shows the page's title and the exact text
  the page wants to send as you. Choose **Send message** to send it, or
  **Don't send** (or press `Esc`) to drop it.
- A sent message is your own message in this task's conversation. If the agent
  is still working, the message waits in the queue and goes out when the
  current turn ends; it never interrupts or redirects the running turn.
- A page can ask only right after you click or type in it, only one request
  waits for your answer at a time, and a message is at most 4,000 characters.

### Sharing Page State With The Agent

A page can also tell the agent what you did in it, for example which bar of a
chart you selected, so that your next message can say "explain this one".

- No dialog appears. The page's latest report replaces its previous one, and
  goes to the agent with your next message in this task.
- The agent receives it clearly marked as data written by the page, not as
  instructions from you, and is told not to follow instructions in it.
- A page that has shared state shows **Shared with agent** in its header.
  Click it to clear what the page shared; the agent then no longer receives
  it. A page that shares new state shows the label again.
- Each page can share at most 16 KB.

### Many Pages In One Conversation

Each page runs like a small web page of its own, so Stave keeps only the pages
near the part of the conversation you are looking at running, and at most six
at once. A page that scrolls far out of view is unloaded and keeps its place;
when you scroll back it loads again from the start, so anything you changed in
it is reset. If more than six pages are close together, the ones you used
least recently show **Paused while other pages are open** with a **Show page**
button. An expanded page always keeps running.

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
- A page reaches the conversation in only two ways: a message that is sent
  only after you confirm its exact text, and page state that the agent receives
  marked as untrusted page data. Neither can approve a request, answer a
  question, or interrupt the agent.

**Allow all** lets a page send whatever it contains to any site. A page only
holds what the agent put in it, but if the agent works with material you would
not want sent anywhere, choose **Common CDNs only** or **Block all**.

## Files And Data

- Pages are stored on this computer under Stave's user data folder, in
  `inline-renders/`. The conversation keeps a reference to the page, not a copy.
- State a page shared with the agent is stored next to the page, so it stays
  shared after you restart Stave until you clear it.
- Archiving a workspace removes its pages and their shared state along with
  its conversation.
- A page is at most 512,000 characters of HTML.

## Limitations And Advanced Options

- Shared page state goes with messages you send in the conversation, including
  queued ones. Turns Stave starts on its own, such as agent run stages and
  scheduled check-ins, do not include it.
- A page that loads again (after scrolling far away, being paused, or a change
  to **Network access**) starts from the beginning; what it shared before
  stays shared until it reports again or you clear it.
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

### A page button does nothing

- Symptom: clicking a button that should send a message shows no dialog.
- Cause: another page's message is already waiting for your answer, or the
  page asked without a click (for example from a timer).
- Fix: answer the open dialog first. If it still does nothing, ask the agent to
  call `window.stave.sendMessage` from the button's click handler.

## Related Docs

- [Local MCP](local-mcp-user-guide.md)
- [Lens](lens.md)
- [Turn Activity](turn-activity.md)
