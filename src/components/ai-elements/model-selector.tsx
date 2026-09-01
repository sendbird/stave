import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
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
  const effortGroupId = useId();
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
      className="gap-3 rounded-lg px-3 py-2.5"
    >
      {option.isAuto ? (
        <Sparkles className="size-4 shrink-0 text-primary" />
      ) : (
        <ModelIcon
          providerId={option.providerId}
          model={option.model}
          className="size-4"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 truncate">
          <span className="font-medium">{option.label}</span>
          {option.isDefault ? (
            <span className="shrink-0 rounded bg-primary/10 px-1 py-px text-[10px] font-medium leading-tight text-primary">
              default
            </span>
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">
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
      <div className={cn("relative", className)}>
        <DialogTrigger
          render={
            <button
              type="button"
              className={cn(
                "inline-flex h-9 max-w-[240px] items-center justify-between gap-1.5 rounded-md border border-transparent bg-transparent px-2.5 text-sm text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                open
                  ? "bg-muted/70 focus-visible:border-primary/50"
                  : "focus-visible:border-border/60",
                triggerClassName,
              )}
              disabled={disabled}
              aria-label={triggerAriaLabel}
              title="Open model selector (Alt+P). Use Alt+1..0 for mapped models."
            />
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {value.isAuto ? (
              <Sparkles className="size-3.5 shrink-0 text-primary" />
            ) : (
              <ModelIcon
                providerId={value.providerId}
                model={value.model}
                className="size-3.5"
              />
            )}
            <span className="truncate">
              {value.label}
              {effortLabel ? ` · ${effortLabel}` : ""}
            </span>
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </DialogTrigger>
      </div>
      <DialogContent
        className={cn(
          "overflow-hidden rounded-xl p-0 sm:max-w-lg",
          menuClassName,
        )}
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Select model</DialogTitle>
          <DialogDescription>
            Search and select the model for this composer.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-none bg-transparent p-0">
          <CommandInput autoFocus placeholder="Search model" />
          {/*
            Each option row is 3.5rem tall (py-2.5 + a 20px label and a 16px
            description line), so the 17.5rem cap keeps roughly five rows in
            view and everything below reachable by scrolling.
          */}
          <CommandList className="max-h-[17.5rem] px-1 pb-1">
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
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5" />
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 bg-muted/20 px-3 py-2.5">
            <span
              id={effortGroupId}
              className="text-xs font-medium text-muted-foreground"
            >
              Effort
            </span>
            <div
              role="radiogroup"
              aria-labelledby={effortGroupId}
              className="flex flex-wrap items-center gap-1"
            >
              {effortOptions.map((option) => {
                const selected = option.value === effort;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={disabled}
                    onClick={() =>
                      onSelect({ selection: value, effort: option.value })
                    }
                    className={cn(
                      "h-8 rounded-md px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
