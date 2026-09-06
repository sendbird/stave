import { useId, useState } from "react";
import type * as React from "react";

import type { SelectRootProps } from "../headless/select";
import { styles } from "../recipes/select-styles";
import { type PopupPlacement } from "../utils/placement";
import { sx } from "../utils/stylex";
import { clearValueStylesBySize, SelectClearField } from "./Select.clear";
import {
  selectCompoundParts,
  type SelectPositionerProps,
  type SelectSize,
} from "./Select.parts";

/** Base UI's second `onValueChange` argument, named once for the clear path. */
type SelectValueChangeDetails = Parameters<
  NonNullable<SelectRootProps["onValueChange"]>
>[1];

/**
 * The array (convenience) half of `Select` — `<Select options={[…]} />`. A thin
 * re-implementation on top of the compound parts in `Select.parts`; the root
 * that joins the two into one export is `Select`.
 */

const {
  Icon,
  Item,
  ItemIndicator,
  ItemText,
  Label: CompoundLabel,
  List,
  Popup,
  Portal,
  Positioner,
  Root,
  ScrollDownArrow,
  ScrollUpArrow,
  Trigger,
  Value,
} = selectCompoundParts;

export type SelectOption = {
  description?: string;
  disabled?: boolean;
  /**
   * Optional leading visual (status icon, color swatch, avatar) rendered before
   * the label in both the option list and the trigger's selected value.
   */
  icon?: React.ReactNode;
  label: string;
  value: string;
};

export type SelectProps = Omit<SelectRootProps, "children" | "items"> &
  Pick<SelectPositionerProps, "alignItemWithTrigger" | "sideOffset"> & {
    /** Accessible name for compact selects without a visible `label`. */
    "aria-label"?: string;
    /** Id reference for an external visible label. */
    "aria-labelledby"?: string;
    /**
     * Show a clear mark once something is selected, resetting the Select to its
     * placeholder. Off by default: an optional field is the caller's claim to
     * make, and a required one must not offer a way back to "nothing".
     *
     * The mark hides while the control is `disabled` or `readOnly` — in both
     * the value is information rather than a choice.
     */
    clearable?: boolean;
    /** Accessible name for the clear mark. @default "Clear selection" */
    clearLabel?: string;
    emptyText?: string;
    error?: React.ReactNode;
    label?: string;
    loading?: boolean;
    /**
     * Copy shown while `loading`. Same escape hatch as `Command`'s
     * `loadingText` — the string was hard-coded and therefore untranslatable.
     * @default "Loading options…"
     */
    loadingText?: React.ReactNode;
    options: SelectOption[];
    placeholder?: string;
    /**
     * Where the list opens. @default "bottom-start". `alignItemWithTrigger` is
     * off by default, so this is what positions the list; turn that on and the
     * list covers the trigger instead, with this as its fallback.
     */
    placement?: PopupPlacement;
    /** Control height: xs 28px / sm 32px / md 36px (default) / lg 40px. */
    size?: SelectSize;
    /**
     * 포지셔너 z-index 오버라이드 — 소비 앱의 고정 크롬이 DS z-스케일
     * (`vars.zIndexDropdown`)보다 높은 레이어(z 900+ 등)를 쓸 때 옵션 목록이
     * 그 크롬/패널 뒤에 깔리지 않게 한다. Tooltip의 `zIndex`와 같은 탈출구.
     */
    zIndex?: number;
  };

