# Lens

## Summary

- Lens is Stave's built-in workspace browser in the right rail.
- It lets you preview a page, inspect DOM and runtime signals, save page artifacts, and send element or visual-comment context directly into the active task draft.

## When To Use It

- Use Lens when an AI task needs to inspect a live page instead of reasoning from code alone.
- Use it for visual QA, DOM inspection, console and network debugging, and design-to-code verification loops.
- Use the normal editor and file search when you already know the source file and do not need runtime context.

## Before You Start

- Lens works in the Electron desktop runtime. Browser-only Vite mode does not expose the embedded view.
- Each workspace gets its own Lens browser session and storage partition.
- To send picked elements into chat, select an active task first.
- For exact React file and line mapping, enable `Settings > Lens > React _debugSource` and run the target app in a React dev build.
- CDP-backed actions such as screenshots, JavaScript evaluation, element clicks, and live style edits require `Settings > Lens > Developer Mode` plus per-host approval. Approved hosts are currently global across workspaces.
- External agents reach Lens through Stave Local MCP, not through the renderer UI directly. They can open a hidden Lens browser session with `stave_lens_open_session` before inspecting a page.

## Quick Start

1. Open the right rail and choose `Lens`, or press `Cmd/Ctrl+K`, then `L`.
2. Enter a URL such as `http://localhost:3000` or `https://example.com`.
3. Pick an element, add visual comments with `Annotate`, save a screenshot, or download page assets.
4. Send the captured Lens context into the active task draft and refine it into an instruction.

## Interface Walkthrough

### Entry Points

- Right rail `Lens` tab
- Command Palette: `Show Lens Panel`
- Keyboard: `Cmd/Ctrl+K`, then `L`
- Settings: `Lens` section for source mapping options

### Key Controls

- Address bar: loads local or remote pages into the current workspace session.
- Back, forward, reload: standard navigation for the current workspace browser.
- Pick Element: captures selector, styles, HTML, and source hints, then appends the result to the active task draft.
- Annotate: places numbered visual comments on elements or selected areas, then sends the comments to the active task draft.
- Style: live-edits supported element styles from an annotation and records before/after diffs in the sent payload.
- Screenshot: saves viewport or full-page PNG captures under the workspace Lens downloads directory.
- Downloads: lists recent Lens downloads and can download page image, stylesheet, and script assets.
- Console and Network: inspect recent page console output and network requests directly from the Lens panel.
- Fullscreen: expands Lens over the Stave window while keeping the Lens toolbar, status, and browser session active. Use the same toolbar button or `Escape` to exit.
- Footer status: shows whether Lens is live, loading, or waiting for a page.
- Source mapping badges: show whether heuristic hints and React `_debugSource` extraction are enabled.

## Common Workflows

### Configure Source Mapping

1. Open `Settings > Lens`.
2. Leave `Heuristic Search` on unless you have a reason to suppress grep-friendly hints.
3. Turn on `React _debugSource` when your app runs in a React dev build and you want exact file and line output.

### Configure Site Access And CDP

1. Open `Settings > Lens`.
2. Use `Site Access` to set newline-delimited allowed and blocked hosts. Blocked hosts win over allowed hosts. Loopback targets are always allowed for navigation.
3. Use `Developer Mode` to enable or disable CDP-backed Lens actions and remove approved CDP hosts.
4. When Lens asks for CDP access, approve only hosts you expect agents to inspect or control.

### Inspect A Page And Send A Fix Request

1. Open Lens in the same workspace as the code you want to change.
2. Navigate to the target page.
3. Click `Pick Element`, then click the broken component in the page.
4. Open the active task draft and add the actual instruction, such as what looks wrong or what should change.
5. Run the task so the agent can use the appended Lens context plus the codebase.

### Add Visual Comments

1. Open Lens and navigate to the target page.
2. Turn on `Annotate`.
3. Add comments to elements or page areas.
4. Optionally use the style editor on an element comment to record live before/after style edits.
5. Click `Send` in the comment list to append the formatted visual comments to the active task draft.

### Save Screenshots And Downloads

