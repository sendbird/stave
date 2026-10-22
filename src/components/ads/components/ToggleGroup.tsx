import * as stylex from "@stylexjs/stylex";
import { m } from "motion/react";
import { useId, useState } from "react";
import type * as React from "react";

import {
  ToggleGroupRoot,
  ToggleRoot,
  type ToggleGroupRootProps,
} from "../headless/toggle-group";
import { controlChrome } from "../recipes/control-chrome";
import { controlHeights } from "../recipes/control-metrics";
import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { controlWidth } from "../recipes/control-width";
import { themeProps } from "../theming/theme-props";
import { springSmooth, vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { Tooltip } from "./Tooltip";

export type ToggleGroupItem = {
  disabled?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: string;
};

type ToggleGroupValue = NonNullable<ToggleGroupRootProps["value"]>;

export type ToggleGroupProps = Omit<
  ToggleGroupRootProps,
  "children" | "className"
> & {
  className?: string;
  /**
   * Group metric: `compact` (32px group, xs type) for dense chrome such as an
   * inspector header; `regular` (36px, the baseline control height) for forms
   * and filter rows.
   *
   * Both densities share a 28px item (`controlHeights.xs`) and differ in the
   * track inset and type scale, exactly as Tabs composes its own 36px list.
   * `regular` used to stack a 36px item on a 4px inset and a hairline border
   * for a 46px group — 10px taller than the `Button` it sits beside, and off
   * the 28/32/36/40/44 scale entirely.
   */
  density?: "compact" | "regular";
  description?: React.ReactNode;
  /**
   * Render items as compact icon squares: the item `label` moves into a
   * tooltip + aria-label (labels must be strings). Ideal for view-mode
   * switches (list/board) that should read as quiet, icon-only chrome.
   */
  iconOnly?: boolean;
  items: ToggleGroupItem[];
  label?: React.ReactNode;
} & XstyleProp;

export function ToggleGroup({
  className,
  defaultValue,
  density = "regular",
  description,
  iconOnly = false,
  items,
  label,
  multiple = false,
  onValueChange,
  orientation = "horizontal",
  value,
  xstyle,
  ...props
}: ToggleGroupProps) {
  const labelId = useId();
  const descriptionId = useId();
  const indicatorId = useId();
  const groupTheme = themeProps("toggle-group", { density });
  const itemTheme = themeProps("toggle-group-item", { density });

  // The gliding indicator has to know which item is pressed, and Base UI
  // reports that only to the `className`/`render` callbacks — never to
  // children. So the group value is mirrored here (a controlled `value` always
  // wins) rather than reaching for a render prop whose argument shape differs
  // between Base UI versions.
  const [uncontrolledValue, setUncontrolledValue] = useState<ToggleGroupValue>(
    defaultValue ?? [],
  );
  const activeValues = value ?? uncontrolledValue;
  const handleValueChange: NonNullable<
    ToggleGroupRootProps["onValueChange"]
  > = (nextValue, eventDetails) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue, eventDetails);
  };

  return (
    <div
      className={cx(
        sx(
          styles.field,
          label || description ? controlWidth.field : controlWidth.intrinsic,
          xstyle,
        ),
        className,
      )}
    >
      {label ? (
        <div className={sx(styles.label)} id={labelId}>
          {label}
        </div>
      ) : null}
      {description ? (
        <div className={sx(styles.description)} id={descriptionId}>
          {description}
        </div>
      ) : null}
      <ToggleGroupRoot
        {...props}
        {...groupTheme}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={label ? labelId : undefined}
        className={cx(
          sx(
            styles.group,
            groupDensityStyles[density],
            groupOrientationStyles[orientation],
            iconOnly && styles.groupIconOnly,
          ),
          groupTheme.className,
        )}
        defaultValue={defaultValue}
        multiple={multiple}
        onValueChange={handleValueChange}
        orientation={orientation}
        value={value}
      >
        {items.map((item) => {
          const pressed = activeValues.includes(item.value);
          const toggle = (
            <ToggleRoot
              {...itemTheme}
              aria-label={
                iconOnly && typeof item.label === "string"
                  ? item.label
                  : undefined
              }
              className={(state) =>
                cx(
                  sx(
                    styles.item,
                    // `colors` (not `ring`): the chip that used to grow an
                    // `elevationRaised` halo on this element is now its own indicator
                    // layer, so nothing but ink changes on the item itself.
                    transition.colors,
                    controlHeights.xs,
                    itemDensityStyles[density],
                    focusRing.ring,
                    iconOnly && styles.itemIconOnly,
                    state.pressed && styles.itemPressed,
                    state.disabled && styles.itemDisabled,
                    state.disabled && controlChrome.disabled,
                  ),
                  itemTheme.className,
                )
              }
              disabled={item.disabled}
              key={item.value}
              value={item.value}
            >
              {pressed ? (
                <m.span
                  aria-hidden
                  className={sx(styles.indicator)}
                  // A single-select group has exactly one pressed chip, so
                  // Motion can glide it between items on a shared `layoutId` —
                  // the pattern Tabs uses for its own indicator. A multi-select
                  // group has several at once and nothing to glide between, so
                  // the same chip renders statically there.
                  layout={!multiple}
                  layoutId={multiple ? undefined : indicatorId}
                  transition={springSmooth}
                />
              ) : null}
              {item.icon ? (
                <span
                  className={sx(styles.icon, iconDensityStyles[density])}
                  data-ads-control-icon-slot
                >
                  {item.icon}
                </span>
              ) : null}
              {iconOnly && item.icon ? null : (
                <span className={sx(styles.itemLabel)}>{item.label}</span>
              )}
            </ToggleRoot>
          );
          return iconOnly && typeof item.label === "string" ? (
            <Tooltip content={item.label} key={item.value}>
              {toggle}
            </Tooltip>
          ) : (
            toggle
          );
        })}
      </ToggleGroupRoot>
    </div>
  );
}

