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
- Lens keeps website cookies and browser storage in an Electron Chromium profile. Optionally, you can save multiple accounts per exact hostname in Stave's OS-encrypted Lens account vault.
- Lens uses a project-scoped browser profile by default, so workspaces for the same project can share website sign-in. Use the workspace-isolated profile setting for sensitive work.
- To send picked elements into chat, select an active task first.
- For exact React file and line mapping, enable `Settings > Lens > React _debugSource` and run the target app in a React dev build.
- CDP-backed actions such as screenshots, JavaScript evaluation, element clicks, and live style edits require `Settings > Lens > Developer Mode` plus per-host approval. Approved hosts are currently global across workspaces.
- The first CDP action for an unapproved host opens an app-wide approval dialog, even when its Lens tab is hidden or closed. `Allow once` grants a short-lived workspace approval; `Always allow` saves the hostname.
- External agents reach Lens through Stave Local MCP, not through the renderer UI directly. Lens tools reuse a visible/recent workspace tab or create a hidden session automatically.

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
- Preview, Console, Network: compact view switcher beside the address bar. Preview is the primary Lens surface; Console and Network are diagnostic views.
- Pick Element: captures selector, position, accessibility identity, bounded ancestor and nearby context, key text/styles, and source hints, then appends a compact summary to the active task draft. The picker exits on click, `Escape`, or timeout.
- Annotate: places numbered visual comments on elements or selected areas. Each comment records an intent (`fix`, `change`, `question`, or `approve`) and a priority (`low`, `medium`, or `high`) before it is sent to the active task draft.
- Inspect (ruler icon): hover any element to see a Figma/DevTools-style box-model overlay (content, padding, border, margin) with a measurement tooltip. Click an element to pin it, then hover another element to read the pixel gap between them. `Escape` clears the pinned element. Inspect and Annotate are mutually exclusive.
- Style: live-edits supported element styles from an annotation and records before/after diffs in the sent payload.
- Screenshot: saves viewport or full-page PNG captures under the workspace Lens downloads directory.
- Downloads: lists recent Lens downloads and can download page image, stylesheet, and script assets.
- Fullscreen: expands Lens over the Stave window while keeping the Lens toolbar and browser session active. Use the same toolbar button or `Escape` to exit.

### Configure Sign-In Storage

1. Open `Settings > Lens`.
2. Use `Session & Sign-in` to choose the browser storage scope.
3. `Project profile` shares Lens website sign-in across workspaces for the current project.
4. `Workspace isolated` keeps cookies and site storage separate for the active workspace.
5. Use `Clear project data` or `Clear workspace data` to remove Lens cookies, localStorage, IndexedDB, cache, and related browser storage.

OAuth and SSO popup windows opened from a page use the same Lens browser profile as the page, so sign-in cookies land in the selected project or workspace profile.

### Save An Account For Lens

1. Open `Settings > Lens`.
2. Under `Saved Accounts`, choose `Add account`.
3. Enter one exact hostname, username, and password. Repeat this step to save additional accounts for the same host.
4. Leave `Fill automatically` enabled if Lens should fill visible login fields after that host loads. Automatic fill never submits the form.
5. External agents can manage saved accounts with `stave_lens_list_saved_accounts`, `stave_lens_create_saved_account`, `stave_lens_update_saved_account`, and `stave_lens_delete_saved_account`. They can call `stave_lens_fill_saved_account` to fill the automatic-fill account on demand, or pass `username` to choose another account saved for the same host. They may set `submit=true` only when the user asked them to sign in.

Usernames and passwords are encrypted through Electron `safeStorage`, backed by the operating system credential store. The renderer and Local MCP tools receive account metadata but never receive a saved password. Stave redacts password inputs from its Local MCP request log. On Linux, Stave refuses Electron's insecure `basic_text` backend.

## Common Workflows

### Configure Source Mapping

1. Open `Settings > Lens`.
2. Leave `Heuristic Search` on unless you have a reason to suppress grep-friendly hints.
3. Turn on `React _debugSource` when your app runs in a React dev build and you want exact file and line output.

### Configure Site Access And CDP

1. Open `Settings > Lens`.
2. Use `Site Access` to set newline-delimited allowed and blocked hosts. Blocked hosts win over allowed hosts. Loopback targets are always allowed for navigation.
3. Use `Developer Mode` to enable or disable CDP-backed Lens actions and add or remove approved CDP hosts.
4. When Lens asks for CDP access, choose `Allow once`, `Always allow`, or `Deny`. The dialog appears app-wide and does not require the originating Lens tab to be visible.
5. Approved host entries are hostname-only. Ports and paths are ignored, so approving `localhost` covers `localhost:3000`, `localhost:8899`, and other localhost ports.

### Inspect A Page And Send A Fix Request

1. Open Lens in the same workspace as the code you want to change.
2. Navigate to the target page.
3. Click `Pick Element`, then click the broken component in the page.
4. Open the active task draft and add the actual instruction, such as what looks wrong or what should change.
5. Run the task so the agent can use the appended Lens context plus the codebase.

