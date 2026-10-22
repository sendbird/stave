# Stave design system

## Authoring contract

The target is one Stave design system: ADS tokens, StyleX declarations, and shared
state/focus/motion recipes across both installed and custom components. Existing
compound APIs can remain when useful. Removing a component because of its origin
is not the goal; removing competing utility syntax is.

Do not author Tailwind strings, CVA variants, or runtime utility translators.
Put styles beside their component, name them for the element or state they serve,
and merge conditional styles in one `sx`/`stylex.props` call. `className` remains
an integration hook. Where a caller changes a shared surface's geometry, use its
`xstyle` prop so StyleX resolves overrides before emitting class names.

Global CSS is limited to resets, existing animation/engine integration, and
rich-text or third-party descendants that cannot accept StyleX props. A CSS
boundary must use semantic selectors, not utility-class dependencies.

Every product surface now follows this contract, and Tailwind is no longer part
of the build. `config/style-utility-baseline.json` keeps an empty `files` list,
so new utility syntax anywhere fails the ratchet. Its `dataLiterals` entries
record the few string literals that only look like utility classes, such as
class names matched on external pages.

## Ownership

The host-owned canonical source is in `src/components/ads`. It supplies tokens,
StyleX recipes, accessible component behavior, and theme context. Source version
and original integrity metadata live beside it in `.ads-source.json`.
`package.json` must declare that bundle's dependency closure — including the
webfont packages imported by `fonts.css` — so a clean install can resolve those
CSS files.

`src/components/ui` preserves existing application imports and compound APIs.
Adapters compose canonical components or recipes; they must not create a second
visual language. `src/components/system` contains product-specific selection,
navigation, and workspace compositions built with canonical tokens.

Application routing, persisted settings, task drafts, provider state, menu
actions, and panel placement remain host-owned. Replacing a control must preserve
these contracts, including the composer lanes and configurable activity placement.

## Semantic layers

Each layer builds only on the layers before it. A new surface starts from the
highest layer that already says what it needs and adds to that layer, never
below it.

### Foundations: theme roles and state tokens

Theme roles (`background`, `card`, `foreground`, `primary`, `destructive`,
`warning`, `success`, `info`, the chart colors and the rest of
`src/lib/themes/types.ts`) are the only colors. `src/components/system/ads-theme.ts`
maps them onto the canonical variables that components read through `vars`.

Agent work states have their own tokens: `--state-running`,
`--state-needs-answer`, `--state-paused`, `--state-halted`,
`--state-completed` and `--state-stopped`. Failed keeps the destructive role.
They exist because several themes paint their accent and warning, or their
primary and success, the same hue, so a state cannot borrow those roles.
`src/lib/themes/state-colors.ts` derives them from a theme's own colors
(needing an answer and halted from warning, completed from success, paused and
stopped from the muted text, running from the first of primary, info and the
chart colors that stays apart from the others) and checks them: the pairs in
`DISTINCT_STATE_COLOR_PAIRS` keep an OKLab distance of at least
`STATE_COLOR_MIN_DISTANCE`, glyphs reach 3:1 and state text 4.5:1 on the card.
A built-in theme that fails sets the failing state color by hand, and
`tests/theme-state-colors.test.ts` checks every built-in theme. User themes get
the same derivation when applied.

Tones have one vocabulary: `Tone` in `src/components/ads/utils/tone.tsx`, the
seven values `StatusDot` draws (`neutral`, `muted`, `accent`, `info`, `warning`,
`success`, `danger`). A product type that means a tone is `Tone` or an
`Extract<Tone, …>`; a work state is a `*State` drawn through `StateMark`; an
identity or a category (a provider, the PR status palette, folder colors, a
diff side) is a `*Hue`. A reading that turns into a tone at thresholds (usage,
context, quota, budget) goes through `thresholdTone` with its scale written
out as named data. `tests/tone-vocabulary.test.ts` fails when a new `…Tone`
type declares its own values.

