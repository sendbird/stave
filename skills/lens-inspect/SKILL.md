---
name: lens-inspect
description: Use the Lens built-in browser to inspect a running web application. Trigger when the request involves previewing a page, taking screenshots, reading DOM, checking console errors, picking elements to locate source code, or comparing rendered output to a design spec.
compatible-tools: [claude, codex]
category: inspection
---

# Lens Inspect

Inspect and interact with a live web application through Stave's built-in browser panel.

## What is Lens?

Lens is a per-workspace embedded browser in the right rail panel. It renders pages via Electron's `WebContentsView` and exposes 10 MCP tools so AI agents can navigate, screenshot, read DOM, evaluate JavaScript, and interact with page elements programmatically.

## Opening Lens

1. Click the **Globe** icon in the right rail sidebar.
2. Or use the **Command Palette**: search for "Show Lens".
3. Enter a URL in the address bar and press Enter.
4. Select the target task first if you want the picker to append context directly into chat.

## MCP Tools

All tools require a `workspaceId` parameter.

| Tool | Purpose |
| --- | --- |
| `stave_lens_navigate` | Load a URL in the browser |
| `stave_lens_screenshot` | Capture viewport or full-page PNG |
| `stave_lens_get_html` | Get outerHTML of page or a selector |
| `stave_lens_get_text` | Get textContent of a selector |
| `stave_lens_evaluate` | Run JavaScript in page context |
| `stave_lens_get_console` | Read buffered console messages (up to 200) |
| `stave_lens_get_network` | Read buffered network requests (up to 200) |
| `stave_lens_click` | Click an element by CSS selector |
| `stave_lens_type` | Type text into a focused or specified element |
| `stave_lens_snapshot` | Get accessibility tree snapshot |

## Element Picker

The crosshair button in the address bar activates the element picker.

1. Hover over elements to highlight them with a blue overlay.
2. Click an element to capture its info.
3. Press Escape to cancel.

Captured data is inserted into the active task's prompt draft:
- CSS selector, tag, ID, classes
- Bounding box and computed styles
- Truncated outerHTML and textContent
- Source search hints (AI-friendly grep patterns)
- React `_debugSource` file:line (when enabled in Settings)

## Source Code Mapping

Configure in **Settings > Lens > Source Code Mapping**.

### Heuristic Search (default: on)

The AI uses distinctive class names, text content, IDs, and component-style class patterns from the picked element to search your codebase with grep or file-search tools. Works with any framework.

### React _debugSource (default: off)

When your application runs in React dev mode with `@babel/plugin-transform-react-jsx-source` (enabled by default in Vite React plugin, CRA, and Next.js dev), the picker extracts the exact `fileName:lineNumber` from React fiber internals. This gives 100% accurate source location when available, with automatic fallback to heuristic search.

## Figma Design Comparison Workflow

Combine Lens with a Figma MCP server for design-to-code verification:

```
1. figma-mcp: read design spec (colors, spacing, layout)
2. stave_lens_navigate("http://localhost:3000/page")
3. stave_lens_screenshot()
4. Compare rendered output to Figma spec
5. Modify code to fix discrepancies
6. Repeat from step 2
```

## Tips

- **Console/network logs** are ring-buffered at 200 entries each. Check them early if debugging.
- **Full-page screenshots** use CDP `Page.getLayoutMetrics` to capture beyond the viewport.
- **Accessibility snapshots** (`stave_lens_snapshot`) give a compact page structure summary — useful when full HTML is too verbose.
- **Element picker** works best on non-minified, dev-build pages where class names are meaningful.
- **Session persists** across panel switches. Switching to Explorer and back to Lens keeps your browsing state.
- Each workspace has an **isolated session** (separate cookies, storage, cache).

## Avoid

- Don't use `file://` or `chrome://` protocols — they are blocked for security.
- Don't rely on `_debugSource` in production builds — it's only available in dev mode.
- Don't screenshot without navigating first — `about:blank` yields an empty image.
