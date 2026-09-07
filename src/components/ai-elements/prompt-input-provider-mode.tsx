import {
  Bot,
  Compass,
  type LucideIcon,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import type {
  ProviderModePresetDefinition,
  ProviderModePresetId,
  ProviderModePresentation,
} from "@/lib/providers/provider-mode-presets";
import {
  COMPOSER_OPTION_MENU_CONTENT,
  ComposerOptionCard,
} from "@/components/ai-elements/composer-option-menu";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { cx, sx } from "../ads/utils/stylex";
import { transition } from "../ads/recipes/transition";
import { providerModeStyles } from "./prompt-input-provider-mode.styles";

export type PromptInputProviderModeStatus = ProviderModePresentation & {
  providerLabel: string;
};

function modeIconToneStyle(status: Pick<PromptInputProviderModeStatus, "id">) {
  if (status.id === "manual") {
    return providerModeStyles.iconManual;
  }
  if (status.id === "guided") {
    return providerModeStyles.iconGuided;
  }
  if (status.id === "auto") {
    return providerModeStyles.iconAuto;
  }
  return providerModeStyles.iconCustom;
}

/*
 * Each arm states a per-mode `:hover` tone, and the class is handed to
 * `ComposerOptionChoice` as `activeClassName` — so the transition is composed
 * here, beside the paint it animates, rather than at the four JSX call sites
 * that only pass this function's result along.
 */
function modeOptionActiveClass(
  status: Pick<PromptInputProviderModeStatus, "id">,
) {
  if (status.id === "manual") {
    return sx(providerModeStyles.optionManual, transition.colors);
  }
  if (status.id === "guided") {
    return sx(providerModeStyles.optionGuided, transition.colors);
  }
  if (status.id === "auto") {
    return sx(providerModeStyles.optionAuto, transition.colors);
  }
  return sx(providerModeStyles.optionCustom, transition.colors);
}

function modeVisual(status: PromptInputProviderModeStatus): {
  icon: LucideIcon;
  summary: string;
} {
  if (status.id === "manual") {
    return {
      icon: Shield,
      summary: "Review-first setup",
    };
  }
  if (status.id === "guided") {
    return {
      icon: Compass,
      summary: "Balanced default",
    };
  }
  if (status.id === "auto") {
    return {
      icon: Bot,
      summary: "High autonomy",
    };
  }
  return {
    icon: SlidersHorizontal,
    summary: "Custom setup",
  };
}

export function PromptInputProviderModePill(args: {
  status: PromptInputProviderModeStatus;
  presets: readonly ProviderModePresetDefinition[];
  activePresetId: ProviderModePresetId | null;
  onSelect?: (presetId: ProviderModePresetId) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { icon: Icon } = modeVisual(args.status);
  const isInteractive =
    args.presets.length > 0 && typeof args.onSelect === "function";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            // The composer lane owns this control's box (height, gutters, and one
            // glyph size for every control in the row), so the glyph rule has to be a
            // default rather than a mandate: `layout="control"` applies ADS's own
            // unlayered `> svg` size and pinned this trigger to the `sm` ramp's 14px
            // while its `layout="host"` neighbours in the same wing rendered 16.
            layout="host"
            disabled={args.disabled || !isInteractive}
            aria-label={`${args.status.providerLabel} ${args.status.label}: ${args.status.description}`}
            title={`${args.status.label}: ${args.status.description}`}
            {...composerControlAttributes}
            className={cx(
              COMPOSER_CONTROL_BUTTON,
              sx(providerModeStyles.triggerPill),
              args.className,
            )}
          />
        }
      >
        <Icon
          className={sx(providerModeStyles.icon, modeIconToneStyle(args.status))}
        />
        <ComposerControlLabel>
          <span className={sx(providerModeStyles.label)}>
            {args.status.label}
          </span>
        </ComposerControlLabel>
      </PopoverTrigger>
      {isInteractive ? (
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          aria-label={`${args.status.providerLabel} mode presets`}
          xstyle={[COMPOSER_OPTION_MENU_CONTENT, providerModeStyles.popover]}
        >
          <div className={sx(providerModeStyles.optionList)}>
            {args.presets.map((preset) => {
              const presetStatus = {
                ...args.status,
                id: preset.id,
                label: preset.label,
                description: preset.description,
                planNote: undefined,
              } satisfies PromptInputProviderModeStatus;
              const { icon: PresetIcon, summary: presetSummary } =
                modeVisual(presetStatus);
              const isActive = args.activePresetId === preset.id;

              return (
                <ComposerOptionCard
                  key={preset.id}
                  label={preset.label}
                  summary={presetSummary}
                  description={preset.description}
                  icon={
                    <PresetIcon
                      className={sx(
                        providerModeStyles.icon,
                        modeIconToneStyle(presetStatus),
                      )}
                    />
                  }
                  active={isActive}
                  activeClassName={modeOptionActiveClass(presetStatus)}
                  checkClassName={sx(modeIconToneStyle(presetStatus))}
                  onSelect={() => {
                    args.onSelect?.(preset.id);
                    setOpen(false);
                  }}
                />
              );
            })}
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
