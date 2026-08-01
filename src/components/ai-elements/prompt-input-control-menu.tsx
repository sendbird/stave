import { RotateCcw } from "lucide-react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Button } from "@/components/ui/button";
import {
  COMPOSER_CONTROL_DESCRIPTIONS,
  COMPOSER_CONTROL_IDS,
  COMPOSER_CONTROL_LABELS,
  composerControlPlacementOptions,
  DEFAULT_COMPOSER_CONTROL_PLACEMENT,
  normalizeComposerControlPlacements,
  type ComposerControlId,
  type ComposerControlPlacement,
  type ComposerControlPlacements,
} from "@/lib/composer-controls";
import { cn } from "@/lib/utils";

const PLACEMENT_LABELS: Record<ComposerControlPlacement, string> = {
  toolbar: "Bar",
  overflow: "Tray",
  hidden: "Off",
};

const PLACEMENT_HINTS: Record<ComposerControlPlacement, string> = {
  toolbar: "Always visible in the toolbar",
  overflow: "Tucked into the ⋯ tray",
  hidden: "Not rendered",
};

function PlacementSegments(args: {
  id: ComposerControlId;
  value: ComposerControlPlacement;
  onSelect: (placement: ComposerControlPlacement) => void;
}) {
  const options = composerControlPlacementOptions(args.id);
  return (
    <RadioGroup
      value={args.value}
      onValueChange={(placement: ComposerControlPlacement) =>
        args.onSelect(placement)
      }
      onKeyDownCapture={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const step =
          event.key === "ArrowDown" ||
          (event.key === "ArrowRight" && !rtl) ||
          (event.key === "ArrowLeft" && rtl)
            ? 1
            : event.key === "ArrowUp" ||
                (event.key === "ArrowLeft" && !rtl) ||
                (event.key === "ArrowRight" && rtl)
              ? -1
              : 0;
        if (!step) return;

        // Base UI provides the single tab stop and moves focus, but its radio
        // composite does not check the newly focused item. Keep the standard
        // radio-group contract: one Arrow key both moves and selects.
        const currentIndex = options.indexOf(args.value);
        const nextIndex =
          (currentIndex + step + options.length) % options.length;
        const nextPlacement = options[nextIndex];
        if (nextPlacement) args.onSelect(nextPlacement);
      }}
      aria-label={`${COMPOSER_CONTROL_LABELS[args.id]} placement`}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted/60 p-0.5"
    >
      {options.map((placement) => {
        const selected = placement === args.value;
        return (
          <Radio.Root
            key={placement}
            value={placement}
            title={PLACEMENT_HINTS[placement]}
            className={cn(
              "rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PLACEMENT_LABELS[placement]}
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}

/**
 * The one editor for composer control placement, rendered in three places: the
 * `⋯` tray footer, the toolbar's right-click menu, and Settings > Chat. Sharing
 * it is what keeps the tray from advertising a layout Settings disagrees with.
 */
export function ComposerControlPlacementList(args: {
  placements: ComposerControlPlacements;
  onChange: (next: ComposerControlPlacements) => void;
  /** Controls currently pulled back onto the toolbar by their own state. */
  forcedIds?: readonly ComposerControlId[];
  className?: string;
}) {
  const placements = normalizeComposerControlPlacements(args.placements);
  const forced = new Set(args.forcedIds ?? []);
  const isDefault = Object.keys(placements).length === 0;

  const setPlacement = (
    id: ComposerControlId,
    placement: ComposerControlPlacement,
  ) => {
    args.onChange(
      normalizeComposerControlPlacements({ ...placements, [id]: placement }),
    );
  };

  return (
    <div className={cn("flex flex-col gap-0.5", args.className)}>
      {COMPOSER_CONTROL_IDS.map((id) => {
        const value = placements[id] ?? DEFAULT_COMPOSER_CONTROL_PLACEMENT;
        return (
          <div
            key={id}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">
                {COMPOSER_CONTROL_LABELS[id]}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {forced.has(id)
                  ? `Showing now — ${COMPOSER_CONTROL_LABELS[id]} is active.`
                  : COMPOSER_CONTROL_DESCRIPTIONS[id]}
              </div>
            </div>
            <PlacementSegments
              id={id}
              value={value}
              onSelect={(placement) => setPlacement(id, placement)}
            />
          </div>
        );
      })}

      <p className="px-2 pt-1.5 text-xs text-muted-foreground">
        A control set to Tray or Off returns to the toolbar while it is active,
        so an armed Advisor or a forced Thinking mode is never running out of
        sight.
      </p>

      {isDefault ? null : (
        <div className="px-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => args.onChange({})}
          >
            <RotateCcw className="size-3" />
            Reset to defaults
          </Button>
        </div>
      )}
    </div>
  );
}