- Use the Screenshot menu to save viewport or full-page PNG captures.
- Use the Downloads menu to inspect recent saved files or download page assets.
- Saved files live under Stave's app data directory in `lens-downloads/<workspace-id>/`. Closing the Lens panel does not delete them.

### Use Lens From An External Agent

1. Enable `Settings > Providers > Stave > Local MCP Server`.
2. Call `stave_lens_open_session` for the target workspace, optionally with a URL.
3. Call the other `stave_lens_*` tools through Local MCP.
4. Close MCP-managed sessions with `stave_lens_close_session` when you no longer need them.
5. Use the returned page data together with normal Stave task tools or your own external workflow.

## Files And Data

- Lens source-mapping preferences are stored in app settings:

```json
{
  "lensSourceMappingHeuristic": true,
  "lensSourceMappingReactDebugSource": false,
  "lensAllowedHosts": [],
  "lensBlockedHosts": [],
  "lensDeveloperModeCdp": true,
  "lensCdpApprovedHosts": []
}
```

- External tooling accesses Lens through the Local MCP tool family:

```json
{
  "toolPrefix": "stave_lens_",
  "examples": [
    "stave_lens_open_session",
    "stave_lens_navigate",
    "stave_lens_close_session",
    "stave_lens_screenshot",
    "stave_lens_download",
    "stave_lens_list_downloads",
    "stave_lens_get_html",
    "stave_lens_get_console",
    "stave_lens_get_annotations",
    "stave_lens_set_style"
  ]
}
```

## Limitations And Advanced Options

- Lens uses Electron's `WebContentsView` plus Stave's own CDP bridge. It does not embed the `chrome-devtools-mcp` server directly because Stave already owns the browser process and can talk to CDP natively without launching a separate Chrome target.
- External agents need Local MCP because the Lens browser lives inside the desktop app. Without MCP, only the current renderer UI can access it.
- `stave_lens_open_session` creates a hidden browser view for MCP inspection. If the user later opens the Lens panel for that workspace, the UI reuses the same session and becomes its owner.
- `React _debugSource` only works in React dev builds. Production builds fall back to heuristic source hints.
- Console and network logs are buffered, not infinite. Lens keeps the most recent entries only.
- Download history is buffered in memory, while saved files remain on disk until the user removes them.
- Lens console messages are shown in the Lens Console tab and mirrored into the Stave window DevTools console with a `[Lens:<workspaceId>]` prefix.
- Annotation events use a per-session nonce and are filtered out of the user-visible Lens console log.
- Lens hides while blocking overlays such as Settings are open so the native `WebContentsView` does not render above dialogs.
- Lens is ideal for runtime inspection, but exact DOM-to-source mapping is still framework-dependent outside React dev mode.

### CDP actions fail with a Developer Mode message

- Symptom: screenshots, page HTML reads, evaluation, clicks, or style edits fail before running.
- Cause: CDP is disabled or the current host has not been approved.
- Fix: enable `Settings > Lens > Developer Mode`, open Lens for that workspace, and approve the host when prompted.

## Troubleshooting

### Lens shows an empty area in browser mode

- Symptom: the panel opens but the embedded page never appears.
- Cause: Lens is only available in the Electron desktop runtime.
- Fix: run `bun run dev:desktop` or use a packaged desktop build.

### Pick Element does not append anything

- Symptom: the picker runs, but chat stays unchanged.
- Cause: there is no active task, or the selection was cancelled with `Escape`.
- Fix: select a task first, then run the picker again.

### React file and line hints are missing

- Symptom: Lens only provides selector and grep hints.
- Cause: the target page is not running with React `_debugSource` metadata.
- Fix: enable `Settings > Lens > React _debugSource` and run the target app in a React dev build.

### Local MCP cannot call Lens tools

- Symptom: `stave_lens_*` tools report that no browser session exists.
- Cause: a Lens browser session has not been opened for that workspace yet.
- Fix: call `stave_lens_open_session` for the matching workspace, or open the Lens panel manually, then retry the MCP call.

## Related Docs

- [Local MCP User Guide](local-mcp-user-guide.md)
- [Command Palette](command-palette.md)
- [Project Instructions](project-instructions.md)
