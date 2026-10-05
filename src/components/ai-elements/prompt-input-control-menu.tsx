import { i18n, useTranslation } from "@/i18n";
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
import { cx, sx } from "../ads/utils/stylex";
import { focusRing } from "../ads/recipes/focus-ring";
import { controlMenuStyles } from "./prompt-input-control-menu.styles";

const PLACEMENT_LABELS: Record<ComposerControlPlacement, string> = {
  get toolbar() { return i18n.t("composer:promptInputControlMenu.toolbar"); },
  get overflow() { return i18n.t("composer:promptInputControlMenu.overflow"); },
  get hidden() { return i18n.t("composer:promptInputControlMenu.hidden"); },
};

const PLACEMENT_HINTS: Record<ComposerControlPlacement, string> = {
  get toolbar() { return i18n.t("composer:promptInputControlMenu.toolbar2"); },
  get overflow() { return i18n.t("composer:promptInputControlMenu.overflow2"); },
  get hidden() { return i18n.t("composer:promptInputControlMenu.hidden2"); },
};

function PlacementSegments(args: {
  id: ComposerControlId;
  value: ComposerControlPlacement;
  onSelect: (placement: ComposerControlPlacement) => void;
}) {
  useTranslation();
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
      aria-label={i18n.t("composer:promptInputControlMenu.ariaLabel", { value1: COMPOSER_CONTROL_LABELS[args.id] })}
      className={sx(controlMenuStyles.segmentGroup)}
    >
      {options.map((placement) => {
        const selected = placement === args.value;
        return (
          <Radio.Root
            key={placement}
            value={placement}
            title={PLACEMENT_HINTS[placement]}
            className={sx(
              controlMenuStyles.segment,
              focusRing.ring,
              focusRing.ringInset,
              selected
                ? controlMenuStyles.segmentSelected
                : controlMenuStyles.segmentUnselected,
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
  useTranslation();
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
    <div className={cx(sx(controlMenuStyles.list), args.className)}>
      {COMPOSER_CONTROL_IDS.map((id) => {
        const value = placements[id] ?? DEFAULT_COMPOSER_CONTROL_PLACEMENT;
        return (
          <div
            key={id}
            className={sx(controlMenuStyles.row)}
          >
            <div className={sx(controlMenuStyles.rowLabel)}>
              <div className={sx(controlMenuStyles.rowTitle)}>
                {COMPOSER_CONTROL_LABELS[id]}
              </div>
              <div className={sx(controlMenuStyles.rowDescription)}>
                {forced.has(id)
                  ? i18n.t("composer:promptInputControlMenu.copy", { value1: COMPOSER_CONTROL_LABELS[id] })
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

      <p className={sx(controlMenuStyles.footerNote)}>
        {i18n.t("composer:promptInputControlMenu.composerControlPlacementList")}</p>

      {isDefault ? null : (
        <div className={sx(controlMenuStyles.resetWrap)}>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={sx(controlMenuStyles.resetButton)}
            onClick={() => args.onChange({})}
          >
            <RotateCcw className={sx(controlMenuStyles.resetIcon)} />
            {i18n.t("composer:promptInputControlMenu.composerControlPlacementList2")}</Button>
        </div>
      )}
    </div>
  );
}
