import * as stylex from "@stylexjs/stylex";

import { vars } from "../tokens/tokens.stylex";

/**
 * The action-group gap (2026-11-16): two values, chosen by what the group
 * holds.
 *
 * - `icons` — 4px between icon-only buttons (a toolbar, a row's trailing
 *   actions, a saved-view strip's tools): square targets read as one tool set
 *   at 4px and as scattered buttons at 8.
 * - `buttons` — 8px between labelled buttons and controls (dialog and drawer
 *   footers, page-header actions, a filter row, a table toolbar).
 *
 * Measured on 2026-11-15 action groups used 2, 4, 8 and 12px, and the
 * `DataTable` toolbar spaced its controls 12px apart directly above a
 * `FilterBar` row that used 8. A segmented `ButtonGroup`'s 2px seam is not an
 * action gap: it joins the halves of one control.
 *
 * Compose on the flex row that holds the actions, after its layout style.
 */
export const actionGap = stylex.create({
  icons: {
    gap: vars["--aui-space-4"],
  },
  buttons: {
    gap: vars["--aui-space-8"],
  },
});
