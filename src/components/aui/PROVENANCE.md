# Source provenance

This directory contains the canonical host-owned ADS source bundle retrieved through the ADS MCP on 2026-09-06. The original source paths, versions, dependency closure and integrity values are preserved in `.aui-source.json`.

The ADS owner explicitly authorized adoption and modification for Stave on 2026-09-06. The source bundle reports no package license; this record does not invent or replace that metadata. Preserve source notices when updating this copy.

Stave-specific theme mapping and compatibility adapters live in `../system` and `../ui`. Installed source includes the control, input, menu, overlay, navigation, feedback, and table families. Installation does not establish adoption: `config/design-system-migration.json` records consumed adapters and specialized engine boundaries.

Host modifications are intentional and retained when refreshing the bundle:

- TextField, Textarea, and Switch preserve host-provided validation and description ARIA attributes.
- Popover, Dialog, and Drawer expose surface styling separately from geometry, so existing hosts retain popup width, placement, scroll ownership, and nested drawer behavior.
- Badge, Breadcrumb, EmptyState, Table, Slider, Toggle, and Tooltip export their canonical styles for existing compound APIs.
- EmptyState's medallion defaults to the `neutral` tone instead of `accent`. The host's empty states are the absence of data, not brand moments; callers that want the accent medallion (onboarding invitations) pass `tone="accent"` explicitly.
- DiffViewer's `diffLines` sets the common head and tail aside before its LCS table and
  renders a changed middle above `MAX_LCS_CELLS` as removed then added, so a one-line
  edit to a file of thousands of lines costs O(n) instead of an O(n²) table.
- DiffViewer sizes its line-number gutter by the longest line number (an inline
  `--diff-viewer-line-digits` custom property, never narrower than the original 2rem), so
  four- and five-digit numbers keep their gap. After Expand, focus moves to the first
  revealed line instead of falling to the document body with the removed button.
- Calendar satisfies strict indexed access checks; malformed date keys resolve to an invalid date instead of assuming missing numbers exist.
- VersionCompare carries no English copy: its mode names, the mode switch's accessible name,
  the range labels (`copy`) and both version labels (`baselineLabel`, `currentLabel`) are
  required props the host fills from its translations (`src/components/system/ReviewVersionCompare.tsx`).
- ReviewStatus and ApprovalBar carry no English copy: the state pill's label (`children`,
  ApprovalBar's `stateLabel`) and the decision labels (`approveLabel`, `rejectLabel`,
  `requestChangesLabel`) come from the host, and the request-changes button uses the
  installed Button's `outline` variant name (the bundle calls it `outlined`).
- ActivityFeed renders every row: the bundle's opt-in `virtualization` prop and its
  `utils/windowed-list` (which needs `@tanstack/react-virtual`, a package the host does not
  ship) were not installed, so callers bound their feeds (the approval record shows its
  latest 50). `emptyText` is a required prop the host fills from its translations, and an
  avatar mark without initials is decorative (`alt=""`), because the actor's name is the
  text beside it. Avatar's presence and status labels come from the host's translations
  (`ui:avatar.*`). The `activity-feed` theme target gained upstream's `density` axis.