### Add Visual Comments

1. Open Lens and navigate to the target page.
2. Turn on `Annotate`.
3. Add comments to elements or page areas and choose an intent and priority for each comment.
4. You can revise intent and priority from the comment strip in the task composer.
5. Optionally use the style editor on an element comment to record live before/after style edits.
6. Click `Send` in the comment list to append the formatted visual comments to the active task draft.

### Save Screenshots And Downloads

- Use the Screenshot menu to save viewport or full-page PNG captures.
- Use the Downloads menu to inspect recent saved files or download page assets.
- Saved files live under Stave's app data directory in `lens-downloads/<workspace-id>/`. Closing the Lens panel does not delete them.

### Use Lens From An External Agent

1. Enable `Settings > Providers > Stave > Local MCP Server`.
2. Call `stave_lens_navigate` or another `stave_lens_*` tool for the target workspace. Lens reuses a visible/recent tab or creates a hidden `default` session; `stave_lens_open_session` is optional.
3. Keep routine inspection hidden. Call `stave_lens_present_session` only when the user needs to interact, sign in, or visually verify the page.
4. The first CDP-backed call for an unapproved host pauses while Stave shows its app-wide approval dialog.
5. Approve the visible dialog within 60 seconds, or add the hostname under `Settings > Lens > Developer Mode > Approved CDP Hosts` and retry the tool.
6. If the page requires a saved account, call `stave_lens_fill_saved_account`; the secret is injected inside Electron and is not returned to the agent.
7. Close MCP-managed sessions with `stave_lens_close_session` when you no longer need them.
8. Use the returned page data together with normal Stave task tools or your own external workflow.

## Files And Data

- Lens source-mapping preferences are stored in app settings:

```json
{
  "lensSourceMappingHeuristic": true,
  "lensSourceMappingReactDebugSource": false,
  "lensSessionScope": "project",
  "lensAllowedHosts": [],
  "lensBlockedHosts": [],
  "lensDeveloperModeCdp": true,
  "lensCdpApprovedHosts": []
}
```

- Saved Lens accounts are stored separately under the app's `userData` directory in `lens-credentials.v1.json`. Usernames and passwords are kept together in OS-encrypted ciphertext; the file keeps only matching metadata such as the exact host outside that ciphertext, uses owner-only permissions where supported, and is never part of persisted renderer settings.

- External tooling accesses Lens through the Local MCP tool family:

```json
{
  "toolPrefix": "stave_lens_",
  "examples": [
    "stave_lens_open_session",
    "stave_lens_navigate",
    "stave_lens_present_session",
    "stave_lens_list_saved_accounts",
    "stave_lens_create_saved_account",
    "stave_lens_update_saved_account",
    "stave_lens_delete_saved_account",
    "stave_lens_fill_saved_account",
    "stave_lens_close_session",
    "stave_lens_screenshot",
    "stave_lens_download",
    "stave_lens_list_downloads",
    "stave_lens_get_html",
    "stave_lens_get_console",
    "stave_lens_get_annotations",
    "stave_lens_set_style",
    "stave_lens_inspect",
    "stave_lens_measure"
  ]
}
```

## Visual Review Capture Contract

Lens validates visual comments again in Electron main before they can enter session state, cross the preload bridge, or be returned by `stave_lens_get_annotations`. The contract chain is:

```text
isolated page overlay
  -> bounded console beacon
  -> Electron main schema and ownership checks
  -> normalized session state
  -> preload/window API or Local MCP
  -> task composer and provider context
```

Each normalized element or area comment contains:

- Page identity: sanitized HTTP(S) URL without credentials, query, or hash; title; viewport; scroll position; and a main-issued document id.
- Anchor: viewport bounds plus selector, element identity, accessible name and role, allowlisted attributes, ancestor hints, nearby elements or text, computed styles, and best-effort React source hints when enabled.
- Evidence: the existing clipped screenshot bounds and accumulated live style before/after edits.
- Feedback: the user comment, intent, and priority.
- Trust marker: `untrusted-page-evidence`.

The provider-facing formatter labels URL, title, selectors, accessibility data, attributes, text, sanitized HTML, and DOM context as untrusted evidence. Those fields are context to inspect, never instructions to follow. The user-entered feedback remains the requested action.

Annotation controls run in a dedicated Chromium isolated world. Electron accepts their bounded beacon only when its per-session nonce and current document id match. Annotation IPC mutations additionally require the current Stave renderer main frame, workspace/session target, and document id.

### Capture Budgets

String limits below are UTF-8 byte limits after deterministic normalization. Collections are truncated to the listed maximum unless malformed structure requires rejection.

