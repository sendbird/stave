import * as stylex from "@stylexjs/stylex";

import { vars } from "@/components/ads/tokens/tokens.stylex";

/** The project picker at the top of Settings > Projects. */
export const settingsProjectPickerStyles = stylex.create({
  field: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    marginBlockEnd: vars["--ads-space-16"],
    maxInlineSize: "28rem",
  },
  label: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  trigger: {
    inlineSize: "100%",
  },
});
