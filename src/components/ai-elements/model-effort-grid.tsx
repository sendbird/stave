import { Button as AdsButton } from "@/components/ads/components/Button";
import { Check, Minus } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useMemo, useRef } from "react";
import type { ProviderId } from "@/lib/providers/provider.types";
import { cx, sx } from "@/components/ads/utils/stylex";
import { modelEffortGridStyles as styles } from "./model-effort-grid.styles";
import { ModelIcon } from "./model-icon";
import {
  getCursorModelPresentation,
  listModelEfforts,
  listProviderEffortScale,
  type ModelEffortValue,
} from "./model-effort-selector.utils";
import type { ModelSelectorOption } from "./model-selector.utils";

export const PROVIDER_ACCENT_COLORS: Record<ProviderId, string> = {
  "claude-code": "var(--provider-claude)",
  codex: "var(--provider-codex)",
  cursor: "var(--foreground)",
  kiro: "var(--primary)",
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
  const cellRefs = useRef(new Map<string, HTMLElement>());
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
  const availableCellKeys = effortfulOptions
    .filter((option) => option.available)
    .flatMap((option) =>
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
    if (!option?.available || !effort || args.disabled) {
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
    <div className={sx(styles.scroller)}>
      <div
        role="grid"
        aria-label="Model and reasoning effort"
        aria-colcount={scale.length + 1}
        aria-rowcount={effortfulOptions.length + 1}
        className={sx(styles.grid)}
        style={
          {
            gridTemplateColumns: `minmax(var(--model-effort-row-width), 1fr) repeat(${scale.length}, 2.75rem)`,
            "--model-effort-provider": PROVIDER_ACCENT_COLORS[args.providerId],
          } as CSSProperties
        }
      >
        <div role="row" className={sx(styles.contents)}>
          <span role="columnheader" className={sx(styles.columnHeaderModel)}>
            Model
          </span>
          {scale.map((effort) => (
            <span
              key={effort.value}
              role="columnheader"
              title={effort.label}
              className={sx(styles.columnHeaderEffort)}
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
            <div key={option.key} role="row" className={sx(styles.contents)}>
              <span
                role="rowheader"
                title={option.model}
                className={sx(styles.rowHeader)}
              >
                <ModelIcon
                  providerId={option.providerId}
                  className={sx(styles.rowHeaderIcon)}
                />
                <span className={sx(styles.rowHeaderLabel)}>{modelLabel}</span>
                {option.isDefault ? (
                  <span className={sx(styles.defaultBadge)}>Default</span>
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
                      className={sx(styles.unsupportedCell)}
                    >
                      <span className={sx(styles.unsupportedGlyph)}>
                        <Minus
                          className={sx(styles.unsupportedIcon)}
                          aria-hidden="true"
                        />
                      </span>
                    </span>
                  );
                }
                const selected =
                  option.key === args.selectedModelKey &&
                  effort.value === args.selectedEffort;
                const cellKey = getCellKey(option, effort.value);
                return (
                  <AdsButton
                    layout="host"
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
                    className={cx(sx(styles.cell), "model-effort-cell")}
                  >
                    <span
                      data-selected={selected || undefined}
                      className={cx(
                        sx(
                          styles.cellVisual,
                          selected && styles.cellVisualSelected,
                        ),
                        "model-effort-cell-visual",
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
                          className={sx(styles.checkIcon)}
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                  </AdsButton>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