const styles = stylex.create({
  field: {
    display: "grid",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  // A group carrying a `label`/`description` is a form field: it owns its
  // field column and spans it, so it lines up with the inputs stacked above
  // and below it.
  // A bare group (`aria-label` only) is an inline segmented control — a view
  // switch in a toolbar, a filter row, a topbar density/theme pair. It must
  // size to its chips.
  //
  // This wrapper used to be `inlineSize: 100%` unconditionally, which made a
  // bare group claim its container's full width. Two of them side by side in a
  // flex row therefore each demanded 100%, collapsed the row to one chip's
  // width, and wrapped onto separate lines — the docs topbar rendered its
  // density and theme switches stacked, at 89px instead of the 49px a single
  // chrome row renders (the 48px `chromeRowHeight` token plus its 1px hairline).
  // Every bare consumer in the repo is inline chrome of this kind
  // (Crane's issue layout switch, Mockbird's view mode, Canvas's inspector
  // mode, `StateTimeline`/`BreadcrumbTrail` filters), so none of them wanted
  // the stretch either.
  label: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  description: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
  },
  // The track is `colorSurfaceTint`, not `colorCanvasSubtle`. Subtle is the
  // *interaction wash*, and in dark it sits at L 0.272 — ABOVE the raised
  // surface (0.238) a pressed chip paints with. A chip on that track therefore
  // rendered darker than the track it was supposed to lift off, while still
  // carrying a lift shadow. `colorSurfaceTint` is the recessed role and runs
  // the correct direction in every theme: light 0.975 under a 1.0 chip, dark
  // 0.224 under a 0.238 chip, high contrast 0.967 under 1.0.
  //
  // No border: the group's only job is to bracket its items, and §1.3 is
  // explicit that a container like that gets a temperature step rather than an
  // outline. The old group hairline plus a pressed-item hairline put two
  // concentric borders 4px apart around a segmented control.
  group: {
    alignItems: "center",
    backgroundColor: vars["--ads-color-surface-tint"],
    borderRadius: vars["--ads-radius-control"],
    inlineSize: "fit-content",
  },
  // Inset per density, composed onto a shared 28px item: 28 + 2·4 = 36 for
  // `regular` (the baseline control height) and 28 + 2·2 = 32 for `compact`,
  // one deliberate rung below it. The 2px compact inset is a sub-4px optical
  // value on purpose (§8): a 4px inset would push compact to 36 and collapse
  // the two densities onto one height, and a hairline inset would land on 30,
  // off the scale in the other direction.
  groupCompact: {
    gap: vars["--ads-border-width-hairline"],
    padding: vars["--ads-space-2"],
  },
  groupRegular: {
    gap: vars["--ads-space-4"],
    padding: vars["--ads-space-4"],
  },
  groupHorizontal: {
    display: "inline-flex",
    flexWrap: "wrap",
  },
  groupVertical: {
    alignItems: "stretch",
    display: "inline-grid",
  },
  // Icon-only: quiet, trackless chrome that sits inline with toolbar buttons.
  // Keeps the 2px inset so the group still measures 32px in a `sm` control row.
  groupIconOnly: {
    backgroundColor: "transparent",
    padding: vars["--ads-space-2"],
  },
  item: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: "transparent",
    borderRadius: vars["--ads-radius-control"],
    borderStyle: "none",
    borderWidth: 0,
    // Ink only at rest and on hover — the pressed chip is a separate indicator
    // layer, and a hover *wash* here would both fight that gliding layer and
    // paint the exact fill that used to mean "pressed" (hover and pressed were
    // the same `colorSurfaceRaised`, so hovering an unselected item made it
    // look selected).
    color: {
      default: vars["--ads-color-text-muted"],
      "@media (hover: hover)": {
        default: vars["--ads-color-text-muted"],
        ":hover": vars["--ads-color-text"],
      },
    },
    cursor: "pointer",
    display: "inline-flex",
    // §5 weight roles: a control trigger stops at medium; the pressed item
    // already reads through the chip surface and full-strength ink.
    fontWeight: vars["--ads-font-weight-medium"],
    justifyContent: "center",
    // Height is the shared `controlHeights.xs` metric, composed at the call
    // site for BOTH densities; type/gap/inline padding come from the density
    // keys below.
    paddingBlock: 0,
    position: "relative",
  },
  itemCompact: {
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-8"],
  },
  itemRegular: {
    fontSize: vars["--ads-font-size-body"],
    gap: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  // Flat square metric on purpose: this is chrome *inside* a bordered group, so
  // per §5 it stays shorter than the group's content box and must NOT take the
  // `(pointer: coarse)` bump — the group would grow around it.
  itemIconOnly: {
    inlineSize: vars["--ads-control-height-xs"],
    minBlockSize: vars["--ads-control-height-xs"],
    paddingInline: 0,
  },
  itemPressed: {
    color: vars["--ads-color-text"],
  },
  itemDisabled: {
    cursor: "not-allowed",
  },
  // The pressed chip, as its own layer rather than a state on the item: one
  // fill + one shadow, no border. Three simultaneous depth signals (fill AND
  // hairline AND elevation) on a 28px chip inside a filled track is what made
  // this read heavier than the Button beside it, which is flat by decision
  // (`Button.tsx` — `elevationFlat`).
  indicator: {
    backgroundColor: vars["--ads-color-surface-raised"],
    borderRadius: vars["--ads-radius-control"],
    boxShadow: vars["--ads-elevation-raised"],
    insetBlock: 0,
    insetInline: 0,
    pointerEvents: "none",
    position: "absolute",
    // layer-ok: seats this group's pressed chip beneath its own label
    zIndex: 0,
  },
  // §9: the CONTROL owns the glyph box, never a Lucide `size` prop at the call
  // site. This component never marked itself at all, so both product call sites
  // had grown a hand-written `size={14}`. The wrapper carries the box and
  // `data-ads-control-icon-slot` stretches the SVG to it — the marker meant for
  // a non-shrinking icon wrapper, as opposed to `data-ads-control` on a control
  // whose SVG is a direct child (this one's is a wrapper deep, because the item
  // paints its pressed chip behind its content).
  icon: {
    alignItems: "center",
    color: "currentColor",
    display: "inline-flex",
    flexShrink: 0,
    position: "relative",
    // layer-ok: keeps the glyph above this group's own pressed chip
    zIndex: 1,
  },
  iconCompact: {
    blockSize: vars["--ads-control-icon-size-sm"],
    inlineSize: vars["--ads-control-icon-size-sm"],
  },
  iconRegular: {
    blockSize: vars["--ads-control-icon-size-md"],
    inlineSize: vars["--ads-control-icon-size-md"],
  },
  itemLabel: {
    position: "relative",
    whiteSpace: "nowrap",
    // layer-ok: keeps the label above this group's own pressed chip
    zIndex: 1,
  },
});

const groupOrientationStyles = {
  horizontal: styles.groupHorizontal,
  vertical: styles.groupVertical,
} as const;

const groupDensityStyles = {
  compact: styles.groupCompact,
  regular: styles.groupRegular,
} as const;

const itemDensityStyles = {
  compact: styles.itemCompact,
  regular: styles.itemRegular,
} as const;

const iconDensityStyles = {
  compact: styles.iconCompact,
  regular: styles.iconRegular,
} as const;
