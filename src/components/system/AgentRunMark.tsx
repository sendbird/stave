import * as stylex from "@stylexjs/stylex";
import { StateMark } from "@/components/ads/components/StateMark";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { toProviderWaveHueClass } from "@/components/ai-elements/provider-wave-tone.styles";
import { Loader } from "@/components/ui";
import type { LoaderVariant } from "@/components/ui/loader.types";
import type { RunIndicatorKind } from "@/lib/fleet/run-progress";
import type { ProviderId } from "@/lib/providers/provider.types";

/**
 * What a live turn is doing, on the surfaces that follow one turn closely (the
 * composer's run line and the turn activity header).
 */
export type AgentRunActivityKind = "thinking" | "tool" | "parallel" | "subagent";

export type AgentRunMarkKind =
  | Exclude<RunIndicatorKind, "none">
  | AgentRunActivityKind
  | "approval"
  | "needs-you";

/** The loader each moving kind draws, in the provider's ink. */
const ACTIVITY_LOADER: Record<AgentRunActivityKind | "working", LoaderVariant> = {
  // A row that shows one live agent, such as a sidebar workspace row.
  working: "matrix",
  // Nothing runs yet: the model is producing its next step.
  thinking: "pulse",
  tool: "steps",
  parallel: "parallel",
  subagent: "handoff",
};

/**
 * The one place that decides how agent work is drawn, wherever a run is shown:
 *
 * - `working`: the matrix loader in the provider's ink, for a row that only
 *   says an agent is live (the sidebar workspace row).
 * - `thinking`, `tool`, `parallel`, `subagent`: what a followed turn is doing,
 *   as the pulse, steps, parallel and handoff loaders in the provider's ink.
 * - `waiting`: the dots loader in a quiet ink, so a turn blocked on its
 *   helpers never reads as the turn itself working.
 * - `approval`, `needs-you`: the still state glyph. The turn waits on a person,
 *   and a held loader would read as a stuck turn.
 * - `stalled`: the static halted glyph in the warning state color. Nothing
 *   moves, because nothing has been reported.
 * - `busy`: the gray spinner, kept for Stave's own system work.
 *
 * Every loader holds still under reduced motion (the ADS loader contract), so
 * the words beside the mark carry the meaning.
 */
export function AgentRunMark(props: {
  kind: AgentRunMarkKind;
  providerId?: ProviderId | null;
  model?: string;
  size?: "xs" | "sm";
  /** Holds a moving mark on its current frame. */
  paused?: boolean;
  cadence?: "full" | "reduced";
  /** Ink for a working mark with no provider, such as a container row. */
  fallbackInkClassName?: string;
}) {
  const size = props.size ?? "xs";
  switch (props.kind) {
    case "stalled":
      return <StillMark kind="stalled" state="halted" size={size} />;
    case "approval":
      return <StillMark kind="approval" state="approval" size={size} />;
    case "needs-you":
      return <StillMark kind="needs-you" state="needs-you" size={size} />;
    case "busy":
      return (
        <Loader
          aria-hidden
          data-run-mark="busy"
          className={sx(styles.busy)}
          size={size}
          variant="spinner"
        />
      );
    case "waiting":
      return (
        <Loader
          aria-hidden
          data-run-mark="waiting"
          cadence={props.cadence}
          className={sx(styles.waiting)}
          paused={props.paused}
          size={size}
          variant="dots"
        />
      );
    case "working":
    case "thinking":
    case "tool":
    case "parallel":
    case "subagent":
      return (
        <Loader
          aria-hidden
          data-run-mark={props.kind}
          cadence={props.cadence}
          className={
            props.providerId
              ? toProviderWaveHueClass({ providerId: props.providerId, model: props.model })
              : props.fallbackInkClassName
          }
          paused={props.paused}
          size={size}
          variant={ACTIVITY_LOADER[props.kind]}
        />
      );
  }
}

/** A settled state glyph in the loader's box, so the row does not shift. */
function StillMark(props: {
  kind: "stalled" | "approval" | "needs-you";
  state: "halted" | "approval" | "needs-you";
  size: "xs" | "sm";
}) {
  return (
    <span data-run-mark={props.kind} className={sx(styles.slot, slotSize[props.size])}>
      <StateMark state={props.state} size="md" />
    </span>
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
