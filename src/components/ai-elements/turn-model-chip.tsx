import type { TurnModelInfoParts } from "@/lib/providers/turn-model-info";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cx, sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { ModelIcon } from "./model-icon";
import { turnModelChipStyles } from "./turn-model-chip.styles";

/**
 * Reuses the composer's existing role colors so a capability means the same
 * thing wherever it appears. Everything else stays neutral — colouring every
 * value would flatten the distinction instead of carrying it.
 */
const DETAIL_TONE_STYLES = new Map<string, StyleXValue>([
  ["fast", turnModelChipStyles.detailFast],
  ["thinking", turnModelChipStyles.detailThinking],
]);

/**
 * The model notation shown under a turn.
 *
 * Built like the composer's attachment chip: one bordered shell with a filled
 * background, holding inset segments. That structure is what lets a Cursor
 * turn's configuration read as discrete values instead of the raw
 * `model[key=value,...]` id the runtime actually uses.
 *
 * The name segment is the only one allowed to shrink, so a narrow column
 * truncates the model name rather than dropping the configuration that explains
 * how the turn ran.
 */
export function TurnModelChip(args: {
  providerId: ProviderId;
  model: string;
  parts: TurnModelInfoParts;
  className?: string;
}) {
  return (
    <span
      data-turn-model-chip="true"
      className={cx(sx(turnModelChipStyles.chip), args.className)}
    >
      <span className={sx(turnModelChipStyles.nameSegment)}>
        <ModelIcon
          providerId={args.providerId}
          model={args.model}
          className={sx(turnModelChipStyles.icon)}
        />
        <span className={sx(turnModelChipStyles.name)}>{args.parts.name}</span>
      </span>
      {args.parts.details.map((detail) => (
        <span
          key={detail}
          data-turn-model-detail={detail}
          className={sx(
            turnModelChipStyles.detail,
            DETAIL_TONE_STYLES.get(detail.toLowerCase()) ??
              turnModelChipStyles.detailNeutral,
          )}
        >
          {detail}
        </span>
      ))}
    </span>
  );
}
