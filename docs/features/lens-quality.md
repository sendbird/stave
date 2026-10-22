# Lens quality criteria

Lens should let a developer move from a running page to an actionable change
without losing their place, sign-in, draft or selected element. Quality is
measured by completed workflows rather than the number of controls.

## Release criteria

| Workflow | Required behavior | Verification |
| --- | --- | --- |
| Open and recover | Keep the tab after a crash; bound automatic retries; let Reload retry explicitly | Native guest crash/rebuild test |
| Navigate | Preserve history; Stop interrupts loading | Renderer/preload/main contract and native page checks |
| Sign in | Preserve popup opener, blank-window initialization and POST body; enforce site access | Native popup messaging and form submission test |
| Debug | Open the selected guest's developer tools without opening shell tools | Native guest DevTools test |
| Select | Coalesce hover updates; refresh on scroll/resize; select the actual click target; Alt selects a parent | Pointer unit tests and native selection test |
| Explain a selection | Send bounded DOM/style/accessibility context; read optional component/source metadata; preserve text if image capture fails | Normalization tests and native metadata test |
| Review visually | Maintain multiple comments and page evidence without losing annotations when switching modes | Annotation lifecycle and attachment tests |
| Fit the workspace | Keep navigation usable in narrow panes; use existing theme tokens | Narrow native window screenshot and theme contract tests |
| Respect browser intent | Disable the shared browser tool plugin outside allowed turns; preserve user plugin settings | Provider configuration tests |

## Simplicity decisions

- Keep navigation separate from page tools so the address remains usable in a
  narrow pane.
- Keep selection, visual comments and developer tools directly reachable.
- Group spacing measurement, screenshots, assets and recent downloads under
  one secondary menu.
- Retain compact Console/Network views for agent context. Use native developer
  tools for full debugging instead of building a second full debugger.
- Share pointer scheduling across overlays. Do not animate geometry behind the
  cursor or add an IPC round trip for each pointer movement.
- Keep annotation controls isolated from page scripts; enrich optional
  development metadata separately and treat it as untrusted evidence.

## Explicit limits

- Visual feedback drafts let users edit requests and remove unchecked comments
  before sending. Intent and priority are secondary options in the page overlay.
- Pause agent access blocks new Lens MCP calls and invalidates pending command
  leases in main. Resuming does not revive an older lease. User-owned Lens IPC
  remains usable; already dispatched page JavaScript or network requests cannot
  be undone by pausing.
- Expanded browser tool details show the latest session capture, not a replay
  of that historical call. Captures are memory-only, limited to eight images of
  at most 256 KB each, and do not continuously stream the page.
- Sent feedback can compare its original image with a fresh target capture.
  Comparison requires the recorded viewport and a unique visible target; missing
  or ambiguous targets require reselection. Users must confirm target identity
  and decide themselves: **Confirm fixed** or **Needs re-check** saves a Lens
  review record with the task (the comparison, verdict, page address, viewport
  and time). Records survive navigation and restarts. A confirmation stands only
  while the Lens session shows the page document it was captured from, at the
  address it was captured at, query and fragment included; after a navigation,
  reload, an in-page move to another address, query or hash route, or a restart
  the record reads **Needs re-check** and keeps when it was confirmed. A task
  keeps its 20 newest records; closing the task's workspace deletes them with
  their captures.
- The captured page address shown and stored excludes query parameters and
  fragments; the record keeps only a hash of the full address to tell pages
  apart. Matching its address or selector alone never establishes that the
  issue is resolved.

- Source file and line information depends on metadata supplied by the page;
  production builds may provide none.
- Shadow roots and cross-origin frames remain selection boundaries until
  capture and action selectors can identify those targets end to end.
- Provider browser plugins are owned by their provider application. A local
  launcher repair does not establish compatibility on every installation.
- External interaction references require permitted live inspection. A public
  marketing page alone is not evidence of pointer latency or selection quality.

The native regression suite is
`tests/e2e-electron/lens-browser-controls.electron.e2e.ts`.
