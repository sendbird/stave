import { Minus, Sparkles, Zap } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import {
  getProviderLabel,
  listCodexReasoningEffortsForModel,
  STAVE_LOGO_URL,
} from "@/lib/providers/model-catalog";
import type { ModelShortcutEffort } from "@/lib/providers/model-shortcuts";
import {
  CLAUDE_EFFORT_OPTIONS,
  CODEX_EFFORT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { ModelIcon } from "./model-icon";
import {
  buildClaudeModelEffortRows,
  buildCodexModelEffortRows,
  isClaudeContext1MModel,
  resolveClaudeMatrixOption,
  type ModelEffortMatrixRow,
} from "./model-effort-selector.utils";
import {
  shouldOpenModelSelector,
  type ModelSelectorOption,
} from "./model-selector.utils";

type ModelEffortValue = Exclude<ModelShortcutEffort, "">;

interface ModelEffortPreview {
  modelLabel: string;
  effortLabel: string;
}

interface ModelEffortSelectorProps {
  value: ModelSelectorOption;
  options: readonly ModelSelectorOption[];
  effortValue?: ModelEffortValue;
  effortLabel?: string;
  fastMode?: boolean;
  /** Whether the Codex Fast control is available in the selector header. */
  showFastMode?: boolean;
  disabled?: boolean;
  openToken?: string | number;
  onFastModeChange?: (enabled: boolean) => void;
  onSelect: (args: {
    selection: ModelSelectorOption;
    effort?: ModelEffortValue;
    fastMode?: boolean;
  }) => void;
}

const PROVIDER_CELL_COLORS: Record<ProviderId, readonly string[]> = {
  "claude-code": [
    "color-mix(in srgb, #d97757 24%, var(--popover))",
    "color-mix(in srgb, #d97757 40%, var(--popover))",
    "color-mix(in srgb, #d97757 56%, var(--popover))",
    "color-mix(in srgb, #d97757 76%, var(--popover))",
    "#d97757",
  ],
  codex: [
    "color-mix(in srgb, #4169c1 24%, var(--popover))",
    "color-mix(in srgb, #4169c1 38%, var(--popover))",
    "color-mix(in srgb, #4169c1 52%, var(--popover))",
    "color-mix(in srgb, #4169c1 68%, var(--popover))",
    "color-mix(in srgb, #4169c1 84%, var(--popover))",
    "#4169c1",
  ],
};

interface CellOrbPresentation {
  state: OrbState;
  speed: number;
  kind: "selected" | "max" | "ultra";
}

function resolveCellOrbPresentation(args: {
  effort: string;
  selected: boolean;
}): CellOrbPresentation | null {
  if (args.effort === "ultra") {
    return { state: "composing", speed: 1.25, kind: "ultra" };
  }
  if (args.effort === "max") {
    return { state: "solving", speed: 1, kind: "max" };
  }
  if (args.selected) {
    return { state: "working", speed: 0.72, kind: "selected" };
  }
  return null;
}

function getCellKey(args: {
  providerId: ProviderId;
  model: string;
  effort: string;
}) {
  return `${args.providerId}:${args.model}:${args.effort}`;
}

function isStaveAutoSlot(args: {
  providerId: ProviderId;
  row: ModelEffortMatrixRow;
  effort: string;
}) {
  return (
    args.providerId === "codex" &&
    args.row.shortLabel === "Luna" &&
    args.effort === "ultra"
  );
}

function ModelEffortMatrix(args: {
  providerId: ProviderId;
  rows: readonly ModelEffortMatrixRow[];
  selectedModelKey: string;
  selectedEffort?: ModelEffortValue;
  autoOption?: ModelSelectorOption;
  autoSelected: boolean;
  context1M: boolean;
  fastMode: boolean;
  disabled?: boolean;
  headerAction?: ReactNode;
  onPreview: (preview: ModelEffortPreview | null) => void;
  onSelect: ModelEffortSelectorProps["onSelect"];
  onClose: () => void;
}) {
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const effortOptions =
    args.providerId === "claude-code"
      ? CLAUDE_EFFORT_OPTIONS
      : CODEX_EFFORT_OPTIONS;
  const selectedRowIndex = args.rows.findIndex((row) => {
    const option =
      args.providerId === "claude-code"
        ? resolveClaudeMatrixOption({ row, context1M: args.context1M })
        : row.option;
    return option.key === args.selectedModelKey;
  });
  const selectedTabStop = `${Math.max(selectedRowIndex, 0)}:${Math.max(
    effortOptions.findIndex((option) => option.value === args.selectedEffort),
    0,
  )}`;
  const autoTabStop = `${args.rows.length - 1}:${effortOptions.length - 1}`;
  const fallbackTabStop =
    args.autoSelected && args.providerId === "codex"
      ? autoTabStop
      : selectedTabStop;

  const focusCell = (rowIndex: number, effortIndex: number) => {
    const row = args.rows[rowIndex];
    const effort = effortOptions[effortIndex];
    if (!row || !effort) {
      return false;
    }
    const option =
      args.providerId === "claude-code"
        ? resolveClaudeMatrixOption({ row, context1M: args.context1M })
        : row.option;
    if (
      isStaveAutoSlot({
        providerId: args.providerId,
        row,
        effort: effort.value,
      }) &&
      args.autoOption?.available
    ) {
      cellRefs.current.get("stave:auto")?.focus();
      return true;
    }
    const supported =
      args.providerId === "claude-code" ||
      listCodexReasoningEffortsForModel({ model: option.model }).includes(
        effort.value as never,
      );
    if (!option.available || !supported) {
      return false;
    }
    cellRefs.current
      .get(
        getCellKey({
          providerId: args.providerId,
          model: option.model,
          effort: effort.value,
        }),
      )
      ?.focus();
    return true;
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    effortIndex: number,
  ) => {
    const key = event.key;
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(key)
    ) {
      return;
    }
    event.preventDefault();

    if (key === "Home" || key === "End") {
      const start = key === "Home" ? 0 : effortOptions.length - 1;
      const step = key === "Home" ? 1 : -1;
      for (
        let nextEffort = start;
        nextEffort >= 0 && nextEffort < effortOptions.length;
        nextEffort += step
      ) {
        if (focusCell(rowIndex, nextEffort)) {
          return;
        }
      }
      return;
    }

    const rowStep = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
    const effortStep = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    let nextRow = rowIndex + rowStep;
    let nextEffort = effortIndex + effortStep;
    while (
      nextRow >= 0 &&
      nextRow < args.rows.length &&
      nextEffort >= 0 &&
      nextEffort < effortOptions.length
    ) {
      if (focusCell(nextRow, nextEffort)) {
        return;
      }
      nextRow += rowStep;
      nextEffort += effortStep;
    }
  };

  return (
    <section
      aria-label={`${getProviderLabel({ providerId: args.providerId })} model and effort`}
      data-provider={args.providerId}
      className="min-w-0"
    >
      <div className="mb-1 flex min-h-10 items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <ModelIcon providerId={args.providerId} className="size-4" />
          <h3 className="model-effort-provider-title text-sm font-semibold tracking-tight">
            {getProviderLabel({ providerId: args.providerId })}
          </h3>
        </div>
        {args.headerAction}
      </div>
      <div
        role="grid"
        aria-label={`${getProviderLabel({ providerId: args.providerId })} model effort matrix`}
        className="grid items-center gap-0.5 min-[500px]:gap-1"
        style={{
          gridTemplateColumns: `4rem repeat(${effortOptions.length}, 2.75rem)`,
        }}
      >
        <div role="row" className="contents">
          <span role="columnheader" aria-label="Model" />
          {effortOptions.map((effort) => (
            <span
              key={effort.value}
              role="columnheader"
              className="text-center text-xs font-medium text-muted-foreground"
            >
              {effort.label === "X-High" ? "XH" : effort.label}
            </span>
          ))}
        </div>
        {args.rows.map((row, rowIndex) => {
          const option =
            args.providerId === "claude-code"
              ? resolveClaudeMatrixOption({
                  row,
                  context1M: args.context1M,
                })
              : row.option;
          const supportedEfforts =
            args.providerId === "codex"
              ? listCodexReasoningEffortsForModel({ model: option.model })
              : null;

          return (
            <div key={option.key} role="row" className="contents">
              <span
                role="rowheader"
                className="truncate pr-2 text-right text-sm font-medium text-foreground/85"
              >
                {row.shortLabel}
              </span>
              {effortOptions.map((effort, effortIndex) => {
                const autoSlot = isStaveAutoSlot({
                  providerId: args.providerId,
                  row,
                  effort: effort.value,
                });
                const supported =
                  supportedEfforts === null ||
                  (supportedEfforts as readonly string[]).includes(
                    effort.value,
                  );
                const tabStopKey = `${rowIndex}:${effortIndex}`;
                const autoOption = autoSlot ? args.autoOption : undefined;
                if (autoOption) {
                  return (
                    <Tooltip key="stave:auto">
                      <TooltipTrigger
                        render={
                          <span
                            className="flex size-11"
                            onPointerEnter={() =>
                              args.onPreview({
                                modelLabel: "Stave Auto",
                                effortLabel: "chooses model + effort",
                              })
                            }
                          />
                        }
                      >
                        <button
                          ref={(element) => {
                            if (element) {
                              cellRefs.current.set("stave:auto", element);
                            } else {
                              cellRefs.current.delete("stave:auto");
                            }
                          }}
                          type="button"
                          role="gridcell"
                          aria-selected={args.autoSelected}
                          aria-label="Stave Auto · Let Stave choose model and effort"
                          disabled={args.disabled || !autoOption.available}
                          tabIndex={
                            args.autoSelected || tabStopKey === fallbackTabStop
                              ? 0
                              : -1
                          }
                          onFocus={() =>
                            args.onPreview({
                              modelLabel: "Stave Auto",
                              effortLabel: "chooses model + effort",
                            })
                          }
                          onKeyDown={(event) =>
                            handleCellKeyDown(event, rowIndex, effortIndex)
                          }
                          onClick={() => {
                            args.onSelect({ selection: autoOption });
                            args.onClose();
                          }}
                          className="model-effort-cell flex size-11 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <span
                            className={cn(
                              "model-effort-auto-cell-visual relative flex size-9 items-center justify-center overflow-hidden rounded-md transition-transform",
                              args.autoSelected &&
                                "scale-105 ring-2 ring-offset-1 ring-offset-popover",
                            )}
                          >
                            <img
                              src={STAVE_LOGO_URL}
                              alt=""
                              aria-hidden
                              draggable={false}
                              className="relative z-10 size-5"
                            />
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={6}>
                        Stave chooses the provider, model, and effort
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                if (!supported) {
                  return (
                    <span
                      key={`${option.key}:${effort.value}`}
                      role="gridcell"
                      aria-disabled="true"
                      aria-label={`${row.shortLabel} does not support ${effort.label} effort`}
                      className="flex size-11 items-center justify-center text-muted-foreground/50"
                    >
                      <span className="flex size-9 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30">
                        <Minus className="size-3.5" />
                      </span>
                    </span>
                  );
                }

                const selected =
                  option.key === args.selectedModelKey &&
                  effort.value === args.selectedEffort;
                const orb = resolveCellOrbPresentation({
                  effort: effort.value,
                  selected,
                });
                const cellKey = getCellKey({
                  providerId: args.providerId,
                  model: option.model,
                  effort: effort.value,
                });
                return (
                  <button
                    key={cellKey}
                    ref={(element) => {
                      if (element) {
                        cellRefs.current.set(cellKey, element);
                      } else {
                        cellRefs.current.delete(cellKey);
                      }
                    }}
                    type="button"
                    role="gridcell"
                    aria-selected={selected}
                    aria-label={`${option.label}, ${effort.label} effort`}
                    disabled={args.disabled || !option.available}
                    tabIndex={
                      selected || tabStopKey === fallbackTabStop ? 0 : -1
                    }
                    onFocus={() =>
                      args.onPreview({
                        modelLabel: option.label,
                        effortLabel: effort.label,
                      })
                    }
                    onMouseEnter={() =>
                      args.onPreview({
                        modelLabel: option.label,
                        effortLabel: effort.label,
                      })
                    }
                    onKeyDown={(event) =>
                      handleCellKeyDown(event, rowIndex, effortIndex)
                    }
                    onClick={() => {
                      args.onSelect({
                        selection: option,
                        effort: effort.value,
                        ...(args.providerId === "codex"
                          ? { fastMode: args.fastMode }
                          : {}),
                      });
                      args.onClose();
                    }}
                    className={cn(
                      "model-effort-cell flex size-11 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover disabled:cursor-not-allowed disabled:opacity-45",
                    )}
                  >
                    <span
                      data-selected={selected || undefined}
                      data-orb={orb?.kind}
                      style={
                        {
                          "--model-effort-cell-color":
                            PROVIDER_CELL_COLORS[args.providerId][effortIndex],
                        } as CSSProperties
                      }
                      className={cn(
                        "model-effort-cell-visual relative flex size-9 items-center justify-center overflow-hidden rounded-md border border-foreground/5 text-foreground shadow-xs transition-transform",
                        selected && "scale-105",
                      )}
                    >
                      {orb ? (
                        <ThinkingOrb
                          state={orb.state}
                          size={20}
                          speed={orb.speed}
                          theme="dark"
                          style={{ width: 23, height: 23 }}
                          aria-hidden="true"
                          data-orb-state={orb.state}
                          className="model-effort-cell-orb"
                        />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ModelEffortSelector(args: ModelEffortSelectorProps) {
  const [open, setOpen] = useState(false);
  const [context1M, setContext1M] = useState(() =>
    isClaudeContext1MModel(args.value.model),
  );
  const [nextFastMode, setNextFastMode] = useState(args.fastMode ?? false);
  const [preview, setPreview] = useState<ModelEffortPreview | null>(null);
  const handledOpenTokenRef = useRef<string | number | undefined>(
    args.openToken,
  );
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const claudeRows = useMemo(
    () => buildClaudeModelEffortRows(args.options),
    [args.options],
  );
  const codexRows = useMemo(
    () => buildCodexModelEffortRows(args.options),
    [args.options],
  );
  const autoOption = args.options.find((option) => option.isAuto);
  const selectedSummary = args.value.isAuto
    ? "Stave chooses the provider, model, and effort."
    : `${args.value.label}${args.effortLabel ? ` · ${args.effortLabel}` : ""}${
        args.fastMode ? " · Fast" : ""
      }`;
  const activePreview =
    preview ??
    (args.value.isAuto
      ? {
          modelLabel: "Stave Auto",
          effortLabel: "chooses model + effort",
        }
      : args.effortLabel
        ? {
            modelLabel: args.value.label,
            effortLabel: args.effortLabel,
          }
        : null);

  const clearTimer = (ref: typeof openTimerRef) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };
  const supportsHover = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const scheduleOpen = () => {
    if (args.disabled || !supportsHover()) {
      return;
    }
    clearTimer(closeTimerRef);
    clearTimer(openTimerRef);
    openTimerRef.current = window.setTimeout(() => setOpen(true), 120);
  };
  const scheduleClose = () => {
    if (!supportsHover()) {
      return;
    }
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setContext1M(isClaudeContext1MModel(args.value.model));
    setNextFastMode(args.fastMode ?? false);
    setPreview(null);
  }, [args.fastMode, args.value.model, open]);

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

  useEffect(
    () => () => {
      clearTimer(openTimerRef);
      clearTimer(closeTimerRef);
    },
    [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div onPointerEnter={scheduleOpen} onPointerLeave={scheduleClose}>
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={args.disabled}
              aria-label={`Model and effort: ${selectedSummary}`}
              title="Open model and effort selector (Alt+P). Use Alt+1..0 for mapped models."
              className={cn(
                "inline-flex h-9 max-w-[300px] items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2.5 text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:border-border/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                open && "bg-muted/70 focus-visible:border-primary/50",
              )}
            />
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {args.value.isAuto ? (
              <Sparkles className="size-3.5 shrink-0 text-primary" />
            ) : (
              <ModelIcon
                providerId={args.value.providerId}
                model={args.value.model}
                className="size-3.5"
              />
            )}
            <span className="truncate">
              {args.value.label}
              {!args.value.isAuto && args.effortLabel
                ? ` · ${args.effortLabel}`
                : ""}
            </span>
            {!args.value.isAuto && args.fastMode ? (
              <Zap className="size-3.5 shrink-0 fill-current text-prompt-role-fast" />
            ) : null}
          </span>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        onPointerEnter={() => {
          clearTimer(openTimerRef);
          clearTimer(closeTimerRef);
        }}
        onPointerLeave={scheduleClose}
        initialFocus={false}
        aria-label="Model and effort selector"
        className="model-effort-popover w-[min(47rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border border-border/70 bg-popover p-0"
      >
        <div className="grid grid-cols-1 gap-2 p-2 min-[820px]:grid-cols-2">
          <ModelEffortMatrix
            providerId="claude-code"
            rows={claudeRows}
            selectedModelKey={args.value.key}
            selectedEffort={args.effortValue}
            autoSelected={Boolean(args.value.isAuto)}
            context1M={context1M}
            fastMode={nextFastMode}
            disabled={args.disabled}
            headerAction={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="1M context"
                aria-pressed={context1M}
                onClick={() => {
                  const enabled = !context1M;
                  setContext1M(enabled);
                  if (
                    args.value.providerId !== "claude-code" ||
                    args.value.isAuto
                  ) {
                    return;
                  }
                  const selectedRow = claudeRows.find(
                    (row) =>
                      row.option.key === args.value.key ||
                      row.context1MOption?.key === args.value.key,
                  );
                  if (!selectedRow) {
                    return;
                  }
                  args.onSelect({
                    selection: resolveClaudeMatrixOption({
                      row: selectedRow,
                      context1M: enabled,
                    }),
                    effort: args.effortValue,
                  });
                }}
                className={cn(
                  "model-effort-provider-toggle relative h-10 min-w-11 px-2 text-xs font-semibold text-muted-foreground before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-['']",
                )}
              >
                1M
              </Button>
            }
            onPreview={setPreview}
            onSelect={args.onSelect}
            onClose={() => setOpen(false)}
          />
          <ModelEffortMatrix
            providerId="codex"
            rows={codexRows}
            selectedModelKey={args.value.key}
            selectedEffort={args.effortValue}
            autoOption={autoOption}
            autoSelected={Boolean(args.value.isAuto)}
            context1M={context1M}
            fastMode={nextFastMode}
            disabled={args.disabled}
            headerAction={
              args.showFastMode === false ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={nextFastMode}
                  onClick={() => {
                    const enabled = !nextFastMode;
                    setNextFastMode(enabled);
                    args.onFastModeChange?.(enabled);
                  }}
                  className={cn(
                    "relative h-10 min-w-11 px-2 text-xs font-semibold before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-['']",
                    nextFastMode
                      ? "bg-prompt-role-fast/10 text-prompt-role-fast"
                      : "text-muted-foreground",
                  )}
                >
                  <Zap
                    className={cn("size-3.5", nextFastMode && "fill-current")}
                  />
                  Fast
                </Button>
              )
            }
            onPreview={setPreview}
            onSelect={args.onSelect}
            onClose={() => setOpen(false)}
          />
        </div>

        <div
          aria-live="polite"
          className="flex min-h-10 items-center justify-center px-3"
        >
          {activePreview ? (
            <span
              key={`${activePreview.modelLabel}:${activePreview.effortLabel}`}
              className="model-effort-preview-value flex items-center justify-center gap-2"
            >
              <span className="text-sm font-semibold text-foreground">
                {activePreview.modelLabel}
              </span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ×
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {activePreview.effortLabel}
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {selectedSummary}
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
