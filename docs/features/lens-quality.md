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