- RelativeTime carries no English copy: the relative phrase (`formatRelative`) and
  the card's `utcLabel` are required props the host fills
  (`src/components/system/RelativeTime.tsx`, with `formatRelativeTimeShort` from
  `src/i18n/format.ts`, or `formatTimeAgo` for a moment that already happened,
  and the display language's locale). It also takes `triggerXstyle`, host-owned
  geometry for the trigger button (the Tars message time's line box and 24px hit area).
- AsyncBoundary, LoadingSurface and the feedback dismiss control carry no English copy: their titles, labels, pending surface and the stale-data note (`errorTitle`, `retryLabel`, `refreshErrorTitle`, `staleNotice`, `pending`, `label`) are required props the host fills from its translations (`src/components/system/AsyncBoundary.tsx`), and a Banner shows its dismiss control only with a `dismissLabel`. AsyncBoundary's retry button uses the installed Button's `outline` variant name (the bundle's newer Button calls it `outlined`).

- Plan takes three optional props the host needs to draw every plan on it (the
  Agent run Progress tab and report, the composer shelf, the task's turn plan):
  `actions` (controls at the end of the header after the count, such as the
  shelf's fold toggle), `count` (the whole plan's count when `steps` is a
  folded part of it, or `false` where a neighbour already states the count)
  and `PlanStepItem.current` (`aria-current="step"`, which stays on the step a
  stopped plan stands on). Omitting them keeps the bundle's behavior.

- Small informational text reads `colorTextMuted`, not `colorTextSubtle`. Subtle is a 3:1 tier, under the 4.5:1 floor that 12px text needs, so the group labels, section labels, footers and shortcut hints in `Command`, `menu`, `listbox` and `select-styles`, the sidebar description and search shortcut, the calendar weekday row, activity and relative-time stamps, the clarification answer label, the diff viewer's line numbers, the file-change directory and `agentSurface.meta` use muted. Subtle stays on icons, disabled items and text at 14px and above.

Host-authored files that live here but are not from the bundle: `components/state-vocabulary.ts` (the work-state vocabulary), `components/StateMark.tsx` (how every surface draws a work state, in the theme's `--state-*` colors) and `components/AgentFleet.tsx` with `components/AgentFleet.model.ts` and `components/AgentFleet.styles.ts` (main agents with their subagent trees, for Fleet's Tree layout; it composes the bundle's `Button`, `Dialog`, `DurationTimer`, `EmptyState`, `LoadingSurface` and `StateMark`). `StatusDot.tsx` and `agent-state.ts` are bundle files modified to read their state tones from that vocabulary.

`agent-state.ts` names its lifecycle union `AgentStepState` (the bundle calls it `AgentRunState`), and every consumer here follows. The host already has an `AgentRunState`: the state of a supervised agent run (`src/lib/agent-runs/domain.ts`). One name for two different unions let a tool row's state read as a run's, so the bundle's union takes the name of what it describes, one step of agent work. Keep the rename when refreshing the bundle.

The original integrity values remain source provenance, not hashes of modified host files. Do not overwrite a locally modified file merely because its current hash differs from the source bundle.

Additional control/sidebar, lightbox, async-state, toolbar, version-compare, review,
activity-feed and relative-time closures are recorded in
`.aui-source-controls.json`, `.aui-source-lightbox.json`,
`.aui-source-async.json` (AsyncBoundary with Banner, LoadingSurface,
feedback-dismiss and the `async` and `tone` utilities; the bundle's `prose.css`
was not installed because the host's `styles.css` does not import it),
`.aui-source-toolbar.json` (Toolbar with its `headless/toolbar` primitives, for the
right rail's single tab stop; the bundle's unrelated theme-target and CSS files the
host does not load were not installed) and `.aui-source-version-compare.json`
(VersionCompare, for Lens review records' before/after comparison; its theme target
already existed, and the bundle's CSS and editing/graph theme-target files the host
does not load were not installed) and `.aui-source-review.json` (WorkspaceLayout,
ApprovalBar in `ReviewStatus.tsx`, ToggleGroup with its `headless/toggle-group`
primitives and the `busy-action` utility, for Review mode; their theme targets
already existed, and the bundle's newer Tooltip base, CSS and theme-target files
were not installed) and `.aui-source-activity-feed.json` (ActivityFeed with Avatar,
its presence dot, the `headless/avatar` primitives and the `overlay-mark` recipe, for
the approval record in Review and Activity; IconTile, the tokens and the theme
targets already existed, and the bundle's windowed-list utilities, newer Tooltip
base, CSS and theme-target files were not installed) and
`.aui-source-relative-time.json` (RelativeTime with its `headless/preview-card`
primitives; the bundle's theme-target and CSS files the host already has or does
not load were not installed). Only missing files
were installed; existing host modifications were preserved. Their catalog's
suggested dependency versions are recorded as provenance; the host's compatible
installed versions are governed by package.json and its validation gates.

Further host extensions:

- Button, TextField, Textarea and empty-state slots accept typed `xstyle`
  compositions. They resolve host styles together with their canonical recipes
  before emitting class names; disabled state remains authoritative.
- The `sx` helper accepts compiled StyleX compositions, including marker classes
  and conditional arrays used for ancestor-owned layout.

- Button exposes host layout for product rows and controls that must retain
  child DOM, native form type, and geometry while using canonical interaction
  and focus recipes.
- `utils/tone.tsx` adds the shared `Tone` vocabulary (the seven `StatusDot`
  tones) and `thresholdTone`, which picks a tone from a reading on a threshold
  scale. Product code narrows its tone unions to `Tone` and reads every
  threshold through the helper; the bundle's `MessageTone`, icon and role
  exports are unchanged.
- ToastHost accepts an external canonical toast manager for store-originated
  notifications. Task navigation is an explicit visible action.
- ToastHost `avoid` (host extension, `ToastHost.avoid.ts`): a selector for
  product chrome a bottom-anchored stack must stay above. While a toast is
  open, a visible match that shares the stack's column lifts the viewport so
  its `--aui-space-20` gap is measured from the match's top edge; matches
  beside the column leave it in place, and nothing is observed while the stack
  is empty. Top positions ignore it. The product's single bottom-right host
  passes `[data-toast-avoid]` (the chat composer column and the status bar).
- Lightbox accepts host overlay layering, accessible title, close label, and a
  test marker; canonical focus management, zoom, and pan remain authoritative.

- Button retains caller busy state and coalesces adjacent text nodes into one
  truncating label, preserving count-and-label spacing.
- Menu rows explicitly align text to inline start, including native button hosts.
- Source comments describing unrelated host products are generalized; source
  integrity records remain unchanged and do not claim byte-identical copies.

- DiffViewer (`DiffViewer.tsx` + the pure `DiffViewer.diff.ts` engine) was a
  missing file installed so the turn-event surface can render file diffs through
  a canonical, token-driven component instead of an external diff engine. Its
  pure engine satisfies strict indexed-access checks (loop-bounded reads are
  asserted present; the DP table falls back to `0`), matching the Calendar
  adaptation above. The upstream `xstyle`/`XstyleProp` escape hatch is dropped
  because the installed `utils/stylex` does not export it; callers style the
  wrapper through `className`.

- The agent turn-event family was installed as missing files: `ToolRun` (+
  `ToolRun.parts`, `ToolRun.styles`), `Thinking` (+ `Thinking.parts`),
  `Citation` (+ `Citation.parts`), and the parts they compose —
  `agent-state`, `agent-retry`, `DurationTimer`, `inline-disclosure-icon`,
  `LinkChip`, `StatusDot`, `TextShimmer` — with the recipes
  `agent-surface`, `inline-disclosure`, `status-chip` and `text-shimmer`. Only
  files absent from this copy were written: every file already present carries
  host fixes and was left untouched, so the installed `styles.css`,
  `control-chrome`, `tokens.stylex`, `ThemeProvider`, `Badge` and `Button*`
  remain the host's.

- `utils/stylex` now exports `XstyleProp`, the host style-composition channel.
  It is the contract the turn-event components above are written against, and it
  is what makes host composition deterministic: `xstyle` is merged last into the
  part's own `stylex.props(...)` call, so the host wins on exactly the properties
  it names, where a `className` composition resolves by bundler emission order.
  `StyleXValue` and the existing `sx`/`cx` behaviour are unchanged, so nothing
  already installed is affected.

- Two of the installed turn-event files needed the same strict indexed-access
  adaptation as `Calendar` and the diff engine: `TextShimmer`'s line-width
  lookup states the fallback its own modulo already guarantees, and
  `ToolRun.parts`'s `aggregateRunStatus` states the `null` its signature already
  documents. Behaviour is identical.


- Three components in this copy were authored in ADS and installed here in the
  same change rather than retrieved from a source bundle, so they carry no
  `.aui-source*.json` entry — there is no upstream revision to record yet:
  `StepRail` (the containment ladder's rung 2: a `space24` gutter, a
  `controlHeightSm` marker box, and a hairline `colorBorderSubtle` rule),
  `CappedViewport` (a `maxBlockSize` bound with a `space16` edge fade and
  live-edge follow), and `FileChangeSummary` (the header line `DiffViewer`
  deliberately does not have). Their ADS records are
  `consumer-changes/2026-09-07-step-rail-ladder-rung-two.json`,
  `2026-09-07-capped-viewport-bounded-payload.json` and
  `2026-09-07-file-change-summary-diff-header.json`.

- `Thread.liveEdge.ts` was installed as a missing file, unmodified, because
  `CappedViewport` composes its `useLiveEdgeFollow`. It is the follow
  arithmetic — direction beats position, a shrink is not a scroll-up — and a
  local re-approximation of it is the "fighting the reader" bug the file exists
  to prevent. Only `Thread.liveEdge.ts` was taken; `Thread` itself is not
  installed, because Stave owns its own transcript virtualization.

- `ToolRun` and `ToolRun.Group` gained an optional `icon` here and upstream
  (`consumer-changes/2026-09-07-tool-run-object-glyph.json`). The transcript
  renders a dozen kinds of work through one component, and the glyph is the
  only part of the row that names the kind before a word is read; the hardcoded
  wrench made every row look like the same call. Omitting `icon` keeps the
  previous glyph, so the change is additive. The prop crossed ADS's 500-line
  source ceiling, so `ToolRun.Group` moved to `ToolRun.group.tsx` upstream and
  here; `ToolRun.Group` is still how a call site reaches it.

- The turn-event decision family was installed as missing files, byte-identical
  from the ADS working tree: `Plan` (+ `Plan.parts`), `Approval`,
  `Clarification` and `Checkpoint`. Their dependency closure was already
  present — `agent-surface`, `focus-ring`, `transition`, `control-metrics`,
  `Button`, `Loader`, `VisuallyHidden` — so nothing else was written and no
  existing file was touched. `.aui-source.json` records each one with the
  sha256 of the exact bytes installed.

  Two of the four carry an ADS change made upstream first and installed here in
  the same pass, because the transcript has two records that are neither
  answered nor pending and §5 forbids rendering them as the nearest decision:
  `ApprovalOutcome.decision` widens to `ApprovalResolution`, adding `allowed`
  (the host kept "answered", not the scope) and `lapsed` (the run ended with
  the gate unanswered); `ClarificationOutcome.result` gains the matching
  `lapsed`. Both are additive type widenings, so no existing call site changes.
  Their ADS records are
  `consumer-changes/2026-09-07-approval-resolution-beyond-the-decision.json`
  and `2026-09-07-clarification-lapsed-result.json`.

  `Approval` carries one host extension, `density="compact"` (default
  `"default"`). It fits the same decision into a surface that draws its own
  boundary — the composer's approval queue, a delegated child's request slot,
  a Fleet row or panel: the transcript's top rule goes, the gaps and padding
  tighten one step, and the description and argument values clamp to three
  lines. The decision set, its words, `busy`, focus hand-off and the recorded
  outcome are unchanged, so the transcript (which keeps the default) and the
  compact surfaces answer a request the same way. Stave reaches it only through
  `src/components/session/ToolApprovalCard.tsx`, which also passes
  `allowAlways` explicitly instead of relying on the `true` default.

  Two more host extensions, both optional and additive:
  `allowOnceShortcut` (`{ ariaKeyShortcuts, hint }`) makes Enter with Ctrl or
  Cmd allow once while focus is inside that one decision, puts
  `aria-keyshortcuts` and the keycap hint on the Allow once button, and
  deliberately binds no Escape-to-deny; `risk` renders a word in muted ink
  before the status word (the status word stays the one colored signal). The
  root composes a caller's `onKeyDown` before its own. Without either prop the
  component renders and behaves exactly as installed.

  `Checkpoint` is installed but not yet wired: Stave's compaction-boundary
  restore runs a destructive `git restore --worktree` behind a
  confirm-then-restore second click, and `Checkpoint` models a single
  `onRestore`. Adopting it now would silently drop the confirmation, so the
  host surface stays until ADS can express a destructive restore.

- `Button` gained the `indicator` slot upstream first and the hunk was installed
  here (the file is host-modified, so the change is applied as a hunk rather
  than a byte-identical overwrite — see the note about integrity values above).
  It is what makes a corner count badge possible at all: `styles.root` declares
  `overflow: hidden`, so an absolutely positioned child pinned to a corner was
  clipped on the two edges it hung over and no caller could un-clip it from the
  outside. Measured on a 32px top-bar button with a 16px badge at `-4/-4`: 4px
  of the badge painted away on each of the top and end edges. ADS record:
  `consumer-changes/2026-09-07-button-corner-indicator-slot.json`.

  Stave divergence: `layout="host"` (a host extension, not upstream) returns
  before the slot renders, so it ignores `indicator`. That path composes
  `controlChrome.triggerQuiet` and never clipped, so a host-layout caller can
  keep rendering the mark as a positioned child; a shared slot there would have
  to re-decide geometry the host owns on that path by definition.

- `ThemeProvider` publishes `--aui-selection-background` / `--aui-selection-color`
  from `colorText` / `colorTextInverted`, and `styles.css` no longer carries the
  per-`data-theme` oklch literals for them (upstream first; installed here as
  the same hunk). The literals were a copy of the three shipped themes, so they
  could not follow Stave's own saved themes at all: `StaveDesignProvider` maps
  the ADS color group onto `--foreground` / `--background`, and a workspace on a
  custom dark theme (`--foreground: #CCCAC2`) still had text highlighted in the
  design system's `oklch(0.985 0.007 89)`. Measured after: the pair resolves to
  `#CCCAC2` on `#242936`. ADS record:
  `consumer-changes/2026-09-07-selection-follows-theme-tokens.json`; the
  installed copy is guarded by `tests/aui-selection-tokens.test.ts`, because the
  upstream `selection-sync` script does not run in this repository.

- `Loader` gained `reason` and `think` upstream first. `reason` is a vertical
  reasoning trace (three nodes on a spine whose thought lines write out in
  order); `think` is a shape-shifting orb inside a breathing halo. Stave maps
  `reason` onto the CoT header and `think` onto the `Thinking` row so the
  container and its first step still run different cadences. `cascade` is
  gone from the Loader union. ADS records:
  `consumer-changes/2026-09-08-loader-reason-cadence.json`,
  `consumer-changes/2026-09-08-loader-connected-reason-think.json`,
  `consumer-changes/2026-09-08-loader-reason-trace-think-orb.json`.

- Design tokens moved from StyleX-hashed `defineVars` keys to explicit CSS
  custom property names: `vars.colorText` is now `vars["--aui-color-text"]`, and
  the emitted variable is the literal `--aui-color-text` instead of a hash. The
  rename is total and derivable (camelCase to kebab, `--aui-` prefix, a break
  before each digit run), so there is no rename table to keep. It is a
  prerequisite for compiling ADS and product code under different StyleX
  `classNamePrefix` values: a prefix renames generated CSS *variables* as well
  as classes, so a product-origin file would otherwise emit `var(--a1i78luf)`
  for a token whose ADS-origin rule defines `--x1i78luf`. Never alias,
  re-export or spread a token group — an unresolvable member on an
  explicit-key group is hashed silently into a variable nothing defines. ADS
  record: `consumer-changes/2026-09-09-explicit-token-custom-property-names.json`.

- `tokens.stylex.ts` and `themes.stylex.ts` were re-synced from upstream in the
  same change, which also picks up the re-anchored warning and success hues
  (warning to hue 50, success to hue 152) and the retuned priority, csat and
  chart steps. `colorWarning`, `colorSuccess` and `colorDanger` are remapped by
  `../system/aui-theme.ts` onto Stave's own semantic colors and so do not move;
  `colorWorkflow*`, `colorPriority*`, `colorCsat*` and `chart*` are deliberately
  not remapped, so those steps do change. The one retained host modification is
  the sans stack, which keeps `"Pretendard Variable"` second because this copy's
  `fonts.css` loads Pretendard's variable dynamic subset rather than upstream's
  four static weights.

- `breakpoints.stylex.ts` was installed as a missing file: upstream split the
  `defineConsts` breakpoints out of `tokens.stylex.ts`, which now re-exports
  them for JS and types only. A StyleX condition key such as `[breakpoints.md]`
  must import the *defining* module or CSS generation fails with an invalid
  empty selector, so `AppShell.shell.styles.ts` imports it directly. ADS
  records: `consumer-changes/2026-09-07-breakpoints-module-split.json`,
  `consumer-changes/2026-09-07-breakpoints-defineconsts-import.json`.

- StyleX is now compiled per ORIGIN. `scripts/vite-aui-stylex.mjs` and its
  `.core.mjs`/`.d.mts` siblings replace `stylex.vite()` in `vite.config.ts` and
  `electron.vite.config.ts`: ADS modules (everything under this directory, named
  by `auiRoots`) keep StyleX's default `x` class name prefix, everything else
  compiles under `p`, and each origin's rules are emitted as
  `@layer aui.priority*` / `@layer product.priority*`. An atomic class is a pure
  function of its declaration, so ADS and product code writing the same
  declaration used to produce the SAME class and therefore one cascade
  position; distinct prefixes are what let the two origins hold different ones.
  The canonical order is now
  `reset, theme, base, aui, aui-theme, product, components, utilities`, stated
  identically in `index.html`, `src/globals.css` and this directory's
  `styles.css`, and enforced by `scripts/check-design-system-migration.mjs`.
  `aui-theme` ships empty; it is the seam a brand recipe would occupy.
  Measured on the dev server against a rendered ADS Button whose own
  `padding-inline` is 12px: a rule in `aui-theme` renders 33px, the same rule
  with a product-layer rule renders 41px. ADS record:
  `consumer-changes/2026-09-09-stylex-origin-layers.json`; the compatibility
  test for the `@stylexjs/unplugin` internals this reaches is
  `tests/stylex-origin-layers.test.mjs`, which must pass after any StyleX
  upgrade (the dependency is pinned to 0.19.0 exactly for this reason).

  Two deliberate departures from the upstream instructions. The origin
  classifier has no built-in ADS root, because upstream's default is its own
  workspace package path and this is a source install; `auiRoots` is the only
  thing that names AUI here. And `auiCascadeLayers()` is not installed: the
  `#stave-style-layers` block in `index.html` already publishes the statement
  ahead of every bundled sheet, which is the same mechanism, and the migration
  gate already compares it against `src/globals.css`.

  `src/main.tsx` no longer imports `virtual:stylex:runtime`. That module is
  served by `@stylexjs/unplugin`'s own Vite adapter, which this plugin replaces;
  `auiStylex` injects the equivalent `/virtual:aui-stylex.css` link and dev
  client itself. Left in place it is an unresolvable import and the dev server
  returns 500 on the entry module.

- Not yet adopted from `consumer-changes/2026-09-09-layered-motion-and-font-imports.json`:
  the ADS motion sheets and `fonts.css` are still imported UNLAYERED here.
  Unlayered declarations outrank every layer, which is their behaviour today, so
  annotating them `layer(aui)` would move them below product StyleX — a real
  change with no consumer for it yet, because no product theme exists. Adopt it
  with the theming module, not before.

- `xstyle` is now the single host style-composition channel, and
  `scripts/check-style-channel.mjs` enforces it (`bun run check:style-channel`,
  wired into `test:ci`). It fails a JSX element imported from this directory
  that carries StyleX through `className`. `className` is unchanged and still
  correct for behaviour hooks, motion class names, test ids and forwarding a
  caller's own class.

  The two channels are not interchangeable. `className` hands the component an
  opaque string, so the component's atomic class and the host's both exist and
  the winner is settled by cascade position — which, before the origin split,
  was decided per property by whichever module first emitted the class, and
  after it is decided uniformly in the host's favour. Either way the call site
  cannot see the answer. `xstyle` is merged last into the part's own
  `stylex.props()` call, so it resolves by property name in JS before the
  cascade is consulted and reads the same before and after the split.

  `Badge`, `Checkbox`, the six `Card` parts, nine `Dialog` parts, five
  `Command` parts and two `Select` parts gained the prop; `Kbd`, `Tabs.Root`,
  `WorkflowIcon` and `Button` already had it. 52 product call sites moved.

  Two host-specific decisions. `Checkbox` routes `xstyle` the way it already
  routes `className`: to the control root in `controlOnly` mode and to the
  label row otherwise, because in `controlOnly` the control IS the outer box
  the host sees. Applying it to both would paint the same override on two
  nested boxes. And `Button` keeps its existing argument order, with `xstyle`
  ahead of the disabled and inert expressions rather than strictly last, so a
  disabled control's `cursor` and `opacity` stay authoritative; that deviation
  predates this change and is recorded above.

  The guard is retargeted for a source install: it scans `src/` minus this
  directory, and resolves each import specifier (`@/…` or relative) against the
  importing file rather than matching a package name, because there is no
  package specifier here. `ads/headless` is excluded — those modules are bare
  Base UI re-exports that declare nothing and so have no `xstyle` to offer.
  ADS records: `consumer-changes/2026-09-07-xstyle-host-style-composition-contract.json`,
  `consumer-changes/2026-09-08-xstyle-style-channel.json`.

- The `theming/` module (32 files) and `tokens/theme-values.ts` were installed,
  and 27 never-modified components were re-synced from ADS `589cfc4c`. Those 27
  now emit stable theme targets — an `aui-<target>` class plus `data-variant` /
  `data-size` / `data-tone` / `data-density` and `data-aui-slot` — through
  `themeProps` / `themeSlotProps`. Nothing styles those selectors yet; they are
  the addressing scheme a product theme would need, and the `aui-theme` cascade
  layer reserved earlier is still empty. ADS records:
  `consumer-changes/2026-09-09-stable-theme-targets.json`,
  `consumer-changes/2026-09-09-scoped-product-themes.json`,
  `consumer-changes/2026-09-09-theme-target-coverage.json`.

  **This host does not adopt ProductTheme.** Stave's own theme system
  (`src/lib/themes/`) stays the single theme authority: it is user-installable
  at runtime as validated JSON, which a build-time CSS generator cannot express.
  `defineProductTheme` and `ProductThemeProvider` are therefore installed but
  unmounted, and `src/components/system/aui-theme.ts` remains the bridge from
  ADS token roles onto Stave's palette.

  That decision forced one host modification, in
  `theming/ProductThemeProvider.tsx`. Upstream's `PortalProductThemeScope`
  re-applies the mode and density token groups on the portal wrapper, because
  upstream supports a provider scoped to a region and `@scope` cannot un-inherit
  a custom property. Here the single root `ThemeProvider` already mirrors those
  groups onto `document.documentElement` under `syncDocument`, and
  `StaveDesignProvider` publishes the host palette mapping over them as inline
  custom properties on `<html>`. A class on a closer element outranks an
  inherited value, so the unconditional form would have replaced the user's
  saved theme with the design system's stock palette inside every dialog, menu,
  popover, drawer, select and tooltip. The groups are now applied only when a
  brand is actually scoped; the attributes, `color-scheme` and the selection
  pair are still re-established unconditionally, because those declare no token.
  Guarded by `tests/aui-portal-theme-scope.test.tsx`, which fails if a later
  re-sync restores the upstream form.

- `Select.parts.tsx` carries a PARTIAL forward-port: the re-synced
  `Select.array.tsx` passes `readOnly` to the trigger, so that prop and its
  behaviour (`aria-readonly`, pointer/key interception, and
  `controlChrome.readOnlyField` composed after `disabledField`) were taken from
  upstream verbatim. The rest of the file still carries host edits and its
  `xstyle`/`themeProps` changes are deliberately not taken; it needs a full
  three-way merge in a later pass.

- Still unapplied: 35 host-modified files whose upstream versions have moved
  (`Button`, `Menu`, `Dialog`, `Drawer`, `Popover`, `Tooltip`, `Tabs`,
  `ToastHost`, `Card`, `Badge`, `Table`, the field family, `Calendar`,
  `Command`, `Breadcrumb`, `EmptyState`, `StepRail`, `Plan`, `DiffViewer`,
  `ThemeProvider`, `styles.css`, `fonts.css`, `overlay-motion.css`,
  `recipes/menu.ts`, `recipes/transition.ts`, `utils/stylex.ts` and their
  style/type siblings). Each needs a three-way merge against the pristine
  install baseline, not an overwrite. A mechanical batch attempt was reverted:
  taken singly these files break each other (`Button.types.ts` introduces a
  `dashed` variant `Button.styles.ts` has no styles for) and upstream compiles
  without `noUncheckedIndexedAccess`, so wholesale copies reintroduce strict
  errors this copy already fixed. Merge them as coherent groups.

- The Button family and the three foundation modules (`utils/stylex.ts`,
  `recipes/transition.ts`, `recipes/menu.ts`) were three-way merged against the
  pristine install baseline. Upstream had independently adopted three host
  extensions verbatim — the `bar`/`slide` transition recipes, the native-button
  reset on `menu.item`, and Button's `indicatorHost`/`indicatorSlot` — so those
  hunks collapsed to upstream's spelling. Three host modifications survive and
  are re-expressed in upstream's structure: the exported, widened `StyleXValue`
  and unfiltered `sx` that `xstyle` arrays depend on; Button's `layout="host"`
  render path; Button's `aria-busy` honouring a caller-passed value; and
  `xstyle` merged ahead of the disabled and inert expressions so a disabled
  control's `cursor` and `opacity` stay authoritative.

  Two upstream API removals reached product code.

  `Button` now publishes its theme identity on `data-variant` / `data-size` /
  `data-tone` and no longer emits `data-aui-control-size|tone|variant`. Those
  are spread after the caller's props, so `src/components/ui/button.tsx`'s own
  `data-variant` / `data-size` were being overwritten before reaching the DOM
  and have been removed; the rendered element now carries the design system's
  spelling, so the product's `ghost` reads as `data-variant="quiet"` and
  `destructive` as `data-variant="soft" data-tone="danger"`. No stylesheet
  selects on those attributes; two assertions in
  `tests/prompt-input-queue-mode.test.tsx` were updated to the spelling that
  actually reaches the DOM, and a dead `data-size` forward in
  `ui/input-group.tsx` was dropped.

  `buttonDangerToneStyles` was deleted upstream: every semantic tone is now one
  implementation driven by `--aui-button-tone-*` custom properties that `Button`
  publishes as an inline style. `buttonVariants()` emits classes only and has no
  element to carry an inline style, so the class-only path declares the same
  five properties through StyleX. That crosses the origin split — the
  declaration compiles as product and the consumers as ADS — so it was measured
  rather than assumed: in the live sheet `.po9pvqs` (product) declares
  `--aui-button-tone-fill` and `.x1k91mr0` (ADS) consumes it for
  `background-color`, and an element carrying both paints
  `oklch(0.56 0.2 25)`, this theme's `--destructive`. StyleX emits a
  variable-only rule at priority 0, which `processStylexRules` leaves unlayered,
  so the declaration outranks every layer and cannot be shadowed by either
  origin.

- The content/agent-surface group was three-way merged against the pristine
  install baseline: `Badge`, `Card`, `Table`, `Breadcrumb`, `EmptyState`,
  `Plan`, `StepRail`, `DiffViewer`, `Command` (+ `Command.styles`) and
  `ToolRun.styles` / `ToolRun.parts`. Upstream had independently adopted most
  of this group's host extensions verbatim, so those hunks collapse to
  upstream's spelling: `xstyle` on `Badge`, the six `Card` parts, every `Table`,
  `Breadcrumb` and `EmptyState` part and five `Command` parts; the empty-state
  header's `justifyItems: center`; the plan header's `space8` inline padding;
  `ToolRun`'s 22rem container arm across all seven keys; `DiffViewer`'s
  `highlighter` / `language` seam, `paintHighlightedLine` span painting and the
  `DiffViewerHighlightSpan` re-export; and the command palette's
  `atelier-motion-backdrop` / `-modal` / `-modal-top` classes. `Card`, `Plan`,
  `StepRail`, `DiffViewer` and `Command` are now byte-identical to upstream.

  Five host modifications survive, re-expressed on upstream's structure: the
  canonical style exports `badgeStyles` / `badgeToneStyles` /
  `badgeOutlineToneStyles`, `tableStyles`, `breadcrumbStyles` and
  `emptyStateStyles`, still needed by the compound adapters in `../ui`; and
  `ToolRun.styles`'s `title` dropping `color`, because a row label's ink is
  `agentSurface.rowLabel` composed before it at the call site.

  `ToolRun.parts.tsx` was HAND-MERGED WITHOUT A BASE. Its recorded integrity is
  an uncommitted upstream working-tree state, so no pristine baseline exists in
  either repository and a mechanical three-way merge is impossible. It starts
  from upstream with three known host deltas re-applied and nothing else:
  `"skipped"` in `ROLLUP_PRIORITY` (a host-added `AgentStepState`),
  `?? null` on `aggregateRunStatus`'s result (the strict indexed-access
  adaptation recorded above), and `agentSurface.rowLabel` on the title.

  `Command.styles.ts` did not move upstream, but it is reset to upstream here
  rather than kept, because upstream's `Command.tsx` now uses the three keys
  this copy had dropped as unused — `pageHeader`, `pageTitle` and
  `sectionLabel` — for command pages and the recents section. The other host
  edits to that file were the palette's missing surface and a hand-rolled
  keycap, and upstream has since solved both in shared form: the backdrop and
  popup surface are `recipes/overlay-surface`'s `backdrop` / `modal` /
  `modalRounded` (identical declarations to the host's), and the ⌘K hint is the
  `Kbd` component inside a positioning-only `triggerShortcut`. `footerKbd` was
  already dead — `Command.parts` renders `Kbd`.

  `CommandDialog` moved out of `Command.tsx` into `Command.dialog.tsx` upstream
  (the `xstyle` contract pushed the module past the 500-line ratchet), so that
  file is installed to keep the export reachable. It is installed but not
  wired, like `Checkpoint`: the product palette is `ui/command.tsx` over
  `ui/dialog`, and only the compound `Command` parts and `Command.styles` are
  consumed.

  New files, all byte-identical to upstream `589cfc4c`: `Command.types.ts`,
  `Command.dialog.tsx`, `IconTile.tsx`, `truncating-label.tsx`,
  `recipes/value-token.ts` and `recipes/overlay-surface.ts`.
  `recipes/status-chip.ts` was re-synced for the additive
  `statusChipSolidToneStyles` rows `Badge solid` reads; it carried no host
  modification.

  Two upstream API changes reached product code.

  `Badge`'s box and its `outline` edge moved out of the component's own
  `styles` into `recipes/status-chip`, and the chip gained a `size` axis whose
  `md` rung now carries the font size and inline padding the old `root` held.
  `badgeStyles.root` / `.outlineBase` no longer exist, so `badgeVariants()` in
  `src/components/ui/badge.tsx` — the class-only path, which has no element to
  render — composes `statusChip.root`, `statusChipSizeStyles.md` and
  `statusChip.outline` instead, the same three keys the component composes.

  `EmptyState`'s medallion is now an `IconTile` (`round`, `xl`), so
  `emptyStateStyles.media` and `.toneNeutral` are gone. `EmptyMedia` in
  `src/components/ui/empty.tsx` delegates its `variant="icon"` arm to the ADS
  `EmptyStateMedia` part rather than re-composing two keys that no longer
  exist; the shim's own `justifySelf: center` is passed through `xstyle`, so a
  caller's fill and size still win. The tile is a `<span>`, so the shim's
  default arm is one too — every call site nests it in `EmptyStateHeader`'s
  grid, where both are blockified. `IconTile` paints an unconditional hairline
  rim the old `media` key did not, which is upstream's stated intent; the two
  call sites that override the medallion's fill and size keep doing so.

- The overlay/portal group was three-way merged against the pristine install
  baseline: `Dialog`, `Drawer`, `Popover`, `Menu`, `Tooltip`, `ToastHost` and
  `overlay-motion.css`. Upstream had independently adopted every one of this
  group's host extensions except the style exports and the toast manager, so
  those hunks collapse to upstream's spelling:

  - Dialog's and Drawer's `surface` / `popup` split — paint separated from
    geometry — is now `recipes/overlay-surface`'s `modal` (+ `modalRounded` for
    Dialog) composed ahead of a geometry-only `popup` key, with the surface's
    `gap`/`padding` supplied by `overlayModalDensity`. The declarations are
    identical to the host's; only the module they live in moved.
  - Popover's `PopoverDensity` / `popupFlush` / `headerFlush` / suppressed
    `focusRing.gutter` is upstream's `OverlayContentDensity` `"flush"` value,
    `overlaySurface.contentFlush`, the same `headerFlush` declarations and
    `flush ? styles.bodyFlush : focusRing.gutter`. Upstream's version is a
    superset: `compact` joins `regular` and `flush`, and `overlayDensityTier()`
    narrows the content tier back for the title-group map. ADS record:
    `consumer-changes/2026-09-07-popover-flush-content-density.json`.
  - `Menu.Popup`'s `xstyle`, threaded into `menu.popup`.
  - `ToastHost`'s column restructure — `content` as a flex column, the main
    row extracted to a `row` / `rowMultiline` pair, and `actionRow` promoted to
    a sibling of the row at `space12` so a multi-line action row spans the
    close column. Upstream's `ToastHost.styles.ts` is byte-identical to the
    host's former inline `styles` object, comments included.
  - `overlay-motion.css`'s `.atelier-motion-modal.atelier-motion-modal-top`.
    The merged sheet is byte-identical to upstream, which also drops the
    `--atelier-motion-tooltip-delay` transition delay (the dwell is a JS rest
    timer on the trigger now).

  Five host modifications survive, re-expressed on upstream's structure: the
  canonical style exports `dialogStyles` (re-exported from the new
  `Dialog.styles`), `drawerStyles`, `popoverStyles` and `tooltipStyles`, still
  needed by the compound adapters in `../ui` and by the product's own dialog
  panels; and `ToastHost`'s `toastManager` passthrough, which is how
  store-originated notifications reach a host that cannot call `useToast()`.

  New files, all byte-identical to upstream `589cfc4c`: `Dialog.styles.ts`,
  `Menu.styles.ts`, `Menu.density.tsx`, `Menu.merge-class-name.ts`,
  `Tooltip.group.tsx` and `ToastHost.styles.ts`. `Menu` and `Tooltip` carry
  no other host delta; `Menu.tsx` is now byte-identical to upstream.
  (`overlay-motion.css` was later brought to #813 with three host deltas; see
  the #810–#813 entry.)

  One upstream API change reached product code. The `surface` key these
  components used to export no longer exists, because paint moved to
  `recipes/overlay-surface`. The seven call sites that composed it —
  `src/components/ui/dialog.tsx`, `src/components/ui/drawer.tsx`,
  `src/components/ui/sheet.tsx`, `src/components/ui/popover.tsx`,
  `src/components/layout/ConfirmDialog.tsx`,
  `src/components/layout/CreateWorkspaceDialog.tsx` and
  `src/components/layout/OpenPathDialog.tsx` — now compose
  `overlaySurface.modal` (+ `modalRounded` for the four dialog surfaces) or
  `overlaySurface.anchored`, which are the same declarations under the recipe's
  names and the same keys the ADS components themselves compose.

  `Menu.Popup` reads menu density from React context now, so it can no longer
  be invoked as a plain function. `tests/ui-menu-popup-surface.test.tsx`
  resolves the part's class through a probe component instead; its Base UI
  child still refuses to render outside `Menu.Portal`, which is a no-op under
  `react-dom/server`.

  Contrary to expectation, `data-variant` on `ui/dropdown-menu.tsx`'s and
  `ui/context-menu.tsx`'s items is NOT overwritten by the new theme spread:
  the `menu-item` target publishes `density` and `tone` axes only, so a
  destructive row renders `data-variant="destructive" data-tone="danger"`.
  Verified by rendering both shims. The product attribute is left in place.

- The field/control/navigation group was three-way merged against the pristine
  install baseline: `TextField`, `Textarea`, `Switch`, `Toggle`, `Slider`,
  `Select.parts`, `Tabs` (+ `Tabs.styles`) and `Calendar`. Upstream had
  independently adopted almost every host extension in this group verbatim, so
  those hunks collapse to upstream's spelling:

  - `xstyle` on `TextField` and `Textarea`, now the shared `XstyleProp` type
    rather than a locally declared `xstyle?: StyleXValue` field, and `xstyle`
    on `Toggle`, `Slider` and `Select.List` / `Select.ItemText`.
  - The whole read-only `Select.Trigger` — the prop, `aria-readonly`, the
    pointer/key interception and `controlChrome.readOnlyField` composed after
    `disabledField`. The partial forward-port recorded above is therefore no
    longer a host modification; it is upstream's own code, and the note
    explaining the forward-port is gone with it.
  - The entire Tabs `xs` rung. `tabExtraSmallHeight` (caption font size,
    `treeRowHeightCompact` min block size, `space8` inline padding, coarse
    pointer floor at `controlHeightXl`), `tabHeightBySize.xs`, `TabsSize`
    widened to `"xs" | "sm" | "md"`, `root.alignContent: "start"`, `listLine`'s
    `alignItems`/`alignSelf: "stretch"` and `listLineVertical.alignSelf:
    "start"`, plus `xstyle` on all five compound parts. ADS records:
    `consumer-changes/2026-09-07-tabs-xs-caption-type-step.json`,
    `consumer-changes/2026-09-07-tabs-root-align-content-start.json`,
    `consumer-changes/2026-09-07-tabs-line-strip-meets-row-bottom.json`.

  `Tabs.tsx`, `Tabs.styles.ts` and `Select.parts.tsx` are now byte-identical to
  upstream. `TabsSize` moved into `Tabs.styles.ts` and `Tabs.tsx` re-exports it,
  so `size="xs"` still resolves at every call site (`system/SectionTabs.tsx`
  passes it for the ~300px workspace tools rail).

  Five host modifications survive, re-expressed on upstream's structure:

  - `TextField`, `Textarea` and `Switch` still MERGE the caller's ARIA rather
    than replacing it — `aria-describedby` joins the caller's value with the
    field anatomy's and `aria-invalid` falls through to the caller's when the
    anatomy is valid. Upstream still overwrites both, and this is accessibility
    behaviour rather than styling, so the host form is kept. Each is now marked
    with a short host-adaptation comment at the read site; verified by rendering
    all three, which produce `aria-describedby="host-hint <anatomy id>"`.
  - The canonical style exports `toggleStyles` and `sliderStyles`, still needed
    by the compound adapters in `../ui`.
  - `Calendar`'s `enabled[0]!` strict indexed-access adaptation.

  Four new files were installed to close the import graph, all byte-identical
  to upstream `589cfc4c` except where noted: `Calendar.styles.ts`,
  `Tabs.session.tsx`, `Tabs.session.styles.ts`, and `date-range.ts`. `Calendar`
  no longer owns `toDateKey` / `parseDateKey`; they moved to `date-range.ts`
  with the shared `DateRangeValue` / `DateRangePreset` types, so the host's
  `parseDateKey` adaptation moved with them — `[year = NaN, month = NaN, day =
  NaN]`, the same "malformed key resolves to an invalid date" behaviour recorded
  at the top of this file. `Tabs.session.tsx` is installed but not wired: it is
  reachable as `Tabs.Session`, and no product surface composes it yet.

  Three of these merges reported MERGED CLEAN while producing a duplicate,
  because both sides had added the same thing at the same anchor: `Textarea`
  and `TextField` ended up with two `xstyle` bindings in one destructuring
  pattern, and `Tabs.styles.ts` with two `const tabExtraSmallHeight`
  declarations. Read the merged diff, not the exit code.

  One upstream API change reached product code. `Select.Trigger` publishes its
  theme identity on `data-size` (`themeProps("select-trigger", { size })`, whose
  target declares `axes: { size: ["xs", "sm", "md", "lg"] }`) and `{...theme}`
  is spread after the caller's props, so `src/components/ui/select.tsx`'s own
  `data-size` was overwritten before reaching the DOM and has been removed; the
  rendered button carries the ADS rung, so the shim's `"default"` reads as
  `data-size="md"`. `src/components/ui/switch.tsx`'s `data-size` is NOT a
  collision and is left in place: the `switch` target declares `axes: { tone:
  [...] }` only, and the rendered element carries `data-size="sm"
  data-tone="default"` together. Both verified by rendering the shims.
  `src/components/ui/input-group.tsx` publishes no theme-axis attribute at all.

  One host test moved with the source. `tests/aui-control-chrome.test.ts`
  asserted the `xs` union in `Tabs.tsx`; it now asserts the declaration in
  `Tabs.styles.ts` and the re-export in `Tabs.tsx`.

- The global sheets close the re-sync. `ThemeProvider.tsx` is now byte-identical
  to upstream: both remaining conflicts were prose, because upstream had already
  adopted the non-destructive `<html>` restore and the selection token pair this
  copy carried. `styles.css` takes upstream's zero-specificity reset — every
  selector wrapped in `:where()` at 0,0,0, so a host rule in the same layer wins
  by weight instead of by whichever sheet the bundler parsed last — and keeps
  three host rules: the cascade layer statement's comment, the
  `layout="host"` carve-out on the control glyph rule, and the `@layer base`
  default that gives a host-layout Button's glyph a size without mandating one.
  `--atelier-motion-tooltip-delay` is gone, upstream having moved the tooltip
  dwell to a JS rest timer in `Tooltip.group.tsx`; that is a perceptible timing
  change to every tooltip. ADS record:
  `consumer-changes/2026-09-08-reset-layer-zero-specificity-and-runtime-cascade-guard.json`.

  `fonts.css` keeps this copy's Pretendard VARIABLE dynamic subset — one variable
  face across 92 unicode-range slices instead of upstream's four static weights
  (368 files) — and adopts upstream's `layer(ads)` annotations, which are inert
  for `@font-face` but keep the imported sheet in the package's own origin. The
  matching sans stack in `tokens.stylex.ts` keeps `"Pretendard Variable"` for the
  same reason. ADS record:
  `consumer-changes/2026-09-09-layered-motion-and-font-imports.json`.

  `tests/aui-control-chrome.test.ts` now asserts the zero-specificity form
  rather than the presence of an element name, and fails on any unwrapped reset
  selector. Its region slice was also anchored on `@layer base {` instead of the
  bare phrase, which upstream's new prose had started matching.

- **`.aui-source.json` carries `sourceRevision`; the two sibling manifests do
  not, on purpose.** Every installed file's
  recorded integrity is the hash of the upstream file at ADS `589cfc4c`, so the
  merge base for the next upgrade is `git -C <atelier> show <sourceRevision>:<sourcePath>`,
  verifiable against the integrity value. That replaces the archaeology this
  migration needed: no pristine copy was stored anywhere, so the baseline had to
  be recovered by scanning both repositories' object stores for a blob matching
  each recorded hash (119 of 120 found; `ToolRun.parts.tsx` matched nothing
  because its recorded bytes were an uncommitted upstream working-tree state).
  The integrity values remain PRISTINE upstream hashes, never hashes of locally
  modified files — a file whose current hash differs is a documented host
  modification, not drift to be overwritten.

  The control and lightbox closures were not part of this migration. 21 of their
  files live outside `.aui-source.json` — `AppShell` and its sidebar parts,
  `Lightbox`, `Checkbox`, `RadioGroup`, `NativeSelect`, `CappedViewport`,
  `Citation`, `Thinking`, the `ToolRun` group, and the small agent-surface parts
  — and they still sit at the upstream content they were installed from plus
  their host modifications. Their recorded baselines are therefore left at the
  original install hashes: advancing them to `589cfc4c` would claim a merge base
  that was never merged, and the next three-way merge would silently use the
  wrong base and drop host work. Files those manifests SHARE with
  `.aui-source.json` were re-synced and did advance. Re-syncing those two
  closures is the remaining ADS parity work.

- **The selection family (`.aui-source-selection.json`).** `Combobox` (its
  array and compound halves, `FieldTrigger`, chips, paging and create rows,
  `headless/combobox` and the `field-shell` recipe), `Stepper` (root, items,
  `Flow`/`Panel`) and `AppliedFilters` were installed from the ADS source
  bundle on 2026-11-03 for Stave's pickers, the auto-routing wizard and the
  applied-filter rows. Only the 25 files absent from this copy were written;
  every file the bundle shares with an older closure kept its host version, and
  the bundle's newer `Tooltip.base`, `shortcut-keys`, CSS sheets and
  theme-target files were not installed because nothing installed here imports
  them. The manifest's integrity values are the PRISTINE upstream hashes.
  `FilterBar` and `DatePicker` were not installed: their closure brings a
  rule-builder query editor, a number field and a second calendar the host has
  no consumer for yet.

  Host modifications, kept when refreshing:

  - Every English default (empty, loading, search placeholder, clear, open,
    remove-chip, create, retry, load-more, applied-filter and stepper status
    copy) reads `i18n.t("ui:combobox.*" | "ui:appliedFilters.*" |
    "ui:stepper.*")` instead of a literal, and the array components call
    `useTranslation()` so a language switch re-renders them. Stepper's
    `statusLabels` holds translation keys rather than words.
  - `Combobox.loadMore`'s retry button uses the installed Button's `outline`
    variant name (the bundle calls it `outlined`).
  - Stepper `showDescriptions` (host extension on `Stepper.Root` and the array
    `Stepper`, carried on `StepperRootContext`, default `false`): a
    `navigation` step renders its `Description` on screen, one tight muted
    line under the title on the title's left edge (`descriptionNavigationShown`
    in `Stepper.styles.ts`), instead of upstream's visually hidden text. The
    variant, its connectors and its triggers are otherwise unchanged; the
    `track` variant was not used because its horizontal list stacks into a
    column below a 640px container, which the wizard's rail is. The usage
    wizard turns it on so each step's status ("6 prompts read") reads under
    its name.
  - Comments naming other internal products and their tracker numbers were
    generalized.

  `ToggleGroup.tsx` (byte-identical to upstream until then) now also exports
  its styles as `toggleGroupStyles`, the same canonical-style export Toggle,
  Slider and Tooltip carry, so the host `SegmentedControl`
  (`src/components/system/SegmentedControl.tsx`) draws its single-choice
  radiogroup with the group's track, gliding chip and 28px item instead of a
  second copy.

  Additive forward-ports the closure needed from newer upstream versions of
  host-modified files, each a strict addition: `useFieldDisabled` and
  `FieldsetDisabledProvider` in `field-anatomy.tsx`, the exported
  `InputGroupContext` in `InputGroup.tsx`, `controlChrome.fieldTriggerBorder`
  in `recipes/control-chrome.ts`, the `--aui-control-mark-size-sm|md|lg` scale
  in `tokens.stylex.ts` (size tokens, not colors, so no theme carries them),
  and the `xs` size rung on the `stepper`, `stepper-indicator` and
  `stepper-trigger` theme targets.

- **Tree and TraceWaterfall (`.aui-source-selection.json`).** `Tree` (root,
  `Tree.model`, `Tree.keyboard`, `Tree.row`, `Tree.dnd`, `Tree.parts`, the
  `tree-styles`, `disclosure-chevron` and `selection-mark` recipes and
  `utils/tree-selection`) and `TraceWaterfall` (with `TraceWaterfall.styles`,
  `disclosure-group-toggle` and `utils/disclosure-group`) were installed from
  the ADS source bundle on 2026-11-03 and added to the selection manifest, whose
  `bundleIntegrity` is now the five-entrypoint bundle's. Before installing,
  `check_source_updates` against the unchanged selection manifest reported the
  same `sourceRevision`, 11 files current and 14 host-modified (the i18n
  changes above), so nothing upstream had moved. As with the rest of the
  family, only the 14 files absent from this copy were written; shared files
  kept their host versions, and the bundle's newer CSS sheets, `Menu` parts,
  `shortcut-keys` and theme-target files were not installed because nothing
  installed here imports them. Integrity values are PRISTINE upstream hashes.

  The agent tree (`src/components/session/WorkGraphTree.tsx`) is a treeview
  built on `Tree.model`'s `flattenVisibleTree`, `Tree.keyboard`'s key map and
  the `disclosure-chevron` recipe rather than on the `Tree` root: an agent row
  is a two-line card with its own controls, which the fixed-height,
  single-line `Tree.row` cannot hold. The Activity tab's Timeline view
  (`src/components/session/TurnTraceTimeline.tsx`) renders `TraceWaterfall`.

  Host modifications, kept when refreshing:

  - Every English string reads `i18n.t("ui:tree.*" | "ui:disclosureGroup.*" |
    "ui:traceWaterfall.*")`: the rename input's name and the move
    announcements in `Tree.parts`, `Tree.keyboard` and `Tree.dnd`, the
    expand/collapse-all control, and the waterfall's default label, span
    summary and expand/collapse names.
  - `TraceWaterfall` formats durations with the host's `formatDuration`
    (tenths under ten seconds), so a span reads like every other clock here.
  - `TraceWaterfall`'s rows are subgrids of the root's three columns. Each row
    used to be its own grid with a `max-content` trailing column, so a longer
    duration on one row narrowed that row's track and moved its bar off the
    shared axis.
  - `TraceWaterfall` gains three additive span/prop fields: `tone` (the bar's
    data-ink series: `chart1` default, `chart2`, `chart4` or `neutral`;
    `error` still wins), `trailing` (content before the duration figure) and
    `markerMs` (a vertical "now" line in `colorInfo` through every track; the
    axis stretches to include it). It sets `aria-pressed` only when the caller
    keeps a selection, and tags rows, names, bars and the marker with
    `data-trace-*` attributes for geometry tests.
  - `axisTicks` (host addition, off by default): a labelled time axis above
    the rows and a dashed rule through every track at each tick. The axis is
    a row of the same subgrid, so a label's x is the x its rule and any bar
    starting then are drawn at. `resolveTraceTicks` (`TraceWaterfall.ticks.ts`,
    re-exported) picks the smallest step on a readable ladder (0.1s … 30s, 1m,
    2m, 5m … 1h, then whole hours) that keeps four labels or fewer; labels use
    the same `formatDuration` as the spans. The Activity tab's Timeline turns
    it on.
  - A span's name keeps its room and its muted `meta` shrinks first; upstream
    held the meta at full width, so a long path cut the name to a letter.
  - The axis and bar math moved into exported `resolveTraceAxis` and
    `layoutTraceBar`, which the component calls and the host tests; the
    minimum bar width no longer runs a bar past the end of its track.
  - Comments naming other products, a parity claim and a tracker number in
    `Tree`, `Tree.row` and `TraceWaterfall.styles` were generalized.
  - Forward-port: the `head`, `summary` and `toggle` slots on the
    `trace-waterfall` theme target (`theme-targets.insight.ts`), a strict
    addition the newer upstream target carries and `TraceWaterfall` reads.

- **Meter, Progress and FileUpload (`.aui-source-selection.json`).** `Meter`
  and `Progress` (with their `headless/meter` and `headless/progress`
  primitives) and `FileUpload` (with `Attachment`, the row it lists files in)
  were installed from the ADS source bundle on 2026-11-03 and added to the
  selection manifest, whose `bundleIntegrity` is now the eight-entrypoint
  bundle's. The bundle reported the same `sourceRevision` as the installed
  selection, so nothing upstream had moved. Only the six files absent here were
  written; the rest of the closure (`agent-retry`, `agent-surface`,
  `surface-chrome`, `focus-ring`, `VisuallyHidden`, the theme props and the
  `meter`, `progress`, `file-upload` and `attachment` theme targets) already
  existed and kept its host versions. The bundle's CSS sheets and the
  `editing` and `graph` theme-target files were not installed because nothing
  installed here imports them. Integrity values are PRISTINE upstream hashes.

  `DatePicker` was evaluated in the same pass and not installed: its closure
  replaces this copy's host-modified `Calendar` with the newer split calendar
  (`Calendar.grid`, `Calendar.month`, `Calendar.nav`, `Calendar.nights`) and
  adds `Tooltip.base` and `native-select`. The usage view's range field
  (`src/components/usage/UsageDateRangeField.tsx`) composes the installed
  `Calendar` and the host popover instead.

  Host modifications, kept when refreshing:

  - `Meter` and `Progress` take a required `label` (the bundle defaulted to the
    English words "Meter" and "Progress"), and `Progress` reads its
    indeterminate value text and caption from `ui:progress.*`.
  - Both gain `size` (`md` default, the bundle's 10px and 8px tracks; `sm` a
    6px track for a table cell or a one-line row) and `hideValue` (the value
    stays in `aria-valuetext`, the visible figure goes, for a caller that
    prints the reading beside the bar). `Progress` gains `hideLabel`, the same
    clipped label `Meter` already had; with both hidden the header row is not
    rendered, so the bar is the whole surface.
  - `Meter` and `Progress` gain a `neutral` tone (the muted ink): a reading
    that is not yet a concern, or work that stopped without failing (a
    cancelled stage). The `meter` and `progress` theme targets' `tone` axes
    list it.
  - Both fills set `forced-color-adjust: none`, so forced colors do not paint
    the fill as Canvas and empty the track.
  - `FileUpload` and `Attachment` read every English default from
    `ui:fileUpload.*` (retry reads `ui:agentRetry.retry`), and `FileUpload`
    gains `actionLabel`: a "Choose file" affordance drawn inside the compact
    picker button, so it joins that button's name and Enter or Space on the
    row still opens the picker. The copy slot grows so the affordance sits at
    the row's end.

- `Table` gains two host extensions. `minInlineSize` (the table's width floor
  inside its frame; the bundle hard-codes 560px, and a narrow dialog or panel
  passes 0) forward-ports the newer upstream prop of the same name.
  `TableHead` gains `onSort` and `sortDirection`: with `onSort` the header's
  label becomes a button with a direction icon (both arrows dimmed while
  another column or none sorts, one arrow for the sorted column), and the
  cell states `aria-sort` (`none` until it is the sorted column). The caller
  owns the order and the cycle, so a table keeps its own unsorted order (the
  Fleet table's lanes) as the third state. The rest of the sort contract
  follows the ADS `DataTable`'s sortable header; `DataTable` itself is not
  installed because its closure needs a windowing package the host does not
  ship.

- ADS #809 (sendbird/atelier `feat/jacob/aui-reference-expansion`, head
  `ffa6bf15`; the ported files are byte-identical at `e8e58f34`, which only
  touched charts) was taken for the agent surfaces Tars uses. Consumer-change
  records: `2026-11-06-r0-system-foundation`, `2026-11-06-r1-controls`,
  `2026-11-07-r2-agent`, `2026-11-07-r3-conversation`. New files are listed in
  `.aui-source.json` with the sha256 of the upstream bytes; every one of them is
  host-modified as below, so the hashes are provenance, not checksums of the
  installed copies.

  Taken, additive:

  - Tokens: `colorTextFaint` (fourth ink, under 3:1, decorative marks only),
    `colorRing` (the resting edge paired with `elevationRaised`),
    `controlHeight2xs` (24px), `lineHeightProse` (22px), in `tokens.stylex.ts`,
    `themes.stylex.ts` and `theme-values.ts` for light, dark and high contrast.
    `src/components/system/aui-theme.ts` derives the two colors from every saved
    Stave theme (`colorTextFaint` = 46% `--background` into `--muted-foreground`,
    `colorRing` = 18% `--foreground` over transparent, #810 F3), so built-in
    and user themes need no new values.
  - Type roles as named steps: `fontSizeRow` (13px, upstream's new
    `fontSizeBody`) and `fontSizeSection` (15px), with `typeRoles.row`,
    `typeRoles.section` and `typeRoles.prose`.
  - Button `2xs` (24px in-surface secondary rung; `ButtonScale`,
    `buttonHeightStyles`, `buttonSquareStyles`, `buttonIconSizes`,
    `Button.sizeContext.ts`), applied as hunks. The `ui` adapter maps `2xs` and
    `icon-2xs`, and the `button` theme target's size axis lists `2xs`.
  - `RunMonitor` (+ `RunMonitor.styles.ts`, host split `RunMonitor.parts.tsx`)
    with `run-monitor` and `run-recap` theme targets.
  - `Approval` split into `Approval.types.ts`, `Approval.shared.tsx` and the
    scoped permission request `Approval.scoped.tsx` (`scopes`, `scope`,
    `defaultScope`, `onScopeChange`, `scopeLabel`, `allowLabel`, `icon`,
    `meta`, `footnote`, `ApprovalOutcome.scope`). Without `scopes` the
    transcript decision is unchanged.
  - `ToolRun.well.tsx`, `Plan.note.tsx`, `Checkpoint.row.tsx` and
    `Checkpoint.types.ts` (details in the host modifications below).

  Host-authored recipes derived from #809 rules, not upstream files:
  `recipes/raised-panel.ts` (ring + raised static panel, 13px rows with
  hairlines, faint ink, 15/500 section title), `recipes/text-wrap.ts` (the
  Korean line-break policy, `word-break: keep-all` + `overflow-wrap: anywhere`)
  and `recipes/composer-tray.ts` (the R3 tray composer's band, raised field,
  focus/hover ladder and footnote, lifted from `Composer.styles.ts` because the
  host composer is `PromptInput`, not the bundle's `Composer`; `PromptInput`
  reaches it with `minimal chrome="tray"`).

  Host modifications, kept when refreshing:

  - No English copy in these files. `RunMonitor` (every variant) takes a
    required `statusLabel` (the bundle's English `runStatusLabel` table was not
    installed) and read their other defaults from `ui:runMonitor.*` and
    `ui:runRecap.*`; scoped `Approval` reads `ui:approval.allow`,
    `ui:approval.scope` and the existing approval keys; `decisionWord` and the
    audit line keep their `ui:` keys in `Approval.shared.tsx`.
  - Button variant name `outline` (the bundle says `outlined`); `AgentStepState`
    (the bundle says `AgentRunState`).
  - `RunMonitor` draws its state tag with `StateMark` on a pill Badge
    (`RunStatusTag`), not a dot. Host extensions: `statusTag` (a domain's own
    tag), `workState` (the mark's state when the domain is finer than
    `status`), `actions` and `trailingActions` (footer slots for controls
    beyond Pause/Cancel), `logAriaLabel`, `progress.segments` + `stripLabel`
    (one labelled `<li>` per stage, including a `stopped` warning segment,
    instead of the anonymous `role="img"` strip) and `progress.label: false`
    (no readout rather than a guessed count). A settled current step draws its
    `StateMark`; only a live run shows the spinner. Titles and meta wrap instead
    of ending in an ellipsis, so the header aligns to the first line.
  - The recap claims no review state unless `review` is passed (upstream
    defaults to "not yet reviewed").
  - Scoped `Approval` keeps the host's `busy` prop (no `loading` alias) and
    restates the ring + raised edge on its card, because the installed
    `agentSurface.tile` still rests on `colorBorder`. The transcript layout
    keeps `density`, `allowOnceShortcut` and `risk`.
  - `ToolRun` gained `variant` ("well" | "row") but the host default stays
    "row" (upstream defaults to "well"), so the transcript keeps its look; the
    well reads `ui:toolrun.error` and draws the host `skipped` state as the
    neutral dash. `Plan` gained `kind: "note"` (`noteStatus`, `noteMeta`,
    `noteActions`), `appliedNote` and `titleHidden`, keeping `actions`,
    `count` and `current`; notes are not counted; the words read
    `ui:plan.appliedNote` / `ui:plan.applied`. `Checkpoint` gained
    `variant: "separator" | "row"` with `onBranch` and `ui:checkpoint.branch`;
    Branch uses `outline` on `2xs`. `Plan.schedule` was not installed (no
    consumer).
  - Every 13px use in a ported file reads `fontSizeRow` and every 14px use
    reads `fontSizeBody`, because the host did not move `fontSizeBody`.

  Not yet adopted (each is an upstream default change that would restyle
  existing screens): the 13px `fontSizeBody` / 20px `lineHeightNormal` body
  baseline and `styles.css` body size; `colorRing` + `elevationRaised` as the
  resting edge of fields, triggers, the `outline` Button, popups and static
  panels; the tray shell / inset workspace and 30px nav rows; ToolRun's `well` default;
  Composer and Suggestions (not installed; `Suggestions` chips stay with
  `ai-elements`); and the rest of #809's families (charts, DatePicker,
  FilterBar, FileUpload list, ProseDiff, Thread stream, Board agent columns).

- ADS #810–#813 (sendbird/atelier main `46a7ccd9`, 2026-11-08) were reviewed
  against the #809 port above. Consumer-change records read:
  `2026-11-08-f1-f2-type-and-shell`, `-f3-f5-interaction-and-alignment`,
  `-f4-f6-motion-and-dots`, `-f7-consolidation`, `-merge-duplicates`,
  `-agent-motion`, `-motion-pass`, `-motion-review-signature`,
  `-selection-and-row-actions`, `-soft-warm-palette`, `-point-colour-themes`.
  `.aui-source.json` records the `46a7ccd9` hashes for the files brought to
  main (`RunMonitor.tsx`, `RunMonitor.styles.ts`, `RunMonitor.recap.tsx`,
  `ToolRun.well.tsx`, `ToolRun.well.styles.ts`, `Plan.note.tsx`,
  `Plan.styles.ts`, `Checkpoint.row.tsx`, `Approval.scoped.tsx`,
  `Approval.shared.tsx`, `agent-motion.tsx`, `recipes/agent-motion.ts`); the
  other #809 entries keep their `ffa6bf15` hashes. All are host-modified.

  Taken:

  - Status chips are pills again (F1): `md` 24px, `sm` 20px, `radiusFull`,
    sans face inside mono rows. The host's 4px tag shape (`statusChip.tag*`,
    Badge `shape`) was removed with upstream's; every Tars consumer uses the
    plain Badge.
  - `colorRing` 18% (F3), in the token defaults and the theme derivation.
  - `RunRecap` merged into `RunMonitor variant="recap"` (F7 / merge
    duplicates); `RunMonitor.recap.tsx` carries the old host modifications and
    the `run-recap` theme target. `RunMonitorStepStatus` is Plan's step state
    narrowed to three; `planStatusLabel` reads `agentStateLabel` ("Completed").
  - The agent motion layer (`recipes/agent-motion.ts`,
    `components/agent-motion.tsx`) on RunMonitor (card and recap), ToolRun
    (row, group, well), Plan (steps, notes), Checkpoint (separator, row) and
    scoped Approval. Upstream's structure is kept (entrance scope, arrival
    rank, stagger, pulse, breathe, flow, bar, bar draw, live fill, tone,
    `useFlipReorder`; `agentStagger` gained a strict-index fallback), but the
    entrance, the status glyph swap, the label change and the current-step
    cue are HOST-AUTHORED replacements, not upstream code: rows fade in
    without travel and cards settle from 98% scale (`enter`, `enterCard`);
    a glyph grows from 70% while the old one shrinks out, no overshoot
    (`glyphIn`/`glyphOut`); a changed label fades in place after the old one
    has mostly gone (`AgentTextSwap`, `swapKey`, `textIn`/`textOut`, no
    travel, blur or width glide); a newly current step gets a one-shot tint
    that fades (`AgentHighlight`, `highlightKey`, `agentMotion.highlight`).
    Upstream's `AgentCollapse` and its collapse styles were not installed (no
    consumer). Do not take upstream's versions of these four motions when
    refreshing; keep the host ones. Rendered behaviour (one readable copy,
    the leaving copy dropped, Reduce Motion swapping in place) is covered by
    `tests/e2e/agent-motion.e2e.ts`.
  - Narrow-layout and fidelity fixes: RunMonitor and Approval titles wrap and
    the state badge never shrinks; a ToolRun well under 360px puts its summary
    on its own line; Plan `inset="flush"`; a one-line Plan step centres
    vertically; ToolRun well and Plan styles moved to upstream's split files.

  Host modifications:

  - Entrance motion never plays in the virtualized transcript.
    `src/components/session/transcript-entrance-scope.tsx` wraps the chat
    transcript, the recorded turn dialog, the task turn plan and the composer
    shelf plan in ADS `AgentEntranceScope`; besides leaf components, the
    containers (`ToolRun.Group` items, Plan steps and notes) skip their
    `useArrivalRank` cascade inside that scope, and Plan's running sweep and
    approval roll there play only after a real change (`useChangeCount > 0`).
    Upstream plays them on every mount, which replays on scroll and history
    load in a virtualized list. An open ToolRun payload body (row section and
    well plate) uses `useOpenBodyEntrance` (`ToolRun.parts.tsx`): inside the
    scope it enters only when the reader opened it after mount, so a body
    mounted `defaultOpen` (a running MCP App result) does not replay.
  - `RunMonitor` `current.key` (step id + attempt) restarts the sweep and
    rolls the label when the step changes; a JSX label has no text to key on.
  - `RunMonitor` rolls the state word keyed by the label, not `status`
    (Tars maps paused and blocked to one status), and sweeps/shimmers the
    current step only while the run is live (a settled step shows its
    StateMark and must not read as running).
  - Badge kept `outline` and `warm` here (both folded into `outlined` and
    `warning` with #811, see below); accent chips keep the host `accent`
    tokens (upstream's `control-on` role belongs to the point-colour layer,
    not installed).
  - Plan has no `AnimatedNumber` (not installed); the count is plain text.

  Adopted afterwards (user decision, 2026-11-08):

  - F3 field focus halo: `controlChrome.field` on `:focus-within` and the
    trigger keys (`fieldTriggerBorder`, new `fieldTriggerBorderReadOnly`,
    `triggerFocusBorder`) on `:focus-visible` paint
    `0 0 0 3px color-mix(in oklab, colorBorderFocus 25%, transparent)`, the
    field keys own their transition (150ms `ease-color`, box-shadow included,
    so the halo grows from 0), call sites no longer compose
    `transition.colors` after them, and `Textarea ringOwner="wrapper"` paints
    no inner shadow. Select uses the `fieldTriggerBorder(ReadOnly)` stack and
    `triggerError` focuses on `:focus-visible`. Host modifications: the halo
    colour is the theme's `--ring` (`aui-theme.ts`); text fields rest flat
    (upstream rests on `elevationRaised`); triggers keep the host's `:active`
    press collapse; `disabledField` keeps its shadow.
    `src/components/usage/UsageDateRangeField.tsx` hand-copied the Select
    trigger stack and was moved to the same keys. Test:
    `tests/aui-control-chrome.test.ts`. The host's global reduced-motion rule
    (`src/globals.css`, `transition-duration: 0.01ms`) still wins over the
    recipe's 80ms fade, so the halo appears at once under Reduce Motion.
  - Motion timing at #813's final state: `--atelier-motion-duration-normal`
    220ms, `-panel` 340ms, new `-tooltip` 100ms, `-spin` 600ms, `-signature`
    220ms; `ease-out` `cubic-bezier(0.22, 1, 0.36, 1)` with `ease-standard`
    and `ease-expressive` aliased to it; strong `ease-in-out`; new
    `ease-loop`, `ease-color`, `ease-spring`, `ease-spring-snappy`,
    `ease-signature` (and `--aui-motion-duration-spin`, `-ease-loop`,
    `-ease-color` in `tokens.stylex.ts`). Overlays enter and exit on the
    ease-out without overshoot (#813 reversed F4's overlay spring); drawers
    enter on the snappy spring; tooltips fade 100ms; toasts travel 8px;
    keyboard-opened/closed `CommandDialog` is instant (`data-instant`), and
    (host fix) choosing an item closes it the way it was chosen, Enter at
    once and a click with the fade (upstream leaves the open's mode in place;
    `tests/e2e/agent-motion.e2e.ts`);
    Reduce Motion keeps an 80ms opacity fade on overlays. Colour transitions
    (`transition.ts`) run 150ms on `ease-color`; every spinner turns once per
    600ms; disclosure chevrons rotate on `normal`. `transition.ts`,
    `motion-presets.ts`, `inline-disclosure-motion.css` and the three Loader
    style files are byte-identical to `46a7ccd9`. Host deltas in
    `overlay-motion.css`: the NavigationMenu arm and `.atelier-toast-stack-tight`
    are not installed (no component), and the top toast stack is listed in the
    reduced-motion guard (`tests/aui-motion-layer.test.ts`). Loop animations
    outside ADS read `ease-loop` (`chain-of-thought.styles.ts`). Test:
    `tests/aui-motion-spring-easing.test.ts` (with a host check that every
    `motionDurations` value equals its `--atelier-motion-duration-*`). Not
    taken: the sidebar signature bounce and `reveal-motion` (no host
    consumer), ToggleGroup chip settle and Gauge (not installed), and the
    Accordion/Collapsible chevron selector fix (`[data-panel-open]`), which
    is a behaviour fix to take separately.

  Not adopted (each restyles screens outside the agent surfaces, or replaces
  the host's colour authority):

  - F1's 14px body baseline is already the host's; the host keeps 13px rows on
    `fontSizeRow`. Heading/group-label/Alert/EmptyState sizing, the shell and
    LNB defaults (F2) and nav rows: the host shell is its own.
  - `check:interaction-states` (an upstream lint over its own components).
  - #812 selection grammar (selection ink/fill/edge tokens; colour, declined
    by the user) and 24px nested row actions (no host consumer).
  - #813 soft warm palette, chart walk, status tints and point-colour themes:
    saved Stave themes stay the colour authority (`aui-theme.ts`).
  - #811 alias removals: adopted afterwards (see the #811 and #814 entry).

- AUI #811 and #814 (sendbird/atelier main: "refactor(ads): merge same-role
  duplicates into their main form" and `3e9653d5` "refactor(aui)!: rename ADS
  to Atelier UI"), adopted 2026-11-09 at the user's request.

  - #811: every consumer moved to the main spelling and the duplicate was
    removed. Gone from this directory and its consumers: Button
    `variant="outline"`/`"danger"` (use `outlined`, `tone="danger"`),
    `size="icon*"` (use `iconOnly`), `tone="default"` (use `neutral`; still
    reflected as `data-tone="default"`), Badge `outline`/`warm` (use
    `outlined`/`warning`), `LoadingSurface` (use `Skeleton.Surface`,
    `components/Skeleton.surface.tsx`), `MeasuredSkeleton`,
    `TooltipIconButton` and `RunRecap`. No `@deprecated` alias is left in this
    directory. Button `floating` stays (not a duplicate). `size="icon-sm"`
    outside this directory belongs to the host's `src/components/ui/button.tsx`,
    not to AUI.
  - #814: browser keys, identifiers, paths and copy follow upstream. This
    directory is `src/components/aui`; `.aui-source*.json` replace
    `.ads-source*.json` (only paths and copy changed, so the recorded
    `integrity` values still name the pre-rename upstream bytes and most files
    will read as locally modified on the next update check); `--ads-*` →
    `--aui-*`, `data-ads-*` → `data-aui-*`, `ads-*` classes → `aui-*`; cascade
    layers `aui`, `aui.priority*` and `aui-theme` (`index.html`,
    `src/globals.css`, `styles.css`); the StyleX origin plugin is
    `scripts/vite-aui-stylex*.mjs` (`auiRoots`, origin `aui`, HMR event
    `aui-stylex:update`); the theme bridge is
    `src/components/system/aui-theme.ts` (`auiThemeVariables`); the dev preview
    is `?stavePreview=aui-regressions`; focused tests are `tests/aui-*.test.*`.
    Nothing renamed is persisted: no storage key, IPC channel or database value
    carried the old name.
  - Unchanged on purpose: history (this file's earlier entries keep "ADS #…",
    and `CHANGELOG.md`), quoted upstream commit titles such as
    `refactor(ads)!:`, and user-input test fixtures.
  - When refreshing, call `aui_check_source_updates`; upstream accepts the
    legacy `.ads-source.json` name only as a migration path, and this install
    already uses `.aui-source.json`.
