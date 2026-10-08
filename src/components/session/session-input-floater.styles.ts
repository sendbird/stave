import * as stylex from "@stylexjs/stylex";

import { cx, sx } from "@/components/ads/utils/stylex";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";

const sessionInputFloaterStyles = stylex.create({
  /**
   * Outer floating wrapper. Clicks fall through until an inner card opts back
   * in with `pointerEvents: "auto"`.
   */
  floatingWrapper: {
    pointerEvents: "none",
    position: "absolute",
  },
});

// Float cards above chat-input chrome (session-floater layer) and any shell
// blur/fade treatment. The outer wrapper keeps pointer events off so clicks
// fall through until an inner card explicitly opts back in.
export const SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME =
  cx(
    sx(sessionInputFloaterStyles.floatingWrapper),
    UI_LAYER_CLASS.sessionFloater,
  ) ?? "";
