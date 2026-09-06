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