### Primitives: ADS components

`src/components/ads/components` holds the canonical components. Controls
(`Button`, `Select`, `Checkbox`, `Switch`, `TextField`), surfaces (`Card`,
`Dialog`, `Popover`, `Drawer`), feedback (`Banner`, `EmptyState`,
`LoadingSurface`, `Toast`) and the agent-facing pieces (`Approval`,
`Clarification`, `Plan`, `DiffViewer`, `FileChangeSummary`, `ToolRun`) know
nothing about Stave's data and carry no English copy of their own: the host
passes words in. `src/components/ui` adapts them to existing imports.

### Work components

Work components give a primitive Stave's meaning, so every surface says the
same thing the same way.

- A state is drawn with `StateMark` (`src/components/ads/components/StateMark.tsx`).
  It takes a `WorkState` from the vocabulary in `state-vocabulary.ts` and draws
  its glyph in its state token, optionally with its word; only `working`
  moves, and reduced motion keeps it still. Each domain keeps its own state
  type and maps it to a `WorkState`, as Fleet rows, run badges, the task panel
  and the sidebar do. The path for a new state display is token, then
  `WorkState`, then `StateMark`: never paint a state with a role color, and
  never draw a second glyph set.
- A panel that reads data renders through `AsyncBoundary`
  (`src/components/system/AsyncBoundary.tsx`, which fills the ADS boundary
  with Stave's words). It tells four things apart: a read that is running
  (pending), a read that failed before anything loaded (an error with Retry),
  a read that answered with nothing (empty), and data. A failed refresh keeps
  the last data on screen under a banner instead of wiping it. A failed read
  is never shown as empty, zero, off or "not connected". `panelLoadState` maps
  a panel that tracks its own `loaded`, `loading` and `error` flags onto the
  boundary; a store that keeps the last list after a failure marks when that
  list was read (the skill catalog's `loadedAt` is an example).
- A provider is drawn with `ProviderMark` (`src/components/system/ProviderMark.tsx`):
  the vendor's SVG where Stave ships one, otherwise its monogram in the
  provider's ink on a tint of that ink. It is decorative (`alt=""`,
  `aria-hidden`) unless given a `label`, which becomes a hover title and
  visually hidden text. Sizes are `xs` (10px, an avatar corner), `sm` (14px,
  beside a name) and `md` (16px, rows and pickers); `ModelIcon` is the same mark
  under its older name. Provider ink comes from `providerInkStyles`
  (`provider-ink.styles.ts`) or `providerInkColor`, both read from the provider
  identity registry; never write a `--provider-*` value anywhere else.

### Patterns

Patterns combine work components into the moments an agent workflow repeats.

- Resume: picking work back up starts from what is known. Fleet puts the
  decisions waiting on you in a bounded band on top (`FleetAttentionInbox`,
  rows drawn by `InboxRow`, the same row the notification bell uses), where a
  short question or an approval is answered in its row, and the board of
  running work below it, where each running task says what it last did
  (`FleetTaskActivityLine`). `WorkspaceResumeBrief` keeps a workspace's shared
  instructions across its tasks.
- Review: work is checked against what it produced. `DiffViewer` and
  `FileChangeSummary` show what changed, review comments are anchored to the
  lines they are about, and `TaskResultReviews` keeps each run's saved answer,
  files and run details.
- Approval: a waiting agent asks where the answer is given.
  `ChatInputApprovalQueue` holds tool approvals in the composer, `SignOffCard`
  holds an agent run's sign-off in the same place, and `Approval` and `Clarification`
  show the gate or the question on its step in the conversation. Elsewhere
  the waiting reads as the `approval` or `needs-you` state, drawn with
  `StateMark`.
- Recovery: a failure says what failed and offers the next step.
  `ProviderErrorRecovery` continues a turn a provider failed, and
  `AsyncBoundary` retries a failed read or keeps the last result after one.

## Theme and layout

Saved theme colors and fonts remain authoritative in `src/lib/themes` and
`src/globals.css`. `src/components/system/ads-theme.ts` maps those roles to the
canonical variables and preserves the application's overlay stacking order.
Components import canonical tokens directly; do not introduce token aliases in a
new StyleX variable module.

Agent work state colors are a foundation of their own; see Semantic layers.

The CSS layer order is explicit: theme and resets, canonical component layers,
then host integration styles and the remaining legacy utilities. Host width, padding, and positioning
must remain effective when a primitive is replaced. Popover, Dialog, and Drawer
separate surface styling from geometry for this reason. Verify nested overlays,
small panels, keyboard focus, and custom theme changes in the built renderer.

## Compatibility contracts

- Composed menu triggers retain their supplied control's geometry. Standalone
  labels use the canonical label recipe without requiring a group context.
- Input and textarea adapters preserve external description and validation ARIA
  attributes. Standalone controls and input-group controls share the same source.
- Tooltips and popovers preserve host portal, collision, and focus settings.
- Command, Calendar, ToastHost, Sidebar, and Lightbox now use canonical behavior.
  Command adapts compound children and host filtering to ADS Autocomplete;
  notification producers use a shared ADS manager with stable identifiers.
  Calendar supports the product's single-date selection and deselection.
  The retired command, date-picker, and notification packages are removed.
- SidebarProvider supplies context; Settings explicitly owns its horizontal
  layout. SidebarMenuButton receives icons and badges through their named slots.
- High-priority notifications use the canonical live announcement and F6 focus
  path before keyboard activation of an action.

## Product destinations

Fleet presents work across workspaces. Tasks select and organize work. Information
holds workspace goals, decisions, and evidence; repository memory has its
own collection controls. Schedules run repeatable agent work and keep run
history. There is no separate Knowledge or Today destination.

Workspace tools support finding an action, running it, and reading its selected
output. Search crosses process and command categories without discarding the
current tab or unfinished forms. Lens feedback belongs to the task draft: editing
the requested change preserves captured evidence and never sends a task.

## Migration and integration checks

Run `bun run check:design-system` after changing shared components. Its per-file
ratchet rejects new utility syntax, reintroduced legacy recipes, and missing canonical dependencies.
It is an architecture check, not a visual approval. Pair it with typecheck, theme
tests, and the affected rendered workflow.

When integrating another active workspace, retain that workspace's new controls
and state behavior, then map them through these adapters. Resolve shared component
conflicts centrally; do not copy old primitive implementations back into product
files. Re-run that workspace's functional checks and the shared theme and overlay
checks after integration.

## Product control completion

Product action elements use canonical Button. Its host layout preserves the
existing child DOM, form type, event handlers, and dimensions for rows, tabs,
custom tool controls, and composer lanes. ADS supplies focus, interaction states,
and accessible button behavior; the host continues to own product composition.
The syntax-aware native-button gate covers existing and new product files,
preventing those surfaces from quietly returning to independent controls. This is not a claim that a row was redesigned merely
because its button implementation changed.

Text inputs, textareas, native select fields, and visible checkboxes use canonical
controls. Hidden native file inputs and the input semantics inside custom radio
or mixed-choice cards remain intentional host integrations: their invisible DOM
provides form and accessibility behavior, not a separate visual component system.
Editor, dock, PTY, virtualized history, and guest-page engines remain product
infrastructure; replacing them with visual previews would remove functionality.

Lens saves captured feedback metadata only on user display parts in the existing
conversation. Provider request parts remain separate. After sending, the latest
feedback for the same workspace and Lens session is available beside the live
preview, including the original image, request, captured page link, and reload.
Images open in the canonical zoomable lightbox. Older conversations without this
metadata do not invent a historical capture. Clearing draft attachments alone
never creates a sent-feedback record.
