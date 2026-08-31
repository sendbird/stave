import { Check, Minus } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useMemo, useRef } from "react";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cn } from "@/lib/utils";
import { ModelIcon } from "./model-icon";
import {
  getCursorModelPresentation,
  listModelEfforts,
  listProviderEffortScale,
  type ModelEffortValue,
} from "./model-effort-selector.utils";
import type { ModelSelectorOption } from "./model-selector.utils";

export const PROVIDER_ACCENT_COLORS: Record<ProviderId, string> = {
  "claude-code": "#d97757",
  codex: "#4169c1",
  cursor: "light-dark(#26251e, #edecec)",
  kiro: "#9046ff",
};

function getCellKey(option: ModelSelectorOption, effort: ModelEffortValue) {
  return `${option.key}:${effort}`;
}

function getEffortShortLabel(label: string) {
  if (label === "Medium") {
    return "Med";
  }
  if (label === "X-High") {
    return "XH";
  }
  return label;
}

function getCellColor(args: {
  providerId: ProviderId;
  index: number;
  count: number;
}) {
  const range = Math.max(args.count - 1, 1);
  const mix = Math.round(24 + (args.index / range) * 66);
  return `color-mix(in oklch, ${PROVIDER_ACCENT_COLORS[args.providerId]} ${mix}%, var(--popover))`;
}

export function ModelEffortGrid(args: {
  providerId: ProviderId;
  options: readonly ModelSelectorOption[];
  selectedModelKey?: string;
  selectedEffort?: ModelEffortValue;
  disabled?: boolean;
  onChoose: (option: ModelSelectorOption, effort: ModelEffortValue) => void;
}) {
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const scale = listProviderEffortScale(args.providerId);
  const effortsByOption = useMemo(
    () =>
      new Map(
        args.options.map((option) => [option.key, listModelEfforts(option)]),
      ),
    [args.options],
  );
  const effortfulOptions = args.options.filter(
    (option) => (effortsByOption.get(option.key)?.length ?? 0) > 0,
  );
  const selectedCellKey =
    args.selectedModelKey && args.selectedEffort
      ? `${args.selectedModelKey}:${args.selectedEffort}`
      : undefined;
  const availableCellKeys = effortfulOptions.flatMap((option) =>
    (effortsByOption.get(option.key) ?? []).map((effort) =>
      getCellKey(option, effort.value),
    ),
  );
  const firstCell = availableCellKeys[0];
  const tabStopKey =
    selectedCellKey && availableCellKeys.includes(selectedCellKey)
      ? selectedCellKey
      : firstCell;

  const focusCell = (rowIndex: number, effortIndex: number) => {
    const option = effortfulOptions[rowIndex];
    const effort = scale[effortIndex];
    if (!option || !effort) {
      return false;
    }
    if (
      !(effortsByOption.get(option.key) ?? []).some(
        (candidate) => candidate.value === effort.value,
      )
    ) {
      return false;
    }
    cellRefs.current.get(getCellKey(option, effort.value))?.focus();
    return true;
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    rowIndex: number,
    effortIndex: number,
  ) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    if (event.key === "Home" || event.key === "End") {
      const start = event.key === "Home" ? 0 : scale.length - 1;
      const step = event.key === "Home" ? 1 : -1;
      for (
        let nextEffort = start;
        nextEffort >= 0 && nextEffort < scale.length;
        nextEffort += step
      ) {
        if (focusCell(rowIndex, nextEffort)) {
          return;
        }
      }
      return;
    }
    const rowStep =
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const effortStep =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    let nextRow = rowIndex + rowStep;
    let nextEffort = effortIndex + effortStep;
    while (
      nextRow >= 0 &&
      nextRow < effortfulOptions.length &&
      nextEffort >= 0 &&
      nextEffort < scale.length
    ) {
      if (focusCell(nextRow, nextEffort)) {
        return;
      }
      nextRow += rowStep;
      nextEffort += effortStep;
    }
  };

  if (effortfulOptions.length === 0 || scale.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 overflow-x-auto overscroll-contain p-1 min-[480px]:p-2">
      <div
        role="grid"
        aria-label="Model and reasoning effort"
        aria-colcount={scale.length + 1}
        aria-rowcount={effortfulOptions.length + 1}
        className="grid w-full items-center gap-x-0 gap-y-1 [--model-effort-row-width:6rem] min-[480px]:gap-x-0.5 min-[480px]:[--model-effort-row-width:6.75rem]"
        style={
          {
            gridTemplateColumns: `minmax(var(--model-effort-row-width), 1fr) repeat(${scale.length}, 2.75rem)`,
            "--model-effort-provider": PROVIDER_ACCENT_COLORS[args.providerId],
          } as CSSProperties
        }
      >
        <div role="row" className="contents">
          <span
            role="columnheader"
            className="px-2 text-xs font-medium text-muted-foreground"
          >
            Model
          </span>
          {scale.map((effort) => (
            <span
              key={effort.value}
              role="columnheader"
              title={effort.label}
              className="text-center text-[11px] font-medium text-muted-foreground"
            >
              {getEffortShortLabel(effort.label)}
            </span>
          ))}
        </div>

        {effortfulOptions.map((option, rowIndex) => {
          const modelLabel = getCursorModelPresentation(option).label;
          const supported = new Set(
            (effortsByOption.get(option.key) ?? []).map(
              (effort) => effort.value,
            ),
          );
          return (
            <div key={option.key} role="row" className="contents">
              <span
                role="rowheader"
                title={option.model}
                className="flex min-w-0 items-center gap-2 px-2"
              >
                <ModelIcon
                  providerId={option.providerId}
                  className="size-3.5"
                />
                <span className="max-w-32 truncate text-sm font-medium text-foreground/90">
                  {modelLabel}
                </span>
                {option.isDefault ? (
                  <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground min-[480px]:inline-flex">
                    Default
                  </span>
                ) : null}
              </span>

              {scale.map((effort, effortIndex) => {
                if (!supported.has(effort.value)) {
                  return (
                    <span
                      key={`${option.key}:${effort.value}`}
                      role="gridcell"
                      aria-disabled="true"
                      aria-label={`${modelLabel} does not support ${effort.label} effort`}
                      className="flex size-11 items-center justify-center text-muted-foreground/45"
                    >
                      <span className="flex size-8 items-center justify-center rounded-md border border-dashed border-border/65 bg-muted/25">
                        <Minus className="size-3" aria-hidden="true" />
                      </span>
                    </span>
                  );
                }
                const selected =
                  option.key === args.selectedModelKey &&
                  effort.value === args.selectedEffort;
                const cellKey = getCellKey(option, effort.value);
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
                    aria-label={`${modelLabel}, ${effort.label} effort`}
                    disabled={args.disabled || !option.available}
                    tabIndex={cellKey === tabStopKey ? 0 : -1}
                    onKeyDown={(event) =>
                      handleKeyDown(event, rowIndex, effortIndex)
                    }
                    onClick={() => args.onChoose(option, effort.value)}
                    className="model-effort-cell flex size-11 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span
                      data-selected={selected || undefined}
                      className={cn(
                        "model-effort-cell-visual flex size-8 items-center justify-center rounded-md border border-foreground/5 text-foreground shadow-xs transition-transform",
                        selected && "scale-105",
                      )}
                      style={
                        {
                          "--model-effort-cell-color": getCellColor({
                            providerId: args.providerId,
                            index: effortIndex,
                            count: scale.length,
                          }),
                        } as CSSProperties
                      }
                    >
                      {selected ? (
                        <Check
                          className="size-4"
                          strokeWidth={2.5}
                          aria-hidden="true"
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
    </div>
  );
}
