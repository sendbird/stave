import * as stylex from "@stylexjs/stylex";
import { StateMark } from "@/components/ads/components/StateMark";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { toProviderWaveHueClass } from "@/components/ai-elements/provider-wave-tone.styles";
import { Loader } from "@/components/ui";
import type { RunIndicatorKind } from "@/lib/fleet/run-progress";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * The one mark for agent work, wherever a run is shown:
 *
 * - `working`: the matrix loader in the provider's ink.
 * - `waiting`: the dots loader in a quiet ink, so a turn blocked on its
 *   helpers never reads as the turn itself working.
 * - `stalled`: the static halted glyph in the warning state color. Nothing
 *   moves, because nothing has been reported.
 * - `busy`: the gray spinner, kept for Stave's own system work.
 *
 * Every loader holds still under reduced motion (the ADS loader contract).
 */
export function AgentRunMark(props: {
  kind: Exclude<RunIndicatorKind, "none">;
  providerId?: ProviderId | null;
  model?: string;
  size?: "xs" | "sm";
  /** Holds a working or waiting mark on its current frame. */
  paused?: boolean;
  cadence?: "full" | "reduced";
  /** Ink for a working mark with no provider, such as a container row. */
  fallbackInkClassName?: string;
}) {
  const size = props.size ?? "xs";
  if (props.kind === "stalled") {
    return (
      <span data-run-mark="stalled" className={sx(styles.slot, slotSize[size])}>
        <StateMark state="halted" size="md" />
      </span>
    );
  }
  if (props.kind === "busy") {
    return (
      <Loader
        aria-hidden
        data-run-mark="busy"
        className={sx(styles.busy)}
        size={size}
        variant="spinner"
      />
    );
  }
  const waiting = props.kind === "waiting";
  const ink = waiting
    ? sx(styles.waiting)
    : props.providerId
      ? toProviderWaveHueClass({ providerId: props.providerId, model: props.model })
      : props.fallbackInkClassName;
  return (
    <Loader
      aria-hidden
      data-run-mark={props.kind}
      cadence={props.cadence}
      className={ink}
      paused={props.paused}
      size={size}
      variant={waiting ? "dots" : "matrix"}
    />
  );
}

const styles = stylex.create({
  slot: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
  },
  busy: { color: vars["--ads-color-text-muted"] },
  waiting: { color: vars["--ads-color-text-subtle"] },
});

const slotSize = stylex.create({
  xs: { blockSize: 16, inlineSize: 16 },
  sm: { blockSize: 20, inlineSize: 20 },
});
