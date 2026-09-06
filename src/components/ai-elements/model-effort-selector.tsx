import { Button as AdsButton } from "@/components/ads/components/Button";
import { AlertCircle, RefreshCcw, Search, Sparkles, Zap } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Input,
  Loader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
} from "@/components/ui";
import {
  getProviderLabel,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import type { ModelVisibility } from "@/lib/providers/model-visibility";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cx, sx } from "@/components/ads/utils/stylex";
import { modelEffortSelectorStyles as styles } from "./model-effort-selector.styles";
import { SelectionRail } from "@/components/system/SelectionRail";
import { CursorModelConfigList } from "./cursor-model-config-list";
import { ModelEffortGrid } from "./model-effort-grid";
import { ModelIcon } from "./model-icon";
import {
  collapseClaudeContextOptions,
  getClaudeContextBaseLabel,
  getCursorModelPresentation,
  getCursorModelBaseId,
  groupCursorModelOptions,
  isClaudeContext1MModel,
  listDefaultModelOptions,
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
  /**
   * Settings overrides for which catalog models this selector lists by default.
   * Everything stays reachable through search and "Show all models".
   */
  modelVisibility?: ModelVisibility;
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
  const optionRefs = useRef(new Map<string, HTMLElement>());
  const selectedIndex = args.options.findIndex(
    (option) => option.key === args.selectedModelKey,
  );
  const enabledIndices = args.options.flatMap((option, index) =>
    option.available ? [index] : [],
  );
  const tabStopIndex = enabledIndices.includes(selectedIndex)
    ? selectedIndex
    : enabledIndices[0];

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    optionIndex: number,
  ) => {
    if (
      !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) ||
      enabledIndices.length === 0
    ) {
      return;
    }
    event.preventDefault();
    const nextEnabledIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabledIndices.length - 1
          : (enabledIndices.indexOf(optionIndex) +
              (event.key === "ArrowDown" ? 1 : -1) +
              enabledIndices.length) %
            enabledIndices.length;
    const nextIndex = enabledIndices[nextEnabledIndex];
    if (nextIndex === undefined) return;
    optionRefs.current.get(args.options[nextIndex]?.key ?? "")?.focus();
  };

  if (args.options.length === 0) {
    return null;
  }

  return (
    <div
      role="listbox"
      aria-label={`${getProviderLabel({ providerId: args.providerId })} models`}
      className={sx(styles.modelList)}
    >
      {args.options.map((option, optionIndex) => {
        const selected = option.key === args.selectedModelKey;
        const presentation = getCursorModelPresentation(option);
        return (
          <AdsButton
            layout="host"
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
            className={sx(
              styles.modelRow,
              selected ? styles.modelRowSelected : styles.modelRowIdle,
            )}
          >
            <ModelIcon
              providerId={option.providerId}
              model={option.model}
              className={sx(styles.modelRowIcon)}
            />
            <span className={sx(styles.modelRowBody)}>
              <span className={sx(styles.modelRowTitleLine)}>
                <span className={sx(styles.modelRowTitle)}>
                  {presentation.label}
                </span>
                {option.isDefault ? (
                  <span className={sx(styles.modelRowDefaultBadge)}>
                    Default
                  </span>
                ) : null}
              </span>
              {presentation.capabilities.length > 0 ? (
                <span className={sx(styles.modelRowCapabilities)}>
                  {presentation.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className={sx(styles.capabilityChip)}
                    >
                      {capability}
                    </span>
                  ))}
                </span>
              ) : (
                <span className={sx(styles.modelRowDescription)}>
                  {option.description || option.model}
                </span>
              )}
            </span>
          </AdsButton>
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
        <div role="status" className={sx(styles.notice)}>
          <Loader aria-hidden="true" size="xs" variant="decode" />
          Loading the runtime model catalog…
        </div>
      ) : null}
      {args.catalog?.status === "error" ? (
        <div
          role="alert"
          className={sx(styles.notice, styles.noticeAlignStart)}
        >
          <AlertCircle className={sx(styles.noticeIcon)} aria-hidden="true" />
          <span className={sx(styles.noticeBody)}>
            {args.catalog.detail || "The runtime model catalog is unavailable."}
          </span>
          {args.onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={args.onRefresh}
              className={sx(styles.retryButton)}
            >
              <RefreshCcw className={sx(styles.retryIcon)} />
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {args.selectedMissing ? (
        <div role="alert" className={sx(styles.noticeError)}>
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
  const resetHandledForOpenRef = useRef(false);
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
  const defaultProviderOptions = useMemo(
    () =>
      listDefaultModelOptions({
        providerId,
        options: providerOptions,
        ...(args.modelVisibility ? { visibility: args.modelVisibility } : {}),
        ...(args.value.providerId === providerId
          ? { selectedModelKey: args.value.key }
          : {}),
      }),
    [
      args.modelVisibility,
      args.value.key,
      args.value.providerId,
      providerId,
      providerOptions,
    ],
  );
  const visibleOptions = useMemo(() => {
    const queryTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (queryTerms.length === 0) {
      return showAllModels ? providerOptions : defaultProviderOptions;
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
    defaultProviderOptions,
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
    defaultProviderOptions.length < providerOptions.length;
  const catalog = args.catalogs?.[providerId];
  // The refresh control only makes sense for runtime-backed catalogs (the ones
  // fetched from a provider CLI). A static built-in catalog stays "ready" and
  // non-dynamic, so refreshing it would be a no-op; loading/error states also
  // only occur for runtime catalogs.
  const isRuntimeCatalog =
    catalog?.isDynamic === true ||
    catalog?.status === "loading" ||
    catalog?.status === "error";
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

  // Reset once per open, not on every dependency change.
  //
  // `providerIds` is derived from `args.options`, which gets a new identity each
  // time a runtime model catalog resolves or refreshes. Re-running this body on
  // that change snapped the open popover back to the selected model's provider
  // tab and wiped whatever the user had typed, mid-search.
  useEffect(() => {
    if (!open) {
      resetHandledForOpenRef.current = false;
      return;
    }
    if (resetHandledForOpenRef.current) {
      return;
    }
    resetHandledForOpenRef.current = true;
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
    // Three independent buttons, not a segmented control. Fast and 1M are
    // toggles that happen to sit beside the model they qualify — they are not
    // parts of one object — so they keep their own rounding and their own gap
    // instead of borrowing the model button's corners across a hairline.
    <div
      role="group"
      data-model-effort-control="true"
      aria-label="Model controls"
      className={sx(styles.group)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <AdsButton
              layout="host"
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
              className={sx(styles.trigger, open && styles.triggerOpen)}
            />
          }
        >
          {args.value.isAuto ? (
            <Sparkles className={sx(styles.triggerAccentIcon)} />
          ) : (
            <ModelIcon
              providerId={args.value.providerId}
              model={args.value.model}
              className={sx(styles.triggerIcon)}
            />
          )}
          <span className={sx(styles.triggerLabel)}>{displayLabel}</span>
          {selectedEffortLabel ? (
            <>
              <span aria-hidden="true" className={sx(styles.triggerDot)}>
                ·
              </span>
              <span className={sx(styles.triggerEffort)}>
                {selectedEffortLabel}
              </span>
            </>
          ) : null}
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
          // Search + footer chrome is ~7.5rem. Each model row is ~3.5rem
          // (min-h-11 plus row padding/gap), so 25rem keeps five rows in
          // view and everything below reachable by scrolling.
          xstyle={styles.popover}
          className="model-effort-popover"
        >
          <Tabs
            value={providerId}
            onValueChange={(value) => showProvider(value as ProviderId)}
            orientation="vertical"
            className={sx(styles.tabs)}
          >
            <SelectionRail
              label="Model provider"
              value={providerId}
              onPreview={(value) => showProvider(value as ProviderId)}
              items={providerIds.map((candidate) => {
                const providerModels = args.options.filter(
                  (option) => !option.isAuto && option.providerId === candidate,
                );
                return {
                  value: candidate,
                  label: getProviderLabel({ providerId: candidate }),
                  icon: (
                    <ModelIcon
                      providerId={candidate}
                      className={sx(styles.railIcon)}
                    />
                  ),
                  count:
                    candidate === "cursor"
                      ? groupCursorModelOptions(providerModels).length
                      : providerModels.length,
                };
              })}
            />

            <div className={sx(styles.panel)}>
              <div className={sx(styles.searchBar)}>
                <div className={sx(styles.searchField)}>
                  <Search
                    className={sx(styles.searchIcon)}
                    aria-hidden="true"
                  />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search models"
                    placeholder="Search models"
                    className={sx(styles.searchInput)}
                  />
                </div>
                {args.onRefreshCatalogs && catalog && isRuntimeCatalog ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Refresh model catalog"
                    title="Refresh model catalog"
                    disabled={args.disabled || catalog.status === "loading"}
                    onClick={() => args.onRefreshCatalogs?.()}
                    className={sx(styles.actionButton)}
                  >
                    <RefreshCcw
                      className={sx(
                        styles.refreshIcon,
                        catalog.status === "loading" &&
                          styles.refreshIconSpinning,
                      )}
                      aria-hidden="true"
                    />
                    <span className={sx(styles.refreshLabel)}>Refresh</span>
                  </Button>
                ) : null}
                {autoOption ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Stave Auto"
                    aria-pressed={Boolean(args.value.isAuto)}
                    disabled={args.disabled || !autoOption.available}
                    onClick={() => chooseModel(autoOption)}
                    className={sx(
                      styles.actionButtonAuto,
                      args.value.isAuto && styles.actionButtonAutoActive,
                    )}
                  >
                    <Sparkles
                      className={sx(styles.autoIcon)}
                      aria-hidden="true"
                    />
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
                  className={sx(styles.tabContent)}
                >
                  {candidate === providerId ? (
                    visibleOptions.length === 0 ? (
                      <div className={sx(styles.empty)}>
                        {query.trim().length > 0
                          ? "No models match this search."
                          : "Every model for this provider is turned off. Show all models below, or re-enable them in Settings › Models."}
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
                <div className={sx(styles.showAllFooter)}>
                  <AdsButton
                    layout="host"
                    type="button"
                    onClick={() => setShowAllModels((value) => !value)}
                    className={sx(styles.showAllButton)}
                  >
                    <span>
                      {showAllModels
                        ? "Show current models"
                        : "Show all models"}
                    </span>
                    <span className={sx(styles.showAllCount)}>
                      {showAllModels
                        ? defaultProviderOptions.length
                        : providerOptions.length}
                    </span>
                  </AdsButton>
                </div>
              ) : null}
            </div>
          </Tabs>
        </PopoverContent>
      </Popover>

      {!args.value.isAuto &&
      args.value.providerId === "codex" &&
      args.showFastMode !== false ? (
        <AdsButton
          layout="host"
          type="button"
          aria-label={`Fast mode: ${args.fastMode ? "On" : "Off"}`}
          aria-pressed={args.fastMode ?? false}
          disabled={args.disabled}
          onClick={() => args.onFastModeChange?.(!(args.fastMode ?? false))}
          className={sx(
            styles.capabilityToggle,
            args.fastMode && styles.capabilityToggleFastActive,
          )}
        >
          <Zap
            className={sx(
              styles.toggleIcon,
              args.fastMode && styles.toggleIconFilled,
            )}
            aria-hidden="true"
          />
          Fast
        </AdsButton>
      ) : null}

      {supportsContext1M ? (
        <AdsButton
          layout="host"
          type="button"
          aria-label={`1M context: ${isClaudeContext1MModel(args.value.model) ? "On" : "Off"}`}
          aria-pressed={isClaudeContext1MModel(args.value.model)}
          disabled={args.disabled}
          onClick={toggleContext1M}
          className={sx(
            styles.capabilityToggle,
            styles.capabilityToggleSemibold,
            isClaudeContext1MModel(args.value.model) &&
              styles.capabilityToggleContextActive,
          )}
        >
          1M
        </AdsButton>
      ) : null}
    </div>
  );
}
