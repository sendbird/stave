import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { i18n, useTranslation } from "@/i18n";
import { Badge } from "@/components/aui/components/Badge";
import { Combobox } from "@/components/aui/components/Combobox";
import { groupOptions, type OptionGroup } from "@/components/aui/components/Combobox.options";
import { Loader } from "@/components/aui/components/Loader";
import { listbox } from "@/components/aui/recipes/listbox";
import { sx, type StyleXValue } from "@/components/aui/utils/stylex";
import {
  matchesSearchablePickerOption,
  type SearchablePickerOption,
} from "./searchable-picker-option";
import { searchablePickerStyles as styles } from "./settings-searchable-picker.styles";

export {
  matchesSearchablePickerOption,
  type SearchablePickerOption,
} from "./searchable-picker-option";

const sameOption = (a: SearchablePickerOption, b: SearchablePickerOption) => a.value === b.value;
const optionLabel = (option: SearchablePickerOption) => option.label;
const optionValue = (option: SearchablePickerOption) => option.value;

function OptionBadge(props: { label?: string }) {
  return props.label ? (
    <Badge size="sm" tone="neutral" variant="outline" xstyle={styles.badge}>
      {props.label}
    </Badge>
  ) : null;
}

/**
 * The label owns its line, so a trailing value (a price, a count) never
 * truncates it: the value ends the row's last line — the detail line when
 * there is one — and drops below that line's text when both do not fit.
 */
function OptionRow(props: { option: SearchablePickerOption }) {
  const { option } = props;
  const detail = option.detail && option.detail !== option.label ? option.detail : undefined;
  const meta = option.meta ? <span className={sx(styles.itemMeta)} data-option-meta="">{option.meta}</span> : null;
  return (
    <Combobox.Item value={option} size="md" xstyle={styles.item}>
      <span className={sx(styles.itemMain)}>
        {option.icon ? <span aria-hidden className={sx(styles.icon, styles.itemIcon)}>{option.icon}</span> : null}
        <span className={sx(styles.itemText)}>
          <span className={sx(styles.itemLabelRow)}>
            <span className={sx(styles.itemLabel)} data-option-label="">{option.label}</span>
            <OptionBadge label={option.badge} />
            {detail ? null : meta}
          </span>
          {detail ? (
            <span className={sx(styles.itemDetailRow)}>
              <span className={sx(styles.itemDetail)} data-option-detail="">{detail}</span>
              {meta}
            </span>
          ) : null}
        </span>
      </span>
      <Combobox.ItemIndicator />
    </Combobox.Item>
  );
}

/**
 * Room below the trigger that still shows the search and about three rows.
 * With at least this much, the list opens below and scrolls; it flips above
 * only when below cannot show a usable list, so it does not cover the fields
 * above a picker that had room.
 */
const MIN_ROOM_BELOW_REM = 13;

function hasUsableRoomBelow(trigger: HTMLElement | null): boolean {
  if (!trigger) return false;
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const roomBelow = window.innerHeight - trigger.getBoundingClientRect().bottom;
  return roomBelow >= MIN_ROOM_BELOW_REM * rootFontSize;
}

/** The list body shared by the single and multiple pickers: status, empty, rows, sections. */
function PickerList(props: {
  grouped: boolean;
  loading?: boolean;
  loadingText?: string;
  emptyText: string;
}) {
  if (props.loading) {
    return (
      <div role="status" className={sx(styles.loading)}>
        <Loader aria-hidden size="xs" variant="sync" />
        {props.loadingText}
      </div>
    );
  }
  return (
    <>
      <Combobox.Empty>{props.emptyText}</Combobox.Empty>
      <Combobox.List xstyle={styles.list}>
        {props.grouped
          ? (group: OptionGroup<SearchablePickerOption>) => (
              <Combobox.Group key={group.value} items={group.items}>
                {group.value ? (
                  <Combobox.GroupLabel render={<div className={sx(listbox.groupLabel)} />}>{group.value}</Combobox.GroupLabel>
                ) : null}
                <BaseCombobox.Collection>
                  {(option: SearchablePickerOption) => <OptionRow key={option.value} option={option} />}
                </BaseCombobox.Collection>
              </Combobox.Group>
            )
          : (option: SearchablePickerOption) => <OptionRow key={option.value} option={option} />}
      </Combobox.List>
    </>
  );
}

