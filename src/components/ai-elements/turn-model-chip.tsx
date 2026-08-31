import type { TurnModelInfoParts } from "@/lib/providers/turn-model-info";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { ModelIcon } from "./model-icon";

/**
 * Reuses the composer's existing role colors so a capability means the same
 * thing wherever it appears. Everything else stays neutral — colouring every
 * value would flatten the distinction instead of carrying it.
 */
const DETAIL_TONE_CLASSES = new Map([
  [
    "fast",
    "border-prompt-role-fast/30 bg-prompt-role-fast/10 text-prompt-role-fast",
  ],
  [
    "thinking",
    "border-prompt-role-thinking/30 bg-prompt-role-thinking/10 text-prompt-role-thinking",
  ],
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
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-hidden rounded-sm border border-border/80 bg-secondary/50 p-0.5 align-middle",
        args.className,
      )}
    >
      <span className="flex h-6 min-w-0 items-center gap-1.5 px-1.5">
        <ModelIcon
          providerId={args.providerId}
          model={args.model}
          className="size-3.5 shrink-0"
        />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {args.parts.name}
        </span>
      </span>
      {args.parts.details.map((detail) => (
        <span
          key={detail}
          data-turn-model-detail={detail}
          className={cn(
            "flex h-6 shrink-0 items-center rounded-[0.32rem] border px-1.5 text-[11px] font-medium leading-none",
            DETAIL_TONE_CLASSES.get(detail.toLowerCase()) ??
              "border-border/45 bg-background/70 text-muted-foreground",
          )}
        >
          {detail}
        </span>
      ))}
    </span>
  );
}
