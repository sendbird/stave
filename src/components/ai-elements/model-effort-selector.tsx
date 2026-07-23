import { Check, ChevronDown, Minus, Sparkles, Zap } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import {
  getProviderLabel,
  listCodexReasoningEffortsForModel,
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

interface ModelEffortSelectorProps {
  value: ModelSelectorOption;
  options: readonly ModelSelectorOption[];
  effortValue?: ModelEffortValue;
  effortLabel?: string;
  fastMode?: boolean;
  disabled?: boolean;
  openToken?: string | number;
  onFastModeChange?: (enabled: boolean) => void;
  onSelect: (args: {
    selection: ModelSelectorOption;
    effort?: ModelEffortValue;
    fastMode?: boolean;
  }) => void;
}

const PROVIDER_CELL_TONES: Record<ProviderId, readonly string[]> = {
  "claude-code": [
    "bg-provider-claude/15",
    "bg-provider-claude/25",
    "bg-provider-claude/40",
    "bg-provider-claude/55",
    "bg-provider-claude/70",
  ],
  codex: [
    "bg-provider-codex/15",
    "bg-provider-codex/25",
    "bg-provider-codex/40",
    "bg-provider-codex/55",
    "bg-provider-codex/70",
    "bg-provider-codex/85",
  ],
};

const PROVIDER_SELECTED_RING: Record<ProviderId, string> = {
  "claude-code": "ring-provider-claude",
  codex: "ring-provider-codex",
};

function getCellKey(args: {
  providerId: ProviderId;
  model: string;
  effort: string;
}) {
  return `${args.providerId}:${args.model}:${args.effort}`;
}

function ModelEffortMatrix(args: {
  providerId: ProviderId;
  rows: readonly ModelEffortMatrixRow[];
  selectedModelKey: string;
  selectedEffort?: ModelEffortValue;
  context1M: boolean;
  fastMode: boolean;
  disabled?: boolean;
  onPreview: (preview: string | null) => void;
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
  const fallbackTabStop = `${Math.max(selectedRowIndex, 0)}:${Math.max(
    effortOptions.findIndex((option) => option.value === args.selectedEffort),
    0,
  )}`;

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
      className="min-w-0 rounded-lg border border-border/70 bg-background/60 p-3"
    >
      <div className="mb-3 flex items-center gap-2">
        <ModelIcon providerId={args.providerId} className="size-4" />
        <h3
          className={cn(
            "text-sm font-medium",
            args.providerId === "claude-code"
              ? "text-provider-claude"
              : "text-provider-codex",
          )}
        >
          {getProviderLabel({ providerId: args.providerId })}
        </h3>
      </div>
      <div
        role="grid"
        aria-label={`${getProviderLabel({ providerId: args.providerId })} model effort matrix`}
        className="grid items-center gap-1"
        style={{
          gridTemplateColumns: `minmax(3rem, 1fr) repeat(${effortOptions.length}, 2.75rem)`,
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
                className="truncate pr-1 text-sm font-medium"
              >
                {row.shortLabel}
              </span>
              {effortOptions.map((effort, effortIndex) => {
                const supported =
                  supportedEfforts === null ||
                  (supportedEfforts as readonly string[]).includes(
                    effort.value,
                  );
                if (!supported) {
                  return (
                    <span
                      key={`${option.key}:${effort.value}`}
                      role="gridcell"
                      aria-disabled="true"
                      aria-label={`${row.shortLabel} does not support ${effort.label} effort`}
                      className="flex size-11 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/30 text-muted-foreground/50"
                    >
                      <Minus className="size-3.5" />
                    </span>
                  );
                }

                const selected =
                  option.key === args.selectedModelKey &&
                  effort.value === args.selectedEffort;
                const cellKey = getCellKey({
                  providerId: args.providerId,
                  model: option.model,
                  effort: effort.value,
                });
                const tabStopKey = `${rowIndex}:${effortIndex}`;
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
                      args.onPreview(`${option.label} · ${effort.label}`)
                    }
                    onMouseEnter={() =>
                      args.onPreview(`${option.label} · ${effort.label}`)
                    }
                    onMouseLeave={() => args.onPreview(null)}
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
                      "flex size-11 items-center justify-center rounded-md border border-foreground/5 text-foreground shadow-xs outline-none transition-[box-shadow,transform] hover:ring-2 hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45",
                      PROVIDER_CELL_TONES[args.providerId][effortIndex],
                      selected &&
                        cn(
                          "ring-2 ring-offset-2 ring-offset-popover",
                          PROVIDER_SELECTED_RING[args.providerId],
                        ),
                    )}
                  >
                    {selected ? <Check className="size-4" /> : null}
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
  const [preview, setPreview] = useState<string | null>(null);
  const titleId = useId();
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
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={args.disabled}
            aria-label={`Model and effort: ${selectedSummary}`}
            title="Open model and effort selector (Alt+P). Use Alt+1..0 for mapped models."
            className={cn(
              "inline-flex h-9 max-w-[300px] items-center justify-between gap-1.5 rounded-md border border-transparent bg-transparent px-2.5 text-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:border-border/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
              open && "bg-muted/70 focus-visible:border-primary/50",
            )}
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
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
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
        aria-labelledby={titleId}
        className="w-[min(52rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border border-border/80 bg-popover p-0 shadow-lg"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border/70 px-3 py-2">
          <div className="flex justify-start">
            <Button
              type="button"
              variant={context1M ? "secondary" : "ghost"}
              size="sm"
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
                "h-11 min-w-11",
                context1M && "text-provider-claude",
              )}
            >
              1M
            </Button>
          </div>
          <div className="text-center">
            <p id={titleId} className="text-sm font-medium">
              Model &amp; effort
            </p>
            <p className="text-xs text-muted-foreground">
              Hover to preview, click to apply
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant={nextFastMode ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={nextFastMode}
              onClick={() => {
                const enabled = !nextFastMode;
                setNextFastMode(enabled);
                args.onFastModeChange?.(enabled);
              }}
              className={cn(
                "h-11 min-w-11",
                nextFastMode && "text-prompt-role-fast",
              )}
            >
              <Zap className={cn("size-3.5", nextFastMode && "fill-current")} />
              Fast
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-3 min-[820px]:grid-cols-2">
          <ModelEffortMatrix
            providerId="claude-code"
            rows={claudeRows}
            selectedModelKey={args.value.key}
            selectedEffort={args.effortValue}
            context1M={context1M}
            fastMode={nextFastMode}
            disabled={args.disabled}
            onPreview={setPreview}
            onSelect={args.onSelect}
            onClose={() => setOpen(false)}
          />
          <ModelEffortMatrix
            providerId="codex"
            rows={codexRows}
            selectedModelKey={args.value.key}
            selectedEffort={args.effortValue}
            context1M={context1M}
            fastMode={nextFastMode}
            disabled={args.disabled}
            onPreview={setPreview}
            onSelect={args.onSelect}
            onClose={() => setOpen(false)}
          />
        </div>

        <div
          aria-live="polite"
          className="flex min-h-9 items-center justify-center border-t border-border/60 px-3 text-sm text-muted-foreground"
        >
          {preview ?? selectedSummary}
        </div>

        {autoOption ? (
          <div className="border-t border-border/70 p-2">
            <button
              type="button"
              disabled={args.disabled || !autoOption.available}
              aria-pressed={args.value.isAuto}
              onClick={() => {
                args.onSelect({ selection: autoOption });
                setOpen(false);
              }}
              className={cn(
                "flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                args.value.isAuto && "bg-primary/10 text-primary",
              )}
            >
              <Sparkles className="size-4" />
              <span>Auto · Let Stave choose model and effort</span>
              {args.value.isAuto ? <Check className="size-4" /> : null}
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
