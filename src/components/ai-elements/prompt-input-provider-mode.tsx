import { i18n, useTranslation } from "@/i18n";
import {
  Bot,
  Compass,
  type LucideIcon,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { Fragment, useState } from "react";
import { PresetActionList } from "@/components/system/PresetActionList";
import type { ProviderId } from "@/lib/providers/provider.types";
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
  ComposerOptionRadioCard,
} from "@/components/ai-elements/composer-option-menu";
import { RadioGroupRoot } from "@/components/ads/headless/radio-group";
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
  /** Names the provider whose preset actions the open menu lists. */
  providerId?: ProviderId;
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
      summary: i18n.t("composer:promptInputProviderMode.summary"),
    };
  }
  if (status.id === "guided") {
    return {
      icon: Compass,
      summary: i18n.t("composer:promptInputProviderMode.summary2"),
    };
  }
  if (status.id === "auto") {
    return {
      icon: Bot,
      summary: i18n.t("composer:promptInputProviderMode.summary3"),
    };
  }
  return {
    icon: SlidersHorizontal,
    summary: i18n.t("composer:promptInputProviderMode.summary4"),
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
  useTranslation();
  const [open, setOpen] = useState(false);
  // The radio the arrow keys have moved to while the menu is open. It is not
  // applied until it is chosen (click, Space, Enter): browsing a more
  // permissive preset to read what it does must not grant it. Esc or a click
  // elsewhere leaves the preset as it was.
  const [browsedPresetId, setBrowsedPresetId] = useState<ProviderModePresetId | null>(null);
  const { icon: Icon } = modeVisual(args.status);
  const isInteractive =
    args.presets.length > 0 && typeof args.onSelect === "function";
  const shownPresetId = browsedPresetId ?? args.activePresetId;
  const choose = (presetId: ProviderModePresetId) => {
    if (presetId !== args.activePresetId) args.onSelect?.(presetId);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setBrowsedPresetId(null);
        setOpen(next);
      }}
    >
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
          aria-label={i18n.t("composer:promptInputProviderMode.ariaLabel", { value1: args.status.providerLabel })}
          xstyle={[COMPOSER_OPTION_MENU_CONTENT, providerModeStyles.popover]}
        >
          {/* One Tab stop; arrow keys move the radio and the action list
              follows it. A click, Space or Enter applies it and closes. */}
          <RadioGroupRoot
            aria-label={i18n.t("composer:promptInputProviderMode.ariaLabel", { value1: args.status.providerLabel })}
            className={sx(providerModeStyles.optionList)}
            value={shownPresetId ?? null}
            onValueChange={(value) => {
              if (typeof value === "string") setBrowsedPresetId(value as ProviderModePresetId);
            }}
          >
            {args.presets.map((preset) => {
              const presetStatus = {
                ...args.status,
                id: preset.id,
                label: preset.label,
                description: preset.description,
              } satisfies PromptInputProviderModeStatus;
              const { icon: PresetIcon, summary: presetSummary } =
                modeVisual(presetStatus);
              const isActive = shownPresetId === preset.id;
              const providerId = args.status.providerId;

              return (
                <Fragment key={preset.id}>
                <ComposerOptionRadioCard
                  value={preset.id}
                  checked={isActive}
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
                  activeClassName={modeOptionActiveClass(presetStatus)}
                  onChoose={() => choose(preset.id)}
                />
                {/* What the selected preset does on its own and what it
                    asks about, so the choice is not prose alone. */}
                {isActive && providerId ? (
                  <div className={sx(providerModeStyles.presetActions)}>
                    <PresetActionList
                      presetId={preset.id}
                      presetLabel={preset.label}
                      providerId={providerId}
                      providerLabel={args.status.providerLabel}
                    />
                  </div>
                ) : null}
                </Fragment>
              );
            })}
          </RadioGroupRoot>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
