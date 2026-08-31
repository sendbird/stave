import {
  AlertCircle,
  ChevronDown,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  getProviderLabel,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { CursorModelConfigList } from "./cursor-model-config-list";
import { ModelEffortGrid, PROVIDER_ACCENT_COLORS } from "./model-effort-grid";
import { ModelIcon } from "./model-icon";
import {
  collapseClaudeContextOptions,
  expandCursorModelFamilies,
  getClaudeContextBaseLabel,
  getCursorModelPresentation,
  getCursorModelBaseId,
  groupCursorModelOptions,
  isClaudeContext1MModel,
  listFeaturedModelOptions,
  listModelEfforts,
  resolveClaudeContextOption,
  resolveDefaultModelEffort,
  supportsClaudeContextToggle,
  type ModelEffortValue,
} from "./model-effort-selector.utils";
import {
  shouldOpenModelSelector,
  type ModelSelectorOption,
} from "./model-selector.utils";

export interface ModelSelectorCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  detail?: string;
  isDynamic?: boolean;
}

interface ModelEffortSelectorProps {
  value: ModelSelectorOption;
  options: readonly ModelSelectorOption[];
  effortValue?: ModelEffortValue;
  effortLabel?: string;
  fastMode?: boolean;
  showFastMode?: boolean;
  disabled?: boolean;
  openToken?: string | number;
  catalogs?: Partial<Record<ProviderId, ModelSelectorCatalogState>>;
  onRefreshCatalogs?: () => void;
  onFastModeChange?: (enabled: boolean) => void;
  onSelect: (args: {
    selection: ModelSelectorOption;
    effort?: ModelEffortValue;
    fastMode?: boolean;
  }) => void;
}

