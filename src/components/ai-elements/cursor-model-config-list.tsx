import { Check, Zap } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { cn } from "@/lib/utils";
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

function ConfigurationButton(args: {
  controlKey: string;
  tabStopKey: string;
  label: string;
  pressed: boolean;
  disabled: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
  onFocus: (controlKey: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}) {
  return (
    <button
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
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-transparent px-2 text-xs font-medium text-muted-foreground outline-none transition-[background-color,border-color,color,box-shadow] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
        args.pressed && "border-border/70 bg-muted/70 text-foreground",
        args.className,
      )}
    >
      {args.children}
    </button>
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
  const fixedTitle =
    args.group.variants.length === 1
      ? "Cursor ACP currently advertises one fixed configuration for this model."
      : undefined;

  if (!anchor) {
    return null;
  }

  return (
    <div
      role="listitem"
      data-cursor-model-row={args.group.baseModel}
      className={cn(
        "min-w-0 rounded-lg px-1 py-1 transition-colors hover:bg-muted/35 min-[480px]:px-2",
        selected && "bg-accent/70",
      )}
    >
      <div
        role="toolbar"
        aria-label={`${args.group.label} configuration`}
        className="flex min-w-0 items-center gap-1 min-[480px]:gap-2"
      >
        <button
          type="button"
          data-cursor-control-key={`${args.group.key}:model`}
          aria-label={`${args.group.label}${selected ? ", selected" : ""}`}
          aria-pressed={selected}
          disabled={args.disabled || !anchor.option.available}
          tabIndex={tabStopKey === `${args.group.key}:model` ? 0 : -1}
          onFocus={() => args.onTabStopChange(`${args.group.key}:model`)}
          onKeyDown={handleKeyDown}
          onClick={() => chooseVariant(anchor)}
          className="flex min-h-11 w-24 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-foreground outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 min-[480px]:w-32"
        >
          <ModelIcon providerId="cursor" className="size-3.5" />
          <span className="min-w-0 flex-1 truncate">{args.group.label}</span>
          {anchor.option.isDefault ? (
            <span className="hidden text-[10px] text-muted-foreground min-[560px]:inline">
              Default
            </span>
          ) : null}
        </button>

        <div className="tab-strip-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-contain">
          {hasFast ? (
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
              title={fixedTitle}
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
              className={cn("gap-1.5", anchor.fast && "text-prompt-role-fast")}
            >
              <Zap
                className={cn("size-3.5", anchor.fast && "fill-current")}
                aria-hidden="true"
              />
              Fast
            </ConfigurationButton>
          ) : null}

          {contextValues.map((context) => {
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
                title={contextValues.length === 1 ? fixedTitle : undefined}
                onFocus={args.onTabStopChange}
                onKeyDown={handleKeyDown}
                onClick={() => chooseVariant(variant)}
              >
                {context.toUpperCase()}
              </ConfigurationButton>
            );
          })}

          {hasThinking ? (
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
              title={fixedTitle}
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

          {hasEffort
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
                    className="size-11 px-0"
                  >
                    <span className="flex flex-col items-center gap-0.5">
                      <span className="text-[10px] leading-none">
                        {getEffortShortLabel(effort.label)}
                      </span>
                      <span
                        data-selected={selected && active ? "true" : undefined}
                        className={cn(
                          "model-effort-cell-visual flex size-5 items-center justify-center rounded-sm border border-foreground/5 shadow-xs",
                          !variant && "opacity-30",
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
                            className="size-3"
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
        className="space-y-1 p-1 min-[480px]:p-2"
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
      <p className="border-t border-border/65 px-3 py-2 text-xs text-muted-foreground">
        Options not advertised by Cursor ACP are shown as unavailable.
      </p>
    </div>
  );
}
