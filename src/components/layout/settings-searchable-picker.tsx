import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { controlChrome } from "@/components/ads/recipes/control-chrome";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import {
  styles as selectStyles,
  triggerHeightsBySize,
  triggerStylesBySize,
} from "@/components/ads/recipes/select-styles";
import { transition } from "@/components/ads/recipes/transition";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Loader,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import { searchablePickerStyles as styles } from "./settings-searchable-picker.styles";

export type SearchablePickerOption = {
  value: string;
  label: string;
  /** Secondary line, such as an ID. Searched together with the label. */
  detail?: string;
  /** Decorative leading mark, such as a provider logo. */
  icon?: ReactNode;
};

/**
 * A field-shaped picker whose search box lives inside its own list. A filter
 * sitting next to a Select reads like a second setting; here the trigger shows
 * only the saved choice, and the search exists only while the list is open.
 */
export function SearchablePicker(props: {
  /** Id of the visible field label; the trigger announces it with the value. */
  labelledBy: string;
  value?: string;
  /** Trigger text when `value` is not in `options`, such as a saved ID the catalog no longer lists. */
  fallbackLabel?: string;
  placeholder: string;
  options: readonly SearchablePickerOption[];
  onSelect: (value: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  /** Matches the trigger to neighbouring controls in a compact row. */
  triggerXstyle?: StyleXValue;
}) {
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const current = props.options.find((option) => option.value === props.value);
  const label = current?.label ?? props.fallbackLabel;
  const detail = current?.detail && current.detail !== current.label ? current.detail : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={props.disabled}
        aria-labelledby={`${props.labelledBy} ${valueId}`}
        aria-busy={props.loading || undefined}
        className={sx(
          selectStyles.trigger,
          triggerStylesBySize.sm,
          controlChrome.trigger,
          controlChrome.triggerFocusBorder,
          controlChrome.field,
          transition.colors,
          focusRing.borderOnly,
          triggerHeightsBySize.sm,
          props.triggerXstyle,
          open && selectStyles.triggerOpen,
          props.disabled && controlChrome.disabledField,
        )}
      >
        <span id={valueId} className={sx(styles.value)}>
          {label ? (
            <>
              {current?.icon ? <span aria-hidden className={sx(styles.icon)}>{current.icon}</span> : null}
              <span className={sx(styles.valueLabel)}>{label}</span>
              {detail ? <span className={sx(styles.valueDetail)}>{detail}</span> : null}
            </>
          ) : (
            <span className={sx(styles.placeholder)}>{props.placeholder}</span>
          )}
        </span>
        <span aria-hidden className={sx(selectStyles.icon)}>
          <ChevronDown size={16} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" density="flush" xstyle={styles.popup}>
        {open ? (
          <Command>
            <CommandInput
              autoFocus
              aria-label={props.searchPlaceholder}
              placeholder={props.searchPlaceholder}
            />
            {props.loading ? (
              <div role="status" className={sx(styles.loading)}>
                <Loader aria-hidden size="xs" variant="sync" />
                {props.loadingText}
              </div>
            ) : (
              <CommandList className={sx(styles.list)}>
                <CommandEmpty>{props.emptyText}</CommandEmpty>
                {props.options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    data-checked={option.value === props.value}
                    className={sx(styles.item)}
                    onSelect={() => {
                      props.onSelect(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.icon ? <span aria-hidden className={sx(styles.icon, styles.itemIcon)}>{option.icon}</span> : null}
                    <span className={sx(styles.itemText)}>
                      <span className={sx(styles.itemLabel)}>{option.label}</span>
                      {option.detail && option.detail !== option.label ? (
                        <span className={sx(styles.itemDetail)}>{option.detail}</span>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            )}
          </Command>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