export function SelectArray({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  alignItemWithTrigger,
  placement,
  sideOffset,
  zIndex,
  clearable = false,
  clearLabel = "Clear selection",
  defaultValue,
  emptyText = "No options available.",
  error,
  label,
  loading = false,
  // Unicode ellipsis — this package's convention (`FilterBar` "Search…",
  // `AlertDialog` "Working…"), not three ASCII periods.
  loadingText = "Loading options…",
  onValueChange,
  options,
  // A placeholder stands in for an *unset value*; "Select" just restated the
  // control's own name, so an empty select read like a button label.
  placeholder = "Select an option",
  // Defaulted once here rather than letting `Trigger` and `Item` each fall
  // back on their own — one value reaches the trigger and every option row.
  size: resolvedSize = "md",
  value,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const errorId = error ? `${generatedId}-error` : undefined;
  /*
   * Clearing needs a value to write, and Base UI's Select exposes no
   * imperative setter — its `actionsRef` carries `unmount` and nothing else.
   * So an UNCONTROLLED clearable Select is mirrored here and handed back to the
   * root as a controlled one. The mirror exists only while `clearable` is on,
   * which is what keeps every existing call site on Base UI's own uncontrolled
   * state and its exact `defaultValue` semantics.
   */
  const mirrored = clearable && value === undefined;
  // Seeded with the empty value rather than `undefined` when the caller gave no
  // `defaultValue`: handing Base UI `value={undefined}` would read as
  // uncontrolled, and the root would flip to controlled on the first selection
  // — React's "changing an uncontrolled component" warning, and a root that
  // then ignores the clear.
  const [ownValue, setOwnValue] = useState<unknown>(
    defaultValue ?? (props.multiple ? [] : null),
  );
  const selectedValue = mirrored ? ownValue : value;
  const hasValue = Array.isArray(selectedValue)
    ? selectedValue.length > 0
    : selectedValue !== null &&
      selectedValue !== undefined &&
      selectedValue !== "";
  // `disabled` and `readOnly` are the two states where the value is
  // information rather than a choice, so neither offers a way to throw it away.
  const showClear = clearable && hasValue && !props.disabled && !props.readOnly;

  function clearSelection(event: React.MouseEvent<HTMLButtonElement>) {
    // Multi-select's empty value is an empty array; Base UI never hands `null`
    // to a `multiple` root and neither does this.
    const next = props.multiple ? [] : null;
    if (mirrored) setOwnValue(next);
    /*
     * A controlled caller only learns about the reset through this callback, so
     * it fires with hand-built details rather than being skipped. `reason` is
     * `"none"` — the Select's own vocabulary for a change no Base UI gesture
     * produced — and the cancel/propagation hooks are inert because there is no
     * Base UI handling left to cancel.
     */
    const details: SelectValueChangeDetails = {
      allowPropagation: () => {},
      cancel: () => {},
      event: event.nativeEvent,
      isCanceled: false,
      isPropagationAllowed: false,
      reason: "none",
      trigger: event.currentTarget,
    };
    onValueChange?.(next, details);
  }

  const trigger = (
    <Trigger
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      {...(ariaLabelledby !== undefined
        ? { "aria-labelledby": ariaLabelledby }
        : {})}
      aria-describedby={errorId}
      aria-invalid={error ? true : undefined}
      invalid={Boolean(error)}
      size={resolvedSize}
    >
      <Value
        className={
          showClear ? sx(clearValueStylesBySize[resolvedSize]) : undefined
        }
        placeholder={placeholder}
      >
        {
          // Multi-select values are arrays; leave those to Base UI's own
          // `resolveMultipleLabels` default instead of racing it here.
          props.multiple
            ? undefined
            : // Named `rendered` rather than `value` since the clear path
              // brought an outer `value` binding into scope, and a shadow here
              // is a rename away from silently reading the wrong one.
              (rendered: unknown) => {
                // Resolved from the live Base UI select context (works in
                // both controlled and uncontrolled mode) rather than the
                // `value` prop, which is `undefined` whenever the caller only
                // passed `defaultValue` — see Select.array.tsx bug 7.
                const selected =
                  typeof rendered === "string"
                    ? options.find((option) => option.value === rendered)
                    : undefined;
                if (selected) {
                  return (
                    <>
                      {selected.icon ? (
                        <span className={sx(styles.valueIcon)}>
                          {selected.icon}
                        </span>
                      ) : null}
                      {selected.label}
                    </>
                  );
                }
                // No option matches (nothing selected, or a stale value
                // outside `options`): mirror Base UI's own fallback for a
                // flat, non-grouped `items` array — the raw value once
                // something is actually selected, the placeholder
                // otherwise.
                return typeof rendered === "string" ? rendered : placeholder;
              }
        }
      </Value>
      <Icon />
    </Trigger>
  );

  return (
    <Root
      {...props}
      defaultValue={mirrored ? undefined : defaultValue}
      items={options}
      onValueChange={(next, details) => {
        if (mirrored) setOwnValue(next);
        onValueChange?.(next, details);
      }}
      value={mirrored ? ownValue : value}
    >
      <div className={sx(styles.field)}>
        {label ? <CompoundLabel>{label}</CompoundLabel> : null}
        {showClear ? (
          <SelectClearField
            clearLabel={clearLabel}
            onClear={clearSelection}
            size={resolvedSize}
          >
            {trigger}
          </SelectClearField>
        ) : (
          trigger
        )}
        {error ? (
          <div className={sx(styles.error)} id={errorId} role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <Portal>
        <Positioner
          alignItemWithTrigger={alignItemWithTrigger}
          placement={placement}
          sideOffset={sideOffset}
          style={zIndex !== undefined ? { zIndex } : undefined}
        >
          <Popup>
            <ScrollUpArrow />
            <List>
              {loading ? (
                // `role="status"` (matching Combobox), not `presentation`:
                // this row is the only signal that options are still coming,
                // and `presentation` left a screen-reader user with silence.
                <div className={sx(styles.empty)} role="status">
                  {loadingText}
                </div>
              ) : options.length === 0 ? (
                <div className={sx(styles.empty)} role="presentation">
                  {emptyText}
                </div>
              ) : (
                options.map((option) => (
                  <Item
                    disabled={option.disabled}
                    size={resolvedSize}
                    key={option.value}
                    value={option.value}
                  >
                    <ItemIndicator />
                    <ItemText>
                      <span className={sx(styles.itemCopy)}>
                        <span className={sx(styles.itemLabelLine)}>
                          {option.icon ? (
                            <span className={sx(styles.itemLeadingIcon)}>
                              {option.icon}
                            </span>
                          ) : null}
                          <span className={sx(styles.itemLabel)}>
                            {option.label}
                          </span>
                        </span>
                        {option.description ? (
                          <span className={sx(styles.itemDescription)}>
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </ItemText>
                  </Item>
                ))
              )}
            </List>
            <ScrollDownArrow />
          </Popup>
        </Positioner>
      </Portal>
    </Root>
  );
}
