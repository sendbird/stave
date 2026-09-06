import { Button as AdsButton } from "@/components/ads/components/Button";
import { Check, Zap } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { cx, sx } from "@/components/ads/utils/stylex";
import type { StyleXValue } from "@/components/ads/utils/stylex";
import { cursorModelConfigStyles as styles } from "./cursor-model-config-list.styles";
import { PROVIDER_ACCENT_COLORS } from "./model-effort-grid";
import { ModelIcon } from "./model-icon";
import {
  CURSOR_MODEL_EFFORT_OPTIONS,
  type CursorModelGroup,
  type CursorModelVariant,
  groupCursorModelOptions,
  resolveCursorModelVariant,
} from "./model-effort-selector.utils";
import type { ModelSelectorOption } from "./model-selector.utils";

const CURSOR_ACCENT_COLOR = PROVIDER_ACCENT_COLORS.cursor;

const FIXED_PARAMETER_TITLE =
  "Cursor advertises a single value for this parameter, so it cannot be changed from here.";

function getEffortShortLabel(label: string) {
  if (label === "Medium") {
    return "Med";
  }
  if (label === "X-High") {
    return "XH";
  }
  return label;
}

function getEffortColor(index: number) {
  const range = Math.max(CURSOR_MODEL_EFFORT_OPTIONS.length - 1, 1);
  const mix = Math.round(24 + (index / range) * 66);
  return `color-mix(in oklch, ${CURSOR_ACCENT_COLOR} ${mix}%, var(--popover))`;
}

function getAnchorVariant(args: {
  group: CursorModelGroup;
  selectedModelKey?: string;
}) {
  return (
    args.group.variants.find(
      (variant) => variant.option.key === args.selectedModelKey,
    ) ??
    args.group.variants.find((variant) => variant.option.isDefault) ??
    args.group.variants[0]
  );
}

function getSelectedControlKey(args: {
  group: CursorModelGroup;
  anchor?: CursorModelVariant;
  selectedModelKey?: string;
}) {
  const anchor = args.anchor;
  if (!anchor || anchor.option.key !== args.selectedModelKey) {
    return `${args.group.key}:model`;
  }
  return anchor.effort
    ? `${args.group.key}:effort:${anchor.effort}`
    : `${args.group.key}:model`;
}

/**
 * A parameter Cursor reports but does not let the client change.
 *
 * Cursor ACP advertises one model id per base model, and `session/set_model`
 * rejects any variant it did not advertise (`-32602 Invalid model value`). A
 * segmented control with a single reachable value reads as broken, so a fixed
 * parameter is shown as a plain label instead of a button that cannot move.
 */
function FixedCapabilityChip(args: { title: string; children: ReactNode }) {
  return (
    <span
      data-cursor-fixed-capability="true"
      title={args.title}
      // Deliberately not button-shaped: no border, no 44px hit area, so it does
      // not read as a control that failed to respond.
      className={sx(styles.fixedChip)}
    >
      {args.children}
    </span>
  );
}

