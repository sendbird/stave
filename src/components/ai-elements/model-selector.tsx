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
  menuClassName?: string;
  openToken?: string | number;
  onSelect: (args: { selection: ModelSelectorOption }) => void;
}

export function ModelSelector(args: ModelSelectorProps) {
  const {
    value,
    options,
    recommendedOptions = [],
    disabled,
    className,
    triggerClassName,
    menuClassName,
    openToken,
    onSelect,
  } = args;
  const [open, setOpen] = useState(false);
  const handledOpenTokenRef = useRef<string | number | undefined>(undefined);
  const recommendedOptionKeys = useMemo(
    () => new Set(recommendedOptions.map((option) => option.key)),
    [recommendedOptions],
  );

  const groupedOptions = useMemo(() => {
    const groups: Record<string, ModelSelectorOption[]> = {};
    for (const option of options) {
      if (recommendedOptionKeys.has(option.key)) {
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

  const renderOption = (option: ModelSelectorOption) => (
    <CommandItem
      key={option.key}
      value={`${option.label} ${option.model} ${getProviderLabel({ providerId: option.providerId, variant: "full" })}${option.description ? ` ${option.description}` : ""}`}
      disabled={!option.available}
      data-checked={option.key === value.key ? "true" : undefined}
      onSelect={() => {
        onSelect({ selection: option });
        setOpen(false);
      }}
      className="gap-3 rounded-lg px-3 py-2.5"
    >
      <ModelIcon
        providerId={option.providerId}
        model={option.model}
        className="size-4"
      />
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
        <DialogTrigger asChild>
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
            title="Open model selector (Alt+P). Use Alt+1..0 for mapped models."
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <ModelIcon
                providerId={value.providerId}
                model={value.model}
                className="size-3.5"
              />
              <span className="truncate">{value.label}</span>
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
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
          <CommandList className="max-h-[22rem] px-1 pb-1">
            <CommandEmpty>No models found.</CommandEmpty>
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
      </DialogContent>
    </Dialog>
  );
}