function PickerSearch(props: { placeholder: string; label?: string; onEscape: () => void }) {
  return (
    <Combobox.InputGroup searchIcon size="sm">
      <Combobox.Input
        size="sm"
        aria-label={props.label ?? props.placeholder}
        placeholder={props.placeholder}
        // Escape always closes the list, typed search or not, and the
        // trigger takes focus back; it never just clears the search first.
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          props.onEscape();
        }}
      />
    </Combobox.InputGroup>
  );
}

function usePickerItems(options: readonly SearchablePickerOption[]) {
  const grouped = options.some((option) => option.group);
  const items = useMemo(
    () => (grouped ? groupOptions(options) : [...options]),
    [grouped, options],
  );
  return { grouped, items };
}

/**
 * A picker whose search box lives inside its own list (the AUI Combobox with a
 * field trigger). A filter sitting next to a Select reads like a second
 * setting; here the trigger shows only the saved choice, and the search exists
 * only while the list is open. Search matches the label, value, detail and
 * keywords; Up/Down move, Enter picks, Escape closes.
 */
export function SearchablePicker(props: {
  /** Id of the visible field label; the trigger announces it with the value. */
  labelledBy?: string;
  /** Name for a trigger without a visible label. */
  "aria-label"?: string;
  value?: string;
  /** Trigger text when `value` is not in `options`, such as a saved ID the catalog no longer lists. */
  fallbackLabel?: string;
  placeholder: string;
  options: readonly SearchablePickerOption[];
  onSelect: (value: string) => void;
  searchPlaceholder: string;
  /** Accessible name of the search box when it says more than the placeholder. */
  searchLabel?: string;
  emptyText: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  /** Control scale of the field trigger; match it to neighbouring controls. */
  size?: "sm" | "md";
  /** Matches the trigger to neighbouring controls in a compact row. */
  triggerXstyle?: StyleXValue;
  /**
   * Render the trigger as this element (an inline button in a sentence)
   * instead of the field box; it receives the open/close behavior.
   */
  trigger?: ReactElement;
  /** Content of a custom `trigger`. */
  triggerContent?: ReactNode;
  /** Opens a list whose width follows the trigger, or a wider one for an inline trigger. */
  popupXstyle?: StyleXValue;
  /** A heading above the search, for a picker opened from an icon-sized control. */
  header?: ReactNode;
}) {
  const size = props.size ?? "sm";
  const valueId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [opensBelow, setOpensBelow] = useState(false);
  const { grouped, items } = usePickerItems(props.options);
  const current = props.options.find((option) => option.value === props.value) ?? null;
  const label = current?.label ?? props.fallbackLabel;
  const detail = current?.detail && current.detail !== current.label ? current.detail : undefined;
  const value = (
    <span id={valueId} className={sx(styles.value)}>
      {label ? (
        <>
          {current?.icon ? <span aria-hidden className={sx(styles.icon)}>{current.icon}</span> : null}
          <span className={sx(styles.valueLabel)}>{label}</span>
          <OptionBadge label={current?.badge} />
          {detail ? <span className={sx(styles.valueDetail)}>{detail}</span> : null}
        </>
      ) : (
        <span className={sx(styles.placeholder)}>{props.placeholder}</span>
      )}
    </span>
  );
  return (
    <Combobox.Root<SearchablePickerOption>
      items={items}
      value={current}
      onValueChange={(next) => {
        if (next) props.onSelect(next.value);
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      open={open}
      onOpenChange={(next) => {
        if (next) setOpensBelow(hasUsableRoomBelow(triggerRef.current));
        setOpen(next);
        // Reset the search when the list opens, not as it closes: changing
        // the input's text during the close reads as typing and reopens it.
        if (next) setQuery("");
      }}
      filter={matchesSearchablePickerOption}
      itemToStringLabel={optionLabel}
      itemToStringValue={optionValue}
      isItemEqualToValue={sameOption}
      disabled={props.disabled}
      autoHighlight
    >
      {props.trigger ? (
        <Combobox.Trigger
          ref={triggerRef}
          variant="unstyled"
          shape="content"
          render={props.trigger}
          aria-label={props["aria-label"]}
          aria-busy={props.loading || undefined}
        >
          {props.triggerContent}
        </Combobox.Trigger>
      ) : (
        <Combobox.FieldTrigger
          ref={triggerRef}
          size={size}
          aria-label={props.labelledBy ? undefined : props["aria-label"]}
          aria-labelledby={props.labelledBy ? `${props.labelledBy} ${valueId}` : undefined}
          aria-busy={props.loading || undefined}
          xstyle={props.triggerXstyle}
        >
          {value}
        </Combobox.FieldTrigger>
      )}
      <Combobox.Portal>
        <Combobox.Positioner collisionAvoidance={opensBelow ? { side: "none" } : undefined}>
          <Combobox.Popup xstyle={[styles.popup, props.popupXstyle]}>
            {props.header}
            <PickerSearch placeholder={props.searchPlaceholder} label={props.searchLabel} onEscape={() => setOpen(false)} />
            <PickerList grouped={grouped} loading={props.loading} loadingText={props.loadingText} emptyText={props.emptyText} />
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/**
 * The multiple-choice form of the same picker: the list stays open while
 * options are checked and unchecked, and a check marks every chosen row.
 *
 * By default it is a chip field: each chosen value is a chip inside the field
 * with its own remove button, the field's input is the search, Backspace in
 * an empty input removes the last chip, and a clear button empties the field.
 * Pass `trigger` instead to open the list from the caller's own control (a
 * filter button, an "Add" action) with the search inside the list, where what
 * the trigger should say about the choice differs by surface.
 */
export function SearchableMultiPicker(props: {
  /** The caller's own trigger; without it the picker is a chip field. */
  trigger?: ReactElement;
  triggerContent?: ReactNode;
  "aria-label"?: string;
  /** Chip field: id of a visible label the field's input announces. */
  labelledBy?: string;
  options: readonly SearchablePickerOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder: string;
  /** Accessible name of the search box when it says more than the placeholder. */
  searchLabel?: string;
  emptyText: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  popupXstyle?: StyleXValue;
  /** Shown above the list, for example a status the list depends on. */
  children?: ReactNode;
  /** Chip field: control scale; match it to neighbouring controls. */
  size?: "sm" | "md";
  /**
   * Chip field: the chip for a chosen value no option lists, such as a saved
   * ID the catalog dropped. The value stays chosen (removing it is the
   * reader's call); `stale` draws its chip with the warning rim. Defaults to
   * the bare value.
   */
  missingOption?: (value: string) => SearchablePickerOption & { stale?: boolean };
  /** Chip field: names a chip's remove button. Defaults to "Remove {label}". */
  removeLabel?: (label: string) => string;
}) {
  if (!props.trigger) return <SearchableChipField {...props} />;
  return <SearchableTriggerMultiPicker {...props} trigger={props.trigger} />;
}

type SearchableMultiPickerProps = Parameters<typeof SearchableMultiPicker>[0];

function SearchableTriggerMultiPicker(props: SearchableMultiPickerProps & { trigger: ReactElement }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [opensBelow, setOpensBelow] = useState(false);
  const { grouped, items } = usePickerItems(props.options);
  const chosen = props.options.filter((option) => props.selected.includes(option.value));
  return (
    <Combobox.Root<SearchablePickerOption, true>
      multiple
      items={items}
      value={chosen}
      onValueChange={(next) => props.onChange(next.map((option) => option.value))}
      inputValue={query}
      onInputValueChange={setQuery}
      open={open}
      onOpenChange={(next) => {
        if (next) setOpensBelow(hasUsableRoomBelow(triggerRef.current));
        setOpen(next);
        if (next) setQuery("");
        props.onOpenChange?.(next);
      }}
      filter={matchesSearchablePickerOption}
      itemToStringLabel={optionLabel}
      itemToStringValue={optionValue}
      isItemEqualToValue={sameOption}
      disabled={props.disabled}
      autoHighlight
    >
      <Combobox.Trigger
        ref={triggerRef}
        variant="unstyled"
        shape="content"
        render={props.trigger}
        aria-label={props["aria-label"]}
      >
        {props.triggerContent}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner collisionAvoidance={opensBelow ? { side: "none" } : undefined}>
          <Combobox.Popup xstyle={[styles.popup, props.popupXstyle]}>
            {props.children}
            <PickerSearch
              placeholder={props.searchPlaceholder}
              label={props.searchLabel}
              onEscape={() => {
                setOpen(false);
                props.onOpenChange?.(false);
              }}
            />
            <PickerList grouped={grouped} loading={props.loading} loadingText={props.loadingText} emptyText={props.emptyText} />
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function SearchableChipField(props: SearchableMultiPickerProps) {
  useTranslation();
  const size = props.size ?? "sm";
  const { grouped, items } = usePickerItems(props.options);
  const known = useMemo(() => new Map(props.options.map((option) => [option.value, option])), [props.options]);
  // Chips keep the order values were chosen in, and a value no option lists
  // stays a chip rather than vanishing from the choice.
  const chosen: Array<SearchablePickerOption & { stale?: boolean }> = props.selected.map(
    (value) => known.get(value) ?? props.missingOption?.(value) ?? { value, label: value },
  );
  const removeLabel = (label: string) =>
    props.removeLabel?.(label) ?? i18n.t("ui:combobox.removeOption", { label });
  return (
    <Combobox.Root<SearchablePickerOption, true>
      multiple
      items={items}
      value={chosen}
      onValueChange={(next) => props.onChange(next.map((option) => option.value))}
      // The input is the field's own search: typing is what opens the list,
      // so it is left to the combobox rather than reset on open.
      onOpenChange={props.onOpenChange}
      filter={matchesSearchablePickerOption}
      itemToStringLabel={optionLabel}
      itemToStringValue={optionValue}
      isItemEqualToValue={sameOption}
      disabled={props.disabled}
      autoHighlight
    >
      <Combobox.InputGroup size={size} aria-busy={props.loading || undefined}>
        <Combobox.Chips>
          {chosen.map((option) => (
            <Combobox.Chip
              key={option.value}
              title={option.detail}
              xstyle={option.stale ? styles.chipMissing : undefined}
            >
              {option.label}
              <Combobox.ChipRemove aria-label={removeLabel(option.label)} />
            </Combobox.Chip>
          ))}
          <Combobox.Input
            size={size}
            aria-label={props.labelledBy ? undefined : (props.searchLabel ?? props["aria-label"] ?? props.searchPlaceholder)}
            aria-labelledby={props.labelledBy}
            placeholder={chosen.length === 0 ? props.searchPlaceholder : ""}
          />
        </Combobox.Chips>
        <Combobox.Actions>
          {props.loading ? (
            <Combobox.Loading label={props.loadingText} size={size} />
          ) : chosen.length > 0 && !props.disabled ? (
            <Combobox.Clear aria-label={i18n.t("ui:combobox.clearSelection")} size={size} />
          ) : null}
          <Combobox.Trigger aria-label={i18n.t("ui:combobox.openOptions")} size={size} />
        </Combobox.Actions>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup xstyle={[styles.popup, props.popupXstyle]}>
            {props.children}
            <PickerList grouped={grouped} loading={props.loading} loadingText={props.loadingText} emptyText={props.emptyText} />
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