function ModelOnlyList(args: {
  providerId: ProviderId;
  options: readonly ModelSelectorOption[];
  selectedModelKey?: string;
  disabled?: boolean;
  onChoose: (option: ModelSelectorOption) => void;
}) {
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedIndex = args.options.findIndex(
    (option) => option.key === args.selectedModelKey,
  );
  const tabStopIndex = Math.max(selectedIndex, 0);

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    optionIndex: number,
  ) => {
    if (
      !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
      args.options.length === 0
    ) {
      return;
    }
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? args.options.length - 1
          : (optionIndex +
              (event.key === "ArrowDown" ? 1 : -1) +
              args.options.length) %
            args.options.length;
    optionRefs.current.get(args.options[nextIndex]?.key ?? "")?.focus();
  };

  if (args.options.length === 0) {
    return null;
  }

  return (
    <div
      role="listbox"
      aria-label={`${getProviderLabel({ providerId: args.providerId })} models`}
      className="space-y-1 p-2"
    >
      {args.options.map((option, optionIndex) => {
        const selected = option.key === args.selectedModelKey;
        const presentation = getCursorModelPresentation(option);
        return (
          <button
            key={option.key}
            ref={(element) => {
              if (element) {
                optionRefs.current.set(option.key, element);
              } else {
                optionRefs.current.delete(option.key);
              }
            }}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={args.disabled || !option.available}
            tabIndex={optionIndex === tabStopIndex ? 0 : -1}
            onKeyDown={(event) => moveFocus(event, optionIndex)}
            onClick={() => args.onChoose(option)}
            className={cn(
              "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45",
              selected
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <ModelIcon
              providerId={option.providerId}
              model={option.model}
              className="size-4"
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-foreground">
                  {presentation.label}
                </span>
                {option.isDefault ? (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Default
                  </span>
                ) : null}
              </span>
              {presentation.capabilities.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {presentation.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-md border border-border/60 bg-muted/35 px-1.5 py-0.5 text-[10px] leading-4 font-medium text-muted-foreground"
                    >
                      {capability}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                  {option.description || option.model}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CatalogNotice(args: {
  catalog?: ModelSelectorCatalogState;
  selectedMissing: boolean;
  onRefresh?: () => void;
}) {
  return (
    <>
      {args.catalog?.status === "loading" ? (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-border/65 px-3 py-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Loading the runtime model catalog…
        </div>
      ) : null}
      {args.catalog?.status === "error" ? (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 border-b border-border/65 px-3 py-2 text-xs text-muted-foreground"
        >
          <AlertCircle
            className="mt-0.5 size-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            {args.catalog.detail || "The runtime model catalog is unavailable."}
          </span>
          {args.onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={args.onRefresh}
              className="h-7 shrink-0 px-2 text-xs"
            >
              <RefreshCcw className="size-3" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {args.selectedMissing ? (
        <div
          role="alert"
          className="shrink-0 border-b border-border/65 px-3 py-2 text-xs text-destructive"
        >
          The selected model is no longer in this runtime catalog. Choose
          another model before sending.
        </div>
      ) : null}
    </>
  );
}

export function ModelEffortSelector(args: ModelEffortSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAllModels, setShowAllModels] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>(
    args.value.providerId,
  );
  const [context1M, setContext1M] = useState(() =>
    isClaudeContext1MModel(args.value.model),
  );
  const handledOpenTokenRef = useRef(args.openToken);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const autoOption = args.options.find((option) => option.isAuto);
  const providerIds = useMemo(
    () =>
      listProviderIds().filter((candidate) =>
        args.options.some(
          (option) => !option.isAuto && option.providerId === candidate,
        ),
      ),
    [args.options],
  );
  const providerOptions = useMemo(() => {
    const options = args.options.filter(
      (option) => !option.isAuto && option.providerId === providerId,
    );
    return providerId === "claude-code"
      ? collapseClaudeContextOptions({ options, context1M })
      : options;
  }, [args.options, context1M, providerId]);
  const featuredProviderOptions = useMemo(() => {
    if (providerOptions.length <= 12) {
      return providerOptions;
    }
    const featured = listFeaturedModelOptions({
      options: providerOptions,
      selectedModelKey:
        args.value.providerId === providerId ? args.value.key : undefined,
    });
    return providerId === "cursor"
      ? expandCursorModelFamilies({
          options: providerOptions,
          featured,
        })
      : featured;
  }, [args.value.key, args.value.providerId, providerId, providerOptions]);
  const visibleOptions = useMemo(() => {
    const queryTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (queryTerms.length === 0) {
      return showAllModels ? providerOptions : featuredProviderOptions;
    }
    const matches = providerOptions.filter((option) => {
      const haystack = [option.label, option.model, option.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return queryTerms.every((term) => haystack.includes(term));
    });
    if (providerId !== "cursor") {
      return matches;
    }
    const matchingBaseModels = new Set(
      matches.map((option) => getCursorModelBaseId(option.model)),
    );
    return providerOptions.filter((option) =>
      matchingBaseModels.has(getCursorModelBaseId(option.model)),
    );
  }, [
    featuredProviderOptions,
    providerId,
    providerOptions,
    query,
    showAllModels,
  ]);
  const effortfulOptions = visibleOptions.filter(
    (option) => providerId !== "cursor" && listModelEfforts(option).length > 0,
  );
  const effortlessOptions = visibleOptions.filter(
    (option) =>
      providerId !== "cursor" && listModelEfforts(option).length === 0,
  );
  const canToggleAllModels =
    query.trim().length === 0 &&
    featuredProviderOptions.length < providerOptions.length;
  const catalog = args.catalogs?.[providerId];
  const selectedMissing =
    !args.value.isAuto &&
    args.value.providerId === providerId &&
    catalog?.status === "ready" &&
    !args.options.some((option) => option.key === args.value.key);
  const selectedEffort =
    args.value.isAuto || listModelEfforts(args.value).length === 0
      ? undefined
      : (args.effortValue ?? resolveDefaultModelEffort(args.value));
  const selectedEffortLabel =
    args.value.providerId === "cursor"
      ? undefined
      : (listModelEfforts(args.value).find(
          (effort) => effort.value === selectedEffort,
        )?.label ?? args.effortLabel);
  const supportsContext1M = supportsClaudeContextToggle({
    options: args.options,
    option: args.value,
  });
  const displayLabel =
    args.value.providerId === "claude-code"
      ? getClaudeContextBaseLabel(args.value.label)
      : args.value.providerId === "cursor"
        ? getCursorModelPresentation(args.value).label
        : args.value.label;

  const showProvider = (nextProviderId: ProviderId) => {
    if (nextProviderId === providerId) {
      return;
    }
    setProviderId(nextProviderId);
    setQuery("");
    setShowAllModels(false);
  };

  const chooseModel = (
    option: ModelSelectorOption,
    effort?: ModelEffortValue,
  ) => {
    args.onSelect({
      selection: option,
      ...(effort ? { effort } : {}),
      ...(option.providerId === "codex"
        ? { fastMode: args.fastMode ?? false }
        : {}),
    });
    setOpen(false);
  };

  const toggleContext1M = () => {
    const enabled = !isClaudeContext1MModel(args.value.model);
    const selection = resolveClaudeContextOption({
      options: args.options,
      option: args.value,
      context1M: enabled,
    });
    setContext1M(enabled);
    args.onSelect({
      selection,
      ...(args.effortValue ? { effort: args.effortValue } : {}),
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setProviderId(
      args.value.isAuto
        ? (providerIds[0] ?? "claude-code")
        : args.value.providerId,
    );
    setContext1M(isClaudeContext1MModel(args.value.model));
    setQuery("");
    setShowAllModels(false);
  }, [
    args.value.isAuto,
    args.value.model,
    args.value.providerId,
    open,
    providerIds,
  ]);

  useEffect(() => {
    if (
      !shouldOpenModelSelector({
        openToken: args.openToken,
        disabled: args.disabled,
        lastHandledOpenToken: handledOpenTokenRef.current,
      })
    ) {
      return;
    }
    handledOpenTokenRef.current = args.openToken;
    setOpen(true);
  }, [args.disabled, args.openToken]);

  return (
    <ButtonGroup
      className="h-9 max-w-full"
      data-model-effort-control="true"
      aria-label="Model controls"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              ref={triggerRef}
              type="button"
              disabled={args.disabled}
              aria-label={
                args.value.isAuto
                  ? "Model: Stave Auto. Stave chooses the provider, model, and effort."
                  : `Model: ${displayLabel}${
                      selectedEffortLabel
                        ? `. Effort: ${selectedEffortLabel}`
                        : ""
                    }`
              }
              title="Open model and effort selector (Alt+P). Use Alt+1..0 for mapped models."
              className={cn(
                "inline-flex h-full min-w-0 max-w-[320px] items-center gap-1.5 bg-transparent px-2.5 text-sm text-foreground transition-[background-color,color,box-shadow] duration-150 hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50",
                open && "bg-accent/65",
              )}
            />
          }
        >
          {args.value.isAuto ? (
            <Sparkles className="size-3.5 shrink-0 text-primary" />
          ) : (
            <ModelIcon
              providerId={args.value.providerId}
              model={args.value.model}
              className="size-3.5"
            />
          )}
          <span className="min-w-0 truncate">{displayLabel}</span>
          {selectedEffortLabel ? (
            <>
              <span aria-hidden="true" className="text-muted-foreground/35">
                ·
              </span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {selectedEffortLabel}
              </span>
            </>
          ) : null}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          collisionPadding={8}
          collisionAvoidance={{
            side: "shift",
            align: "shift",
            fallbackAxisSide: "none",
          }}
          finalFocus={triggerRef}
          aria-label="Model and effort selector"
          className="model-effort-popover flex max-h-[min(32rem,calc(100dvh-1rem))] w-[min(40rem,calc(100vw-1rem))] flex-col gap-0 overflow-hidden rounded-xl border border-border/70 bg-popover p-0"
        >
          <Tabs
            value={providerId}
            onValueChange={(value) => showProvider(value as ProviderId)}
            orientation="vertical"
            className="min-h-0 gap-0"
          >
            <TabsList
              variant="soft"
              aria-label="Model provider"
              className="w-12 shrink-0 justify-start gap-1 rounded-none border-r border-border/65 bg-muted/20 p-1 min-[480px]:w-32 min-[480px]:p-1.5"
            >
              {providerIds.map((candidate) => {
                const selected = candidate === providerId;
                const providerModels = args.options.filter(
                  (option) => !option.isAuto && option.providerId === candidate,
                );
                const count =
                  candidate === "cursor"
                    ? groupCursorModelOptions(providerModels).length
                    : providerModels.length;
                return (
                  <TabsTrigger
                    key={candidate}
                    value={candidate}
                    aria-label={`${getProviderLabel({ providerId: candidate })}, ${count} models`}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") {
                        showProvider(candidate);
                      }
                    }}
                    className="h-11 min-h-11 w-full flex-none justify-center gap-2 px-2 min-[480px]:justify-start"
                    style={
                      selected
                        ? ({
                            color: `color-mix(in oklch, ${PROVIDER_ACCENT_COLORS[candidate]} 78%, var(--foreground))`,
                            backgroundColor: `color-mix(in oklch, ${PROVIDER_ACCENT_COLORS[candidate]} 12%, var(--popover))`,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    <ModelIcon providerId={candidate} className="size-4" />
                    <span className="hidden min-w-0 flex-1 truncate min-[480px]:inline">
                      {getProviderLabel({ providerId: candidate })}
                    </span>
                    <span className="hidden text-[10px] tabular-nums text-muted-foreground/75 min-[480px]:inline">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-border/65 p-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search models"
                    placeholder="Search models"
                    className="h-9 pl-8"
                  />
                </div>
                {autoOption ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Stave Auto"
                    aria-pressed={Boolean(args.value.isAuto)}
                    disabled={args.disabled || !autoOption.available}
                    onClick={() => chooseModel(autoOption)}
                    className={cn(
                      "h-9 shrink-0 gap-1.5 px-2 text-xs",
                      args.value.isAuto
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    Auto
                  </Button>
                ) : null}
              </div>

              <CatalogNotice
                catalog={catalog}
                selectedMissing={selectedMissing}
                onRefresh={args.onRefreshCatalogs}
              />

              {providerIds.map((candidate) => (
                <TabsContent
                  key={candidate}
                  value={candidate}
                  className="min-h-0 overflow-y-auto overscroll-contain"
                >
                  {candidate === providerId ? (
                    visibleOptions.length === 0 ? (
                      <div className="flex min-h-28 items-center justify-center px-4 text-sm text-muted-foreground">
                        No models match this search.
                      </div>
                    ) : (
                      <>
                        {providerId === "cursor" ? (
                          <CursorModelConfigList
                            options={visibleOptions}
                            selectedModelKey={
                              !args.value.isAuto &&
                              args.value.providerId === providerId
                                ? args.value.key
                                : undefined
                            }
                            disabled={args.disabled}
                            onChoose={chooseModel}
                          />
                        ) : null}
                        <ModelEffortGrid
                          providerId={providerId}
                          options={effortfulOptions}
                          selectedModelKey={
                            !args.value.isAuto &&
                            args.value.providerId === providerId
                              ? args.value.key
                              : undefined
                          }
                          selectedEffort={
                            args.value.providerId === providerId
                              ? selectedEffort
                              : undefined
                          }
                          disabled={args.disabled}
                          onChoose={chooseModel}
                        />
                        <ModelOnlyList
                          providerId={providerId}
                          options={effortlessOptions}
                          selectedModelKey={
                            !args.value.isAuto &&
                            args.value.providerId === providerId
                              ? args.value.key
                              : undefined
                          }
                          disabled={args.disabled}
                          onChoose={chooseModel}
                        />
                      </>
                    )
                  ) : null}
                </TabsContent>
              ))}

              {canToggleAllModels ? (
                <div className="shrink-0 border-t border-border/65 p-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAllModels((value) => !value)}
                    className="flex min-h-11 w-full items-center justify-between rounded-md px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>
                      {showAllModels
                        ? "Show featured models"
                        : "Show all models"}
                    </span>
                    <span className="tabular-nums text-muted-foreground/75">
                      {showAllModels
                        ? featuredProviderOptions.length
                        : providerOptions.length}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </Tabs>
        </PopoverContent>
      </Popover>

      {!args.value.isAuto &&
      args.value.providerId === "codex" &&
      args.showFastMode !== false ? (
        <>
          <ButtonGroupSeparator />
          <button
            type="button"
            aria-label={`Fast mode: ${args.fastMode ? "On" : "Off"}`}
            aria-pressed={args.fastMode ?? false}
            disabled={args.disabled}
            onClick={() => args.onFastModeChange?.(!(args.fastMode ?? false))}
            className={cn(
              "inline-flex h-full shrink-0 items-center gap-1 px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50",
              args.fastMode && "bg-prompt-role-fast/10 text-prompt-role-fast",
            )}
          >
            <Zap
              className={cn("size-3.5", args.fastMode && "fill-current")}
              aria-hidden="true"
            />
            Fast
          </button>
        </>
      ) : null}

      {supportsContext1M ? (
        <>
          <ButtonGroupSeparator />
          <button
            type="button"
            aria-label={`1M context: ${isClaudeContext1MModel(args.value.model) ? "On" : "Off"}`}
            aria-pressed={isClaudeContext1MModel(args.value.model)}
            disabled={args.disabled}
            onClick={toggleContext1M}
            className={cn(
              "inline-flex h-full shrink-0 items-center px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50",
              isClaudeContext1MModel(args.value.model) &&
                "bg-primary/10 text-primary",
            )}
          >
            1M
          </button>
        </>
      ) : null}
    </ButtonGroup>
  );
}
