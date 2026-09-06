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

The shared UI layer and composer frame/control/option compositions have migrated
to this contract. Other product screens still contain utility syntax, recorded
per file in `config/style-utility-baseline.json`. Tailwind remains in the build
until those consumers and global directives migrate. A passing ratchet is not a
claim that the whole application has completed this transition.

## Ownership

The host-owned canonical source is in `src/components/ads`. It supplies tokens,
StyleX recipes, accessible component behavior, and theme context. Source version
and original integrity metadata live beside it in `.ads-source.json`.

`src/components/ui` preserves existing application imports and compound APIs.
Adapters compose canonical components or recipes; they must not create a second
visual language. `src/components/system` contains product-specific selection,
navigation, and workspace compositions built with canonical tokens.

Application routing, persisted settings, task drafts, provider state, menu
actions, and panel placement remain host-owned. Replacing a control must preserve
these contracts, including the composer lanes and configurable activity placement.

## Theme and layout

Saved theme colors and fonts remain authoritative in `src/lib/themes` and
`src/globals.css`. `src/components/system/ads-theme.ts` maps those roles to the
canonical variables and preserves the application's overlay stacking order.
Components import canonical tokens directly; do not introduce token aliases in a
new StyleX variable module.

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
holds workspace goals, decisions, and evidence; project memory has its own
collection controls. Library contains reusable instructions, task setups, and
scheduled work. There is no separate Knowledge or Today destination.

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
