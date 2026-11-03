import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { useId, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Badge } from "@/components/ads/components/Badge";
import { Combobox } from "@/components/ads/components/Combobox";
import { groupOptions, type OptionGroup } from "@/components/ads/components/Combobox.options";
import { Loader } from "@/components/ads/components/Loader";
import { listbox } from "@/components/ads/recipes/listbox";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
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

function OptionRow(props: { option: SearchablePickerOption }) {
  const { option } = props;
  return (
    <Combobox.Item value={option} size="md" xstyle={styles.item}>
      <span className={sx(styles.itemMain)}>
        {option.icon ? <span aria-hidden className={sx(styles.icon, styles.itemIcon)}>{option.icon}</span> : null}
        <span className={sx(styles.itemText)}>
          <span className={sx(styles.itemLabelRow)}>
            <span className={sx(styles.itemLabel)}>{option.label}</span>
            <OptionBadge label={option.badge} />
          </span>
          {option.detail && option.detail !== option.label ? (
            <span className={sx(styles.itemDetail)}>{option.detail}</span>
          ) : null}
        </span>
        {option.meta ? <span className={sx(styles.itemMeta)}>{option.meta}</span> : null}
      </span>
      <Combobox.ItemIndicator />
    </Combobox.Item>
  );
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

function PickerSearch(props: { placeholder: string; label?: string }) {
  return (
    <Combobox.InputGroup searchIcon size="sm">
      <Combobox.Input size="sm" aria-label={props.label ?? props.placeholder} placeholder={props.placeholder} />
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
 * A picker whose search box lives inside its own list (the ADS Combobox with a
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
}) {
  const size = props.size ?? "sm";
  const valueId = useId();
  const [query, setQuery] = useState("");
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
      onOpenChange={(open) => {
        if (!open) setQuery("");
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
        <Combobox.Positioner>
          <Combobox.Popup xstyle={[styles.popup, props.popupXstyle]}>
            <PickerSearch placeholder={props.searchPlaceholder} label={props.searchLabel} />
            <PickerList grouped={grouped} loading={props.loading} loadingText={props.loadingText} emptyText={props.emptyText} />
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/**
 * The multiple-choice form of the same picker: the list stays open while
 * options are checked and unchecked, and a check marks every chosen row. The
 * trigger is the caller's (a filter button, an "Add" action), because what it
 * should say about the choice differs by surface.
 */
export function SearchableMultiPicker(props: {
  trigger: ReactElement;
  triggerContent?: ReactNode;
  "aria-label"?: string;
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
}) {
  const [query, setQuery] = useState("");
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
      onOpenChange={(open) => {
        if (!open) setQuery("");
        props.onOpenChange?.(open);
      }}
      filter={matchesSearchablePickerOption}
      itemToStringLabel={optionLabel}
      itemToStringValue={optionValue}
      isItemEqualToValue={sameOption}
      disabled={props.disabled}
      autoHighlight
    >
      <Combobox.Trigger
        variant="unstyled"
        shape="content"
        render={props.trigger}
        aria-label={props["aria-label"]}
      >
        {props.triggerContent}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup xstyle={[styles.popup, props.popupXstyle]}>
            {props.children}
            <PickerSearch placeholder={props.searchPlaceholder} label={props.searchLabel} />
            <PickerList grouped={grouped} loading={props.loading} loadingText={props.loadingText} emptyText={props.emptyText} />
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
