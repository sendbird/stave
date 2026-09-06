import { Button as AdsButton } from "@/components/ads/components/Button";
import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  clampModelEffort,
  getModelEffortLabel,
  listModelEffortOptions,
  type ModelEffort,
} from "@/lib/providers/model-effort";
import {
  getProviderLabel,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import { cx, sx } from "@/components/ads/utils/stylex";
import { modelSelectorStyles as styles } from "./model-selector.styles";
import { ChoiceChips } from "@/components/system/ChoiceChips";
import { ModelIcon } from "./model-icon";
import {
  shouldOpenModelSelector,
  type ModelSelectorOption,
} from "./model-selector.utils";

export {
  buildAutoModelSelectorOption,
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  type ModelSelectorOption,
} from "./model-selector.utils";

interface ModelSelectorProps {
  value: ModelSelectorOption;
  options: readonly ModelSelectorOption[];
  recommendedOptions?: readonly ModelSelectorOption[];
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  triggerAriaLabel?: string;
  menuClassName?: string;
  openToken?: string | number;
  /**
   * Opt-in effort axis. When provided, the trigger shows `model · effort` and
   * the dialog gains an effort row; picking a model re-clamps the effort to a
   * value that model accepts before it reaches `onSelect`.
   */
  effort?: ModelEffort;
  onSelect: (args: {
    selection: ModelSelectorOption;
    effort?: ModelEffort;
  }) => void;
}

export function ModelSelector(args: ModelSelectorProps) {
  const {
    value,
    options,
    recommendedOptions = [],
    disabled,
    className,
    triggerClassName,
    triggerAriaLabel,
    menuClassName,
    openToken,
    effort,
    onSelect,
  } = args;
  const [open, setOpen] = useState(false);
  // Seed the handled token with the value present at mount time. `openToken` is
  // a one-shot "open now" trigger owned by the parent, but the parent keeps the
  // latched value across the selector's mount/unmount cycles (e.g. when an
  // interactive question card replaces and then restores the composer). Starting
  // from `undefined` would make a stale, already-consumed token look brand new on
  // remount and pop the selector open unexpectedly. Treating the mount-time token
  // as already handled means we only auto-open when it changes *after* mount.
  const handledOpenTokenRef = useRef<string | number | undefined>(openToken);
  const recommendedOptionKeys = useMemo(
    () => new Set(recommendedOptions.map((option) => option.key)),
    [recommendedOptions],
  );
  const autoOptions = useMemo(
    () => options.filter((option) => option.isAuto),
    [options],
  );

  const groupedOptions = useMemo(() => {
    const groups: Record<string, ModelSelectorOption[]> = {};
    for (const option of options) {
      if (option.isAuto || recommendedOptionKeys.has(option.key)) {
        continue;
      }
      const bucket = groups[option.providerId] ?? [];
      bucket.push(option);
      groups[option.providerId] = bucket;
    }
    return listProviderIds()
      .map((providerId) => [providerId, groups[providerId] ?? []] as const)
      .filter(([, providerOptions]) => providerOptions.length > 0);
  }, [options, recommendedOptionKeys]);

  const effortEnabled = effort !== undefined && !value.isAuto;
  const effortOptions = useMemo(
    () =>
      effortEnabled
        ? listModelEffortOptions({
            providerId: value.providerId,
            model: value.model,
          })
        : [],
    [effortEnabled, value.model, value.providerId],
  );
  const effortLabel = effortEnabled
    ? getModelEffortLabel({
        providerId: value.providerId,
        model: value.model,
        effort,
      })
    : undefined;

  const selectOption = (option: ModelSelectorOption) => {
    onSelect({
      selection: option,
      ...(effort !== undefined
        ? {
            effort: option.isAuto
              ? effort
              : clampModelEffort({
                  providerId: option.providerId,
                  model: option.model,
                  effort,
                  fallback: effort,
                }),
          }
        : {}),
    });
    setOpen(false);
  };

  const renderOption = (option: ModelSelectorOption) => (
    <CommandItem
      key={option.key}
      value={`${option.label} ${option.model} ${getProviderLabel({ providerId: option.providerId, variant: "full" })}${option.description ? ` ${option.description}` : ""}`}
      disabled={!option.available}
      data-checked={option.key === value.key ? "true" : undefined}
      onSelect={() => selectOption(option)}
      className={sx(styles.optionItem)}
    >
      {option.isAuto ? (
        <Sparkles className={sx(styles.optionAccentIcon)} />
      ) : (
        <ModelIcon
          providerId={option.providerId}
          model={option.model}
          className={sx(styles.optionIcon)}
        />
      )}
      <div className={sx(styles.optionBody)}>
        <span className={sx(styles.optionTitleRow)}>
          <span className={sx(styles.optionLabel)}>{option.label}</span>
          {option.isDefault ? (
            <span className={sx(styles.optionDefaultBadge)}>default</span>
          ) : null}
        </span>
        <span className={sx(styles.optionDescription)}>
          {option.description || option.model}
        </span>
      </div>
    </CommandItem>
  );

  useEffect(() => {
    if (
      !shouldOpenModelSelector({
        openToken,
        disabled,
        lastHandledOpenToken: handledOpenTokenRef.current,
      })
    ) {
      return;
    }
    handledOpenTokenRef.current = openToken;
    setOpen(true);
  }, [disabled, openToken]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className={cx(sx(styles.root), className)}>
        <DialogTrigger
          render={
            <AdsButton
              layout="host"
              type="button"
              className={cx(
                sx(styles.trigger, open && styles.triggerOpen),
                triggerClassName,
              )}
              disabled={disabled}
              aria-label={triggerAriaLabel}
              title="Open model selector (Alt+P). Use Alt+1..0 for mapped models."
            />
          }
        >
          <span className={sx(styles.triggerLead)}>
            {value.isAuto ? (
              <Sparkles className={sx(styles.triggerAccentIcon)} />
            ) : value.model.trim() ? (
              <ModelIcon
                providerId={value.providerId}
                model={value.model}
                className={sx(styles.triggerIcon)}
              />
            ) : null}
            <span className={sx(styles.triggerLabel)}>
              {value.label}
              {effortLabel ? ` · ${effortLabel}` : ""}
            </span>
          </span>
          <ChevronDown className={sx(styles.triggerChevron)} />
        </DialogTrigger>
      </div>
      <DialogContent
        className={cx(sx(styles.dialogContent), menuClassName)}
        showCloseButton={false}
      >
        <DialogHeader className={sx(styles.srOnly)}>
          <DialogTitle>Select model</DialogTitle>
          <DialogDescription>
            Search and select the model for this composer.
          </DialogDescription>
        </DialogHeader>
        <Command className={sx(styles.command)}>
          <CommandInput autoFocus placeholder="Search model" />
          {/*
            Each option row is 3.5rem tall (py-2.5 + a 20px label and a 16px
            description line), so the 17.5rem cap keeps roughly five rows in
            view and everything below reachable by scrolling.
          */}
          <CommandList className={sx(styles.commandList)}>
            <CommandEmpty>No models found.</CommandEmpty>
            {autoOptions.length > 0 ? (
              <CommandGroup>{autoOptions.map(renderOption)}</CommandGroup>
            ) : null}
            {autoOptions.length > 0 &&
            (recommendedOptions.length > 0 || groupedOptions.length > 0) ? (
              <CommandSeparator />
            ) : null}
            {recommendedOptions.length > 0 ? (
              <CommandGroup
                heading={
                  <span className={sx(styles.groupHeading)}>
                    <Sparkles className={sx(styles.groupHeadingIcon)} />
                    <span>Recommended</span>
                  </span>
                }
              >
                {recommendedOptions.map(renderOption)}
              </CommandGroup>
            ) : null}
            {recommendedOptions.length > 0 && groupedOptions.length > 0 ? (
              <CommandSeparator />
            ) : null}
            {groupedOptions.map(([providerId, providerOptions]) => (
              <CommandGroup
                key={providerId}
                heading={getProviderLabel({ providerId, variant: "full" })}
              >
                {providerOptions.map(renderOption)}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {effortEnabled && effortOptions.length > 0 ? (
          <div className={sx(styles.effortRow)}>
            <p className={sx(styles.effortLabel)}>
              Reasoning effort for {value.label}
            </p>
            <ChoiceChips
              label={`Reasoning effort for ${value.label}`}
              options={effortOptions}
              value={effort}
              disabled={disabled}
              onValueChange={(nextEffort) =>
                onSelect({ selection: value, effort: nextEffort })
              }
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
