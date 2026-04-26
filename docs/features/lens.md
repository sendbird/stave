# Lens

## Summary

- Lens is Stave's built-in workspace browser in the right rail.
- It lets you preview a page, inspect DOM and runtime signals, and send element context directly into the active task draft.

## When To Use It

- Use Lens when an AI task needs to inspect a live page instead of reasoning from code alone.
- Use it for visual QA, DOM inspection, console and network debugging, and design-to-code verification loops.
- Use the normal editor and file search when you already know the source file and do not need runtime context.

## Before You Start

- Lens works in the Electron desktop runtime. Browser-only Vite mode does not expose the embedded view.
- Each workspace gets its own Lens browser session and storage partition.
- To send picked elements into chat, select an active task first.
- For exact React file and line mapping, enable `Settings > Lens > React _debugSource` and run the target app in a React dev build.
- External agents only reach Lens through Stave Local MCP, not through the renderer UI directly.

## Quick Start

1. Open the right rail and choose `Lens`.
2. Enter a URL such as `http://localhost:3000` or `https://example.com`.
3. Click the crosshair button to pick an element.
4. Return to the active task draft and refine the appended Lens context into an instruction.

## Interface Walkthrough

### Entry Points

- Right rail `Lens` tab
- Command Palette: `Show Lens Panel`
- Settings: `Lens` section for source mapping options

### Key Controls

- Address bar: loads local or remote pages into the current workspace session.
- Back, forward, reload: standard navigation for the current workspace browser.
- Pick Element: captures selector, styles, HTML, and source hints, then appends the result to the active task draft.
- Footer status: shows whether Lens is live, loading, or waiting for a page.
- Source mapping badges: show whether heuristic hints and React `_debugSource` extraction are enabled.

## Common Workflows

### Configure Source Mapping

1. Open `Settings > Lens`.
2. Leave `Heuristic Search` on unless you have a reason to suppress grep-friendly hints.
3. Turn on `React _debugSource` when your app runs in a React dev build and you want exact file and line output.

### Inspect A Page And Send A Fix Request

1. Open Lens in the same workspace as the code you want to change.
2. Navigate to the target page.
3. Click `Pick Element`, then click the broken component in the page.
4. Open the active task draft and add the actual instruction, such as what looks wrong or what should change.
5. Run the task so the agent can use the appended Lens context plus the codebase.

### Use Lens From An External Agent

1. Enable `Settings > Providers > Stave > Local MCP Server`.
2. Open Lens for the target workspace so the browser session exists.
3. Call the `stave_lens_*` tools through Local MCP.
4. Use the returned page data together with normal Stave task tools or your own external workflow.

## Files And Data

- Lens source-mapping preferences are stored in app settings:

```json
{
  "lensSourceMappingHeuristic": true,
  "lensSourceMappingReactDebugSource": false
}
```

- External tooling accesses Lens through the Local MCP tool family:

```json
{
  "toolPrefix": "stave_lens_",
  "examples": [
    "stave_lens_navigate",
    "stave_lens_screenshot",
    "stave_lens_get_html",
    "stave_lens_get_console"
  ]
}
```

## Limitations And Advanced Options

- Lens uses Electron's `WebContentsView` plus Stave's own CDP bridge. It does not embed the `chrome-devtools-mcp` server directly because Stave already owns the browser process and can talk to CDP natively without launching a separate Chrome target.
- External agents need Local MCP because the Lens browser lives inside the desktop app. Without MCP, only the current renderer UI can access it.
- `React _debugSource` only works in React dev builds. Production builds fall back to heuristic source hints.
- Console and network logs are buffered, not infinite. Lens keeps the most recent entries only.
- Lens console messages are mirrored into the Stave window DevTools console with a `[Lens:<workspaceId>]` prefix.
- Lens hides while blocking overlays such as Settings are open so the native `WebContentsView` does not render above dialogs.
- Lens is ideal for runtime inspection, but exact DOM-to-source mapping is still framework-dependent outside React dev mode.

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
- Cause: Lens has not been opened for that workspace yet.
- Fix: open the Lens panel in the matching workspace first, then retry the MCP call.

## Related Docs

- [Local MCP User Guide](local-mcp-user-guide.md)
- [Command Palette](command-palette.md)
- [Project Instructions](project-instructions.md)
