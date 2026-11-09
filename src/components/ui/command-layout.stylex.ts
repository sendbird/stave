import * as stylex from "@stylexjs/stylex";
import { vars } from "../aui/tokens/tokens.stylex";

export const commandDialogMarker = stylex.defineMarker();
export const commandItemMarker = stylex.defineMarker();
export const commandLayout = stylex.create({
  frame: { display: "flex", width: "100%", height: "100%", flexDirection: "column", overflow: "hidden" },
  palette: {
    top: "14vh", translate: "-50% 0", overflow: "hidden", borderRadius: vars["--aui-radius-panel"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border"],
    backgroundColor: vars["--aui-color-surface-raised"], padding: 0,
    maxHeight: { default: null, "@media (min-width: 640px)": "78vh" },
  },
  // The search gutter is AUI's: `Command.styles.inputGroup` already states
  // `paddingInline: space12`, the same value the list rows resolve to. Stating
  // `space16` here overrode it in the same `sx()` call, so the search field sat
  // one step further in than everything below it and read as a second inset
  // frame around the input.
  inputRow: { display: "flex", height: 52, flexShrink: 0, alignItems: "center", gap: vars["--aui-space-12"] },
  searchIcon: { width: vars["--aui-space-16"], height: vars["--aui-space-16"], flexShrink: 0, color: vars["--aui-color-accent"] },
  input: { height: "100%", minWidth: 0, flex: 1 },
  /**
   * Layout only: the visible keycap is an AUI `Kbd`, so this wrapper carries
   * nothing but the dialog-only reveal and its place in the input row.
   */
  escape: {
    display: { default: "none", [stylex.when.ancestor(":is(*)", commandDialogMarker)]: "inline-flex" },
    alignItems: "center", flexShrink: 0,
  },
  list: { scrollbarWidth: "none", maxHeight: "18rem", scrollPaddingBlock: vars["--aui-space-8"], overflowX: "hidden", overflowY: "auto", outlineStyle: "none" },
  // No `overflow` here. `overflow: hidden` on a flex item makes its automatic
  // minimum size 0, so a group inside the scrolling `list` column shrank below
  // its own grid rows and clipped them instead of letting the list scroll —
  // measured 5 rows summing 152px inside a 71px box, each group starting inside
  // the previous one's rows. Row-level truncation is `itemLabel`'s job.
  // Layout only, no gutter. The scrolling column already has exactly one:
  // `Command.styles.list` owns `padding: space4`, and a group repeating it
  // pushed every row a second step in, so the option list read as a frame
  // inside a frame. AUI's `group` contributes `gap` and `flexShrink: 0`; the
  // host adds nothing.
  group: {},
  separator: { marginInline: -4, height: 1, width: "auto", backgroundColor: vars["--aui-color-border"] },
  item: {
    pointerEvents: { default: null, ':is([data-disabled="true"])': "none" },
    opacity: { default: 1, ':is([data-disabled="true"])': vars["--aui-opacity-disabled"] },
    backgroundColor: { default: "transparent", ':is([data-selected="true"])': vars["--aui-color-selection-fill"] },
    // Restate the AUI item's resting color rather than unsetting it: `null`
    // deletes `Command.styles.item`'s `color`, dropping the row out of the
    // design-system contract and onto whatever the popup happens to inherit.
    color: { default: vars["--aui-color-text"], ':is([data-selected="true"])': vars["--aui-color-text"] },
  },
  checkedIcon: {
    marginInlineStart: "auto",
    opacity: { default: 0, [stylex.when.ancestor(':is([data-checked="true"])', commandItemMarker)]: 1 },
    display: { default: null, [stylex.when.ancestor(':has([data-slot="command-shortcut"])', commandItemMarker)]: "none" },
  },
  shortcut: { alignItems: "center", display: "inline-flex", flexShrink: 0, marginInlineStart: "auto" },
});
