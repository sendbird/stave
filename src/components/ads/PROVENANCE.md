# Source provenance

This directory contains the canonical host-owned ADS source bundle retrieved through the ADS MCP on 2026-09-06. The original source paths, versions, dependency closure and integrity values are preserved in `.ads-source.json`.

The ADS owner explicitly authorized adoption and modification for Stave on 2026-09-06. The source bundle reports no package license; this record does not invent or replace that metadata. Preserve source notices when updating this copy.

Stave-specific theme mapping and compatibility adapters live in `../system` and `../ui`. Installed source includes the control, input, menu, overlay, navigation, feedback, and table families. Installation does not establish adoption: `config/design-system-migration.json` records consumed adapters and specialized engine boundaries.

Host modifications are intentional and retained when refreshing the bundle:

- TextField, Textarea, and Switch preserve host-provided validation and description ARIA attributes.
- Popover, Dialog, and Drawer expose surface styling separately from geometry, so existing hosts retain popup width, placement, scroll ownership, and nested drawer behavior.
- Badge, Breadcrumb, EmptyState, Table, Slider, Toggle, and Tooltip export their canonical styles for existing compound APIs.
- Calendar satisfies strict indexed access checks; malformed date keys resolve to an invalid date instead of assuming missing numbers exist.

The original integrity values remain source provenance, not hashes of modified host files. Do not overwrite a locally modified file merely because its current hash differs from the source bundle.

Additional control/sidebar and lightbox closures are recorded in
`.ads-source-controls.json` and `.ads-source-lightbox.json`. Only missing files
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
- ToastHost accepts an external canonical toast manager for store-originated
  notifications. Task navigation is an explicit visible action.
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
  `.ads-source*.json` entry — there is no upstream revision to record yet:
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
  existing file was touched. `.ads-source.json` records each one with the
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

- `ThemeProvider` publishes `--ads-selection-background` / `--ads-selection-color`
  from `colorText` / `colorTextInverted`, and `styles.css` no longer carries the
  per-`data-theme` oklch literals for them (upstream first; installed here as
  the same hunk). The literals were a copy of the three shipped themes, so they
  could not follow Stave's own saved themes at all: `StaveDesignProvider` maps
  the ADS color group onto `--foreground` / `--background`, and a workspace on a
  custom dark theme (`--foreground: #CCCAC2`) still had text highlighted in the
  design system's `oklch(0.985 0.007 89)`. Measured after: the pair resolves to
  `#CCCAC2` on `#242936`. ADS record:
  `consumer-changes/2026-09-07-selection-follows-theme-tokens.json`; the
  installed copy is guarded by `tests/ads-selection-tokens.test.ts`, because the
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
