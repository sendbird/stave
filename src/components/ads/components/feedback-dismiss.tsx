import { X } from "lucide-react";
import type * as React from "react";

import { controlIconSizes, controlSquares } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { surfaceChrome } from "../recipes/surface-chrome";
import { sx } from "../utils/stylex";

export type FeedbackDismissProps = {
  /** Accessible name for the control, in the host's words. */
  label: string;
  onDismiss: () => void;
};

/**
 * The dismiss control shared by `Alert` and `Banner`.
 *
 * It is the same 32px quiet icon button `DialogCloseButton` renders — same
 * `surfaceChrome.quietIconButton` chrome, same `controlSquares.sm` metric, same
 * ring, same `--ads-control-icon-size` glyph token. Three surfaces that all mean
 * "close this" must not be three hand-tuned buttons, and until now only the
 * Dialog had one at all: `Alert` and `Banner` were not dismissible, so every
 * consumer that needed a closable notice either kept it permanently on screen or
 * drew its own × outside ADS.
 *
 * `Callout` deliberately does NOT get this. It is an in-flow annotation inside a
 * reading column (docs notes, inline guidance); a note that the reader can
 * delete from the middle of a paragraph is not a state, and the family
 * difference is the intended one.
 */
export function FeedbackDismiss({
  label,
  onDismiss,
}: FeedbackDismissProps) {
  return (
    <button
      aria-label={label}
      className={sx(
        surfaceChrome.quietIconButton,
        controlSquares.sm,
        focusRing.ring,
      )}
      data-ads-control-icon-button="true"
      onClick={onDismiss}
      style={
        {
          "--ads-control-icon-size": controlIconSizes.md,
        } as React.CSSProperties
      }
      type="button"
    >
      <X aria-hidden />
    </button>
  );
}
