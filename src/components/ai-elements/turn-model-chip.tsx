import { Zap } from "lucide-react";
import type { TurnModelInfoParts } from "@/lib/providers/turn-model-info";
import { classifyTurnModelDetail } from "@/lib/providers/turn-model-info";
import type { ProviderId } from "@/lib/providers/provider.types";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { agentSurface } from "@/components/ads/recipes/agent-surface";
import { cx, sx } from "@/components/ads/utils/stylex";
import { ModelIcon } from "./model-icon";
import { turnModelChipStyles } from "./turn-model-chip.styles";

/**
 * The model notation shown under a turn.
 *
 * A metadata row, not a chip: the same ink-and-register grammar as ToolRun.
 * The name stays proportional. Context windows (`1M`, `300K`) sit in the
 * machine register. Effort is muted caption text. Fast is the bolt only —
 * the accessible name on the wrapping action still says the word.
 *
 * The name is the only segment allowed to shrink, so a narrow column
 * truncates the model name rather than dropping the configuration that
 * explains how the turn ran.
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
      className={cx(sx(turnModelChipStyles.row), args.className)}
    >
      <span className={sx(turnModelChipStyles.nameSegment)}>
        <ModelIcon
          providerId={args.providerId}
          model={args.model}
          className={sx(turnModelChipStyles.icon)}
        />
        <span className={sx(turnModelChipStyles.name)}>{args.parts.name}</span>
      </span>
      {args.parts.details.map((detail) => {
        const kind = classifyTurnModelDetail(detail);
        if (kind === "fast") {
          return (
            <span
              key={detail}
              data-turn-model-detail={detail}
              className={sx(turnModelChipStyles.fast)}
            >
              <Zap className={sx(turnModelChipStyles.fastIcon)} aria-hidden />
              <VisuallyHidden>{detail}</VisuallyHidden>
            </span>
          );
        }
        return (
          <span
            key={detail}
            data-turn-model-detail={detail}
            className={sx(
              kind === "context"
                ? agentSurface.meta
                : turnModelChipStyles.detail,
              kind === "context" && turnModelChipStyles.context,
              kind === "thinking" && turnModelChipStyles.thinking,
            )}
          >
            {detail}
          </span>
        );
      })}
    </span>
  );
}