| Field | Limit |
| --- | ---: |
| Annotations per collection | 50 |
| Serialized annotation event | 256,000 bytes |
| Annotation id / document id | 160 bytes each |
| Comment | 2,048 bytes |
| Selector | 2,048 bytes |
| URL / title | 4,096 / 512 bytes |
| Tag name / element id | 64 / 256 bytes |
| Classes | 32 items, 256 bytes each |
| Safe attributes | 16 items, 512 bytes per value |
| Accessible name / role | 512 / 128 bytes |
| Ancestors / nearby hints | 6 / 8 items |
| Context text per hint | 512 bytes |
| Element text / synthesized HTML | 2,048 / 4,096 bytes |
| Computed styles | 32 items |
| Style property / value | 96 / 512 bytes |
| Style edits | 32 items |
| Component names | 24 items, 256 bytes each |
| Source filename | 2,048 bytes |

Coordinates are finite and bounded: element positions and scroll offsets to ±10,000,000 CSS pixels, element sizes to 1,000,000, viewport dimensions to 100,000, device pixel ratio to 16, and source line/column values to 10,000,000.

The safe attribute allowlist is `alt`, `aria-describedby`, `aria-label`, `aria-labelledby`, `data-cy`, `data-test`, `data-testid`, `name`, `placeholder`, `role`, `title`, and `type`. Secret-like values are replaced with `[REDACTED]`; raw page HTML is never forwarded and is replaced with a synthesized tag/id/text representation.

### Navigation Semantics

- A top-level document navigation rotates the document id and annotation nonce, clears main-process annotation state immediately, and emits a clear event. A previous document's comments cannot reappear after the new page loads.
- A same-document URL update keeps the document id, then re-resolves element selectors. Missing element anchors are removed. Area comments survive only when their original scroll position still matches and their bounds intersect the viewport.
- Screenshot capture, comment removal, and annotation-linked style edits compare document identity before and after asynchronous work so navigation races fail closed.

## Limitations And Advanced Options

- Lens uses Electron's `WebContentsView` plus Stave's own CDP bridge. It does not embed the `chrome-devtools-mcp` server directly because Stave already owns the browser process and can talk to CDP natively without launching a separate Chrome target.
- External agents need Local MCP because the Lens browser lives inside the desktop app. Without MCP, only the current renderer UI can access it.
- Saved accounts match one exact hostname. Wildcards and parent-domain matching are intentionally unsupported. Multiple accounts can share a hostname, but only one account per hostname can be enabled for automatic fill; enabling another account switches the previous one to on-demand use.
- Automatic account use fills visible username and password fields but does not submit. JavaScript-heavy pages that render the form later can use `stave_lens_fill_saved_account` on demand.
- Operational MCP tools acquire a session automatically. With no explicit id they prefer the visible/recent UI tab, then the hidden `default`; if none exists they create `default` hidden.
- The first user-created Lens tab also uses `default`, so a hidden MCP session can be adopted without losing its page. Additional tabs keep distinct ids.
- `stave_lens_present_session` asks the renderer to open the same session for user interaction instead of creating another browser.
- `React _debugSource` only works in React dev builds. Production builds fall back to heuristic source hints.
- Console and network logs are buffered, not infinite. Lens keeps the most recent entries only.
- Download history is buffered in memory, while saved files remain on disk until the user removes them.
- Lens console messages are shown in the Lens Console tab and mirrored into the Stave window DevTools console with a `[Lens:<workspaceId>]` prefix.
- Annotation events use a per-session nonce and a 256,000-byte event cap. Current, stale, and malformed Lens beacons are filtered out of both the user-visible Lens console and full diagnostics.
- Lens hides while blocking overlays such as Settings are open so the native `WebContentsView` does not render above dialogs.
- Lens is ideal for runtime inspection, but exact DOM-to-source mapping is still framework-dependent outside React dev mode.

### CDP actions fail with a Developer Mode message

- Symptom: screenshots, page HTML reads, evaluation, clicks, or style edits fail before running.
- Cause: CDP is disabled or the current host has not been approved.
- Fix: enable `Settings > Lens > Developer Mode`, then retry the action and answer the app-wide prompt within 60 seconds, or add the hostname manually under Approved CDP Hosts. The Lens panel does not need to be open.

### CDP approval times out or no prompt was visible

- Symptom: a Lens tool reports that approval timed out or that the host was not approved.
- Cause: the request expired, Stave was not open, or an older build routed the prompt to a hidden Lens tab.
- Fix: keep Stave open and retry the same tool to create a new request. Approve the app-wide dialog within 60 seconds. As a durable alternative, add the hostname under `Settings > Lens > Developer Mode > Approved CDP Hosts`; do not include a port or path.

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

### Local MCP opens the wrong Lens page

- Symptom: an omitted `lensSessionId` targets a different page than expected.
- Cause: the workspace has multiple Lens tabs and the intended tab was not the visible or most recently used UI session.
- Fix: pass the exact `lensSessionId` returned by `stave_lens_list_sessions`.

## Related Docs

- [Local MCP User Guide](local-mcp-user-guide.md)
- [Command Palette](command-palette.md)
- [Project Instructions](project-instructions.md)
