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

- Design tokens moved from StyleX-hashed `defineVars` keys to explicit CSS
  custom property names: `vars.colorText` is now `vars["--ads-color-text"]`, and
  the emitted variable is the literal `--ads-color-text` instead of a hash. The
  rename is total and derivable (camelCase to kebab, `--ads-` prefix, a break
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
  `../system/ads-theme.ts` onto Stave's own semantic colors and so do not move;
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

- StyleX is now compiled per ORIGIN. `scripts/vite-ads-stylex.mjs` and its
  `.core.mjs`/`.d.mts` siblings replace `stylex.vite()` in `vite.config.ts` and
  `electron.vite.config.ts`: ADS modules (everything under this directory, named
  by `adsRoots`) keep StyleX's default `x` class name prefix, everything else
  compiles under `p`, and each origin's rules are emitted as
  `@layer ads.priority*` / `@layer product.priority*`. An atomic class is a pure
  function of its declaration, so ADS and product code writing the same
  declaration used to produce the SAME class and therefore one cascade
  position; distinct prefixes are what let the two origins hold different ones.
  The canonical order is now
  `reset, theme, base, ads, ads-theme, product, components, utilities`, stated
  identically in `index.html`, `src/globals.css` and this directory's
  `styles.css`, and enforced by `scripts/check-design-system-migration.mjs`.
  `ads-theme` ships empty; it is the seam a brand recipe would occupy.
  Measured on the dev server against a rendered ADS Button whose own
  `padding-inline` is 12px: a rule in `ads-theme` renders 33px, the same rule
  with a product-layer rule renders 41px. ADS record:
  `consumer-changes/2026-09-09-stylex-origin-layers.json`; the compatibility
  test for the `@stylexjs/unplugin` internals this reaches is
  `tests/stylex-origin-layers.test.mjs`, which must pass after any StyleX
  upgrade (the dependency is pinned to 0.19.0 exactly for this reason).

  Two deliberate departures from the upstream instructions. The origin
  classifier has no built-in ADS root, because upstream's default is its own
  workspace package path and this is a source install; `adsRoots` is the only
  thing that names ADS here. And `adsCascadeLayers()` is not installed: the
  `#stave-style-layers` block in `index.html` already publishes the statement
  ahead of every bundled sheet, which is the same mechanism, and the migration
  gate already compares it against `src/globals.css`.

  `src/main.tsx` no longer imports `virtual:stylex:runtime`. That module is
  served by `@stylexjs/unplugin`'s own Vite adapter, which this plugin replaces;
  `adsStylex` injects the equivalent `/virtual:ads-stylex.css` link and dev
  client itself. Left in place it is an unresolvable import and the dev server
  returns 500 on the entry module.

- Not yet adopted from `consumer-changes/2026-09-09-layered-motion-and-font-imports.json`:
  the ADS motion sheets and `fonts.css` are still imported UNLAYERED here.
  Unlayered declarations outrank every layer, which is their behaviour today, so
  annotating them `layer(ads)` would move them below product StyleX — a real
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
