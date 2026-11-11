import { i18n, useTranslation } from "@/i18n";
import { Button as AuiButton } from "@/components/aui/components/Button";
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
import { cx, sx } from "@/components/aui/utils/stylex";
import { modelSelectorStyles as styles } from "./model-selector.styles";
import { SegmentedControl } from "@/components/system/SegmentedControl";
import { ModelPrice } from "./model-picker-options";
import { ModelIcon } from "./model-icon";
import {
  shouldOpenModelSelector,
  type ModelSelectorOption,
} from "./model-selector.utils";

export {
  buildAutoModelSelectorOption,
  buildModelEnrichmentFromCatalogs,
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
  useTranslation();
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

  // One group per runtime, plus one per labeled sub-group (an API connection)
  // under the runtime that serves it.
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, { providerId: ModelSelectorOption["providerId"]; group?: string; options: ModelSelectorOption[] }>();
    for (const option of options) {
      if (option.isAuto || recommendedOptionKeys.has(option.key)) {
        continue;
      }
      const key = `${option.providerId}\u0000${option.group ?? ""}`;
      const bucket = groups.get(key) ?? { providerId: option.providerId, group: option.group, options: [] };
      bucket.options.push(option);
      groups.set(key, bucket);
    }
    return listProviderIds().flatMap((providerId) =>
      [...groups.values()].filter((group) => group.providerId === providerId));
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
      <div className={sx(styles.optionContent)}>
        <span className={sx(styles.optionMark)} data-model-option-icon="">{option.isAuto ? (
          <Sparkles className={sx(styles.optionAccentIcon)} />
        ) : (
          <ModelIcon
            providerId={option.providerId}
            model={option.model}
            className={sx(styles.optionIcon)}
          />
        )}
        </span>
        <div className={sx(styles.optionBody)}>
          <span className={sx(styles.optionTitleRow)}>
            <span className={sx(styles.optionLabel)} data-model-option-label="">{option.label}</span>
            {option.isDefault ? (
              <span className={sx(styles.optionDefaultBadge)}>{i18n.t("composer:modelSelector.copy")}</span>
            ) : null}
            {option.badge ? (
              <span className={sx(styles.optionNoticeBadge)} title={option.description}>{option.badge}</span>
            ) : null}
          </span>
          {/* The price ends the id line, so it never takes the name's room. */}
          <span className={sx(styles.optionDescriptionLine)}>
            <span className={sx(styles.optionDescription)} data-model-option-detail="">
              {option.description || option.model}
            </span>
            {option.isAuto ? null : <ModelPrice model={option.model} xstyle={styles.optionPrice} />}
          </span>
        </div>
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
            <AuiButton
              layout="host"
              type="button"
              className={triggerClassName}
              xstyle={[styles.trigger, open && styles.triggerOpen]}
              disabled={disabled}
              aria-label={triggerAriaLabel}
              title={i18n.t("composer:modelSelector.title")}
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
        xstyle={styles.dialogContent}
        className={menuClassName}
        showCloseButton={false}
      >
        <DialogHeader className={sx(styles.srOnly)}>
          <DialogTitle>{i18n.t("composer:modelSelector.modelSelector")}</DialogTitle>
          <DialogDescription>
            {i18n.t("composer:modelSelector.modelSelector2")}</DialogDescription>
        </DialogHeader>
        <Command className={sx(styles.command)}>
          <CommandInput autoFocus placeholder={i18n.t("composer:modelSelector.placeholder")} />
          {/*
            Rows grow when names or compatibility notices wrap. The list
            keeps its height cap, with every option reachable by scrolling.
          */}
          <CommandList className={sx(styles.commandList)}>
            <CommandEmpty>{i18n.t("composer:modelSelector.modelSelector3")}</CommandEmpty>
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
                    <span>{i18n.t("composer:modelSelector.heading")}</span>
                  </span>
                }
              >
                {recommendedOptions.map(renderOption)}
              </CommandGroup>
            ) : null}
            {recommendedOptions.length > 0 && groupedOptions.length > 0 ? (
              <CommandSeparator />
            ) : null}
            {groupedOptions.map(({ providerId, group, options: groupOptions }) => (
              <CommandGroup
                key={`${providerId}:${group ?? ""}`}
                heading={group ? (
                  <span className={sx(styles.groupHeading)}>
                    <span>{getProviderLabel({ providerId, variant: "full" })}</span>
                    <span className={sx(styles.groupHeadingMeta)}>{group}</span>
                  </span>
                ) : getProviderLabel({ providerId, variant: "full" })}
              >
                {groupOptions.map(renderOption)}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {effortEnabled && effortOptions.length > 0 ? (
          <div className={sx(styles.effortRow)}>
            <p className={sx(styles.effortLabel)}>{i18n.t("composer:modelSelector.sentence28", { value1: value.label })}</p>
            <SegmentedControl
              aria-label={i18n.t("composer:modelSelector.label", { value1: value.label })}
              fullWidth
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