function ConfigurationButton(args: {
  controlKey: string;
  tabStopKey: string;
  label: string;
  pressed: boolean;
  disabled: boolean;
  title?: string;
  extraStyle?: StyleXValue;
  children: ReactNode;
  onFocus: (controlKey: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}) {
  return (
    <AdsButton
      layout="host"
      type="button"
      data-cursor-control-key={args.controlKey}
      aria-label={args.label}
      aria-pressed={args.pressed}
      disabled={args.disabled}
      title={args.title}
      tabIndex={args.controlKey === args.tabStopKey ? 0 : -1}
      onFocus={() => args.onFocus(args.controlKey)}
      onKeyDown={args.onKeyDown}
      onClick={args.onClick}
      className={sx(
        styles.configButton,
        args.pressed && styles.configButtonPressed,
        args.extraStyle,
      )}
    >
      {args.children}
    </AdsButton>
  );
}

function CursorModelRow(args: {
  group: CursorModelGroup;
  selectedModelKey?: string;
  disabled?: boolean;
  tabStopKey?: string;
  onTabStopChange: (controlKey: string) => void;
  onChoose: (option: ModelSelectorOption) => void;
}) {
  const anchor = getAnchorVariant(args);
  const selected = anchor?.option.key === args.selectedModelKey;
  const defaultTabStopKey = getSelectedControlKey({
    group: args.group,
    anchor,
    selectedModelKey: args.selectedModelKey,
  });
  const tabStopKey = args.tabStopKey ?? defaultTabStopKey;
  const contextValues = useMemo(
    () => [
      ...new Set(
        args.group.variants
          .map((variant) => variant.context)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [args.group.variants],
  );
  const hasFast = args.group.variants.some(
    (variant) => variant.fast !== undefined,
  );
  const hasThinking = args.group.variants.some(
    (variant) => variant.thinking !== undefined,
  );
  const hasEffort = args.group.variants.some(
    (variant) => variant.effort !== undefined,
  );
  // A parameter is adjustable only when Cursor advertises a second variant that
  // differs in that parameter. Anything else is fixed for this model, so it is
  // rendered as a label rather than a control that cannot move.
  const fastAdjustable = args.group.variants.some(
    (variant) => variant.fast !== anchor?.fast,
  );
  const thinkingAdjustable = args.group.variants.some(
    (variant) => variant.thinking !== anchor?.thinking,
  );
  const contextAdjustable = contextValues.length > 1;
  const effortAdjustable =
    new Set(
      args.group.variants
        .map((variant) => variant.effort)
        .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    ).size > 1;
  const chooseVariant = (variant?: CursorModelVariant) => {
    if (variant) {
      args.onChoose(variant.option);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const toolbar = event.currentTarget.closest('[role="toolbar"]');
    const controls = Array.from(
      toolbar?.querySelectorAll<HTMLButtonElement>(
        "button[data-cursor-control-key]:not(:disabled)",
      ) ?? [],
    );
    const currentIndex = controls.indexOf(event.currentTarget);
    if (currentIndex < 0 || controls.length === 0) {
      return;
    }
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? controls.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              controls.length) %
            controls.length;
    const next = controls[nextIndex];
    const controlKey = next?.dataset.cursorControlKey;
    if (next && controlKey) {
      args.onTabStopChange(controlKey);
      next.focus();
    }
  };
  if (!anchor) {
    return null;
  }

  return (
    <div
      role="listitem"
      data-cursor-model-row={args.group.baseModel}
      className={sx(styles.row, selected && styles.rowSelected)}
    >
      <div
        role="toolbar"
        aria-label={`${args.group.label} configuration`}
        className={sx(styles.toolbar)}
      >
        <AdsButton
          layout="host"
          type="button"
          data-cursor-control-key={`${args.group.key}:model`}
          aria-label={`${args.group.label}${selected ? ", selected" : ""}`}
          aria-pressed={selected}
          disabled={args.disabled || !anchor.option.available}
          tabIndex={tabStopKey === `${args.group.key}:model` ? 0 : -1}
          onFocus={() => args.onTabStopChange(`${args.group.key}:model`)}
          onKeyDown={handleKeyDown}
          onClick={() => chooseVariant(anchor)}
          title={args.group.label}
          className={sx(styles.modelButton)}
        >
          <ModelIcon providerId="cursor" className={sx(styles.modelIcon)} />
          <span className={sx(styles.modelLabel)}>{args.group.label}</span>
          {anchor.option.isDefault ? (
            <span className={sx(styles.defaultLabel)}>Default</span>
          ) : null}
        </AdsButton>

        <div className={cx(sx(styles.controlStrip), "tab-strip-scroll")}>
          {hasFast && !fastAdjustable ? (
            anchor.fast ? (
              <FixedCapabilityChip title={FIXED_PARAMETER_TITLE}>
                <Zap className={sx(styles.fastIconFixed)} aria-hidden="true" />
                Fast
              </FixedCapabilityChip>
            ) : null
          ) : null}

          {hasFast && fastAdjustable ? (
            <ConfigurationButton
              controlKey={`${args.group.key}:fast`}
              tabStopKey={tabStopKey}
              label={`${args.group.label}, Fast ${anchor.fast ? "on" : "off"}`}
              pressed={anchor.fast === true}
              disabled={
                Boolean(args.disabled) ||
                !resolveCursorModelVariant({
                  group: args.group,
                  anchor,
                  patch: { fast: !anchor.fast },
                })
              }
              onFocus={args.onTabStopChange}
              onKeyDown={handleKeyDown}
              onClick={() =>
                chooseVariant(
                  resolveCursorModelVariant({
                    group: args.group,
                    anchor,
                    patch: { fast: !anchor.fast },
                  }),
                )
              }
              extraStyle={[
                styles.configButtonGap,
                anchor.fast && styles.configButtonFast,
              ]}
            >
              <Zap
                className={sx(
                  styles.fastIcon,
                  anchor.fast && styles.fastIconFilled,
                )}
                aria-hidden="true"
              />
              Fast
            </ConfigurationButton>
          ) : null}

          {!contextAdjustable && anchor.context ? (
            <FixedCapabilityChip title={FIXED_PARAMETER_TITLE}>
              {anchor.context.toUpperCase()}
            </FixedCapabilityChip>
          ) : null}

          {(contextAdjustable ? contextValues : []).map((context) => {
            const variant = resolveCursorModelVariant({
              group: args.group,
              anchor,
              patch: { context },
            });
            const controlKey = `${args.group.key}:context:${context}`;
            return (
              <ConfigurationButton
                key={context}
                controlKey={controlKey}
                tabStopKey={tabStopKey}
                label={`${args.group.label}, ${context.toUpperCase()} context`}
                pressed={anchor.context === context}
                disabled={
                  Boolean(args.disabled) ||
                  !variant ||
                  (contextValues.length === 1 && anchor.context === context)
                }
                onFocus={args.onTabStopChange}
                onKeyDown={handleKeyDown}
                onClick={() => chooseVariant(variant)}
              >
                {context.toUpperCase()}
              </ConfigurationButton>
            );
          })}

          {hasThinking && !thinkingAdjustable ? (
            anchor.thinking ? (
              <FixedCapabilityChip title={FIXED_PARAMETER_TITLE}>
                Thinking
              </FixedCapabilityChip>
            ) : null
          ) : null}

          {hasThinking && thinkingAdjustable ? (
            <ConfigurationButton
              controlKey={`${args.group.key}:thinking`}
              tabStopKey={tabStopKey}
              label={`${args.group.label}, Thinking ${anchor.thinking ? "on" : "off"}`}
              pressed={anchor.thinking === true}
              disabled={
                Boolean(args.disabled) ||
                !resolveCursorModelVariant({
                  group: args.group,
                  anchor,
                  patch: { thinking: !anchor.thinking },
                })
              }
              onFocus={args.onTabStopChange}
              onKeyDown={handleKeyDown}
              onClick={() =>
                chooseVariant(
                  resolveCursorModelVariant({
                    group: args.group,
                    anchor,
                    patch: { thinking: !anchor.thinking },
                  }),
                )
              }
            >
              Thinking
            </ConfigurationButton>
          ) : null}

          {hasEffort && !effortAdjustable && anchor.effort ? (
            <FixedCapabilityChip title={FIXED_PARAMETER_TITLE}>
              {CURSOR_MODEL_EFFORT_OPTIONS.find(
                (effort) => effort.value === anchor.effort,
              )?.label ?? anchor.effort}
            </FixedCapabilityChip>
          ) : null}

          {hasEffort && effortAdjustable
            ? CURSOR_MODEL_EFFORT_OPTIONS.map((effort, effortIndex) => {
                const variant = resolveCursorModelVariant({
                  group: args.group,
                  anchor,
                  patch: { effort: effort.value },
                });
                const active = anchor.effort === effort.value;
                const controlKey = `${args.group.key}:effort:${effort.value}`;
                return (
                  <ConfigurationButton
                    key={effort.value}
                    controlKey={controlKey}
                    tabStopKey={tabStopKey}
                    label={`${args.group.label}, ${effort.label} effort${variant ? "" : ", unavailable"}`}
                    pressed={selected && active}
                    disabled={Boolean(args.disabled) || !variant}
                    title={
                      variant ? effort.label : "Not advertised by Cursor ACP."
                    }
                    onFocus={args.onTabStopChange}
                    onKeyDown={handleKeyDown}
                    onClick={() => chooseVariant(variant)}
                    extraStyle={styles.configButtonEffort}
                  >
                    <span className={sx(styles.effortInner)}>
                      <span className={sx(styles.effortShortLabel)}>
                        {getEffortShortLabel(effort.label)}
                      </span>
                      <span
                        data-selected={selected && active ? "true" : undefined}
                        className={cx(
                          sx(
                            styles.effortVisual,
                            !variant && styles.effortVisualUnavailable,
                          ),
                          "model-effort-cell-visual",
                        )}
                        style={
                          {
                            "--model-effort-cell-color":
                              getEffortColor(effortIndex),
                            "--model-effort-provider": CURSOR_ACCENT_COLOR,
                          } as CSSProperties
                        }
                      >
                        {selected && active ? (
                          <Check
                            className={sx(styles.effortCheck)}
                            strokeWidth={2.5}
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                    </span>
                  </ConfigurationButton>
                );
              })
            : null}
        </div>
      </div>
    </div>
  );
}

export function CursorModelConfigList(args: {
  options: readonly ModelSelectorOption[];
  selectedModelKey?: string;
  disabled?: boolean;
  onChoose: (option: ModelSelectorOption) => void;
}) {
  const groups = useMemo(
    () => groupCursorModelOptions(args.options),
    [args.options],
  );
  const [tabStops, setTabStops] = useState<Record<string, string>>({});

  if (groups.length === 0) {
    return null;
  }

  return (
    <div>
      <div
        role="list"
        aria-label="Cursor model configurations"
        className={sx(styles.list)}
      >
        {groups.map((group) => (
          <CursorModelRow
            key={group.key}
            group={group}
            selectedModelKey={args.selectedModelKey}
            disabled={args.disabled}
            tabStopKey={tabStops[group.key]}
            onTabStopChange={(controlKey) =>
              setTabStops((current) => ({
                ...current,
                [group.key]: controlKey,
              }))
            }
            onChoose={args.onChoose}
          />
        ))}
      </div>
      <p className={sx(styles.footer)}>
        Buttons change the model. Plain labels are parameters Cursor reports but
        advertises only one value for, so they cannot be changed from here.
      </p>
    </div>
  );
}
