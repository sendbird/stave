import { i18n, useTranslation } from "@/i18n";
import { useId, useState } from "react";

import { listbox } from "../recipes/listbox";
import { sx } from "../utils/stylex";
import {
  isOptionEqualToValue,
  loadingLabelFor,
  optionToStringLabel,
  optionToStringValue,
  type ComboboxProps,
} from "./Combobox.arrayProps";
import {
  defaultCreateLabel,
  getCreateOption,
  isCreateOption,
  type CreatableOption,
} from "./Combobox.create";
import {
  groupOptions,
  optionText,
  type ComboboxOption,
} from "./Combobox.options";
import { compoundParts } from "./Combobox.parts";
import { ComboboxArrayPopup } from "./Combobox.popup";
import { styles } from "./Combobox.styles";
import { useFieldDisabled } from "./field-anatomy";

/**
 * The array (convenience) half of `Combobox` — `<Combobox options={[…]} />`.
 * It is a thin re-implementation on top of the compound parts in
 * `Combobox.parts`; the root that joins the two into one export is `Combobox`.
 * Splitting on the seam the file already documented keeps both modules inside
 * the source-size cap.
 */

const {
  Actions,
  Chip,
  ChipRemove,
  Chips,
  Clear,
  Loading,
  Input,
  InputGroup,
  Root,
  Trigger,
  Value,
} = compoundParts;

export type { ComboboxOption } from "./Combobox.options";
export type { ComboboxProps } from "./Combobox.arrayProps";

function ComboboxArraySingle({
  clearable = false,
  createLabel = defaultCreateLabel,
  defaultInputValue,
  defaultValue,
  defaultValues: _defaultValues,
  emptyText = i18n.t("ui:combobox.noMatches"),
  error,
  hasMore,
  inputAriaLabel,
  inputId,
  label,
  leadingActions,
  loading = false,
  loadingMore,
  loadingMoreText,
  loadError,
  // Unicode ellipsis — this package's convention (`FilterBar` "Search…",
  // `AlertDialog` "Working…"), not three ASCII periods.
  loadingText = i18n.t("ui:combobox.loadingOptions"),
  loadMoreLabel,
  multiple: _multiple,
  onCreate,
  onInputValueChange,
  onLoadMore,
  onLoadRetry,
  onValueChange,
  onValuesChange: _onValuesChange,
  options,
  placeholder = i18n.t("ui:combobox.search"),
  placement,
  readOnly,
  retryLabel,
  searchIcon = false,
  // Defaulted once here rather than letting each compound part fall back on
  // its own — the field, its actions, and every option row share one value.
  size: resolvedSize = "md",
  inputValue,
  value,
  values: _values,
  zIndex,
  ...props
}: ComboboxProps) {
  useTranslation();
  // A `Fieldset` disables what it contains; the caller's own prop still wins.
  const disabled = useFieldDisabled(props.disabled);
  const generatedId = useId();
  // An external label row supplies the id it points at; otherwise the field
  // owns one, which is what `label` binds to.
  const fieldId = inputId ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const grouped = options.some((option) => option.group);
  const [internalQuery, setInternalQuery] = useState(() =>
    String(defaultInputValue ?? ""),
  );
  const query = inputValue === undefined ? internalQuery : String(inputValue);
  const createOption = getCreateOption(
    query,
    options.map(optionText),
    Boolean(onCreate),
  );
  const entries: CreatableOption<ComboboxOption>[] = createOption
    ? [...options, createOption]
    : options;
  const items = grouped
    ? groupOptions(options, createOption ? [createOption] : [])
    : entries;

  return (
    <Root
      {...props}
      disabled={disabled}
      // A read-only picker does not open — the same rule `Select` applies.
      // Base UI's own `readOnly` only refuses a *different* choice inside an
      // open popup, which still reads as an invitation to change the value.
      open={readOnly ? false : props.open}
      readOnly={readOnly}
      autoHighlight
      isItemEqualToValue={isOptionEqualToValue}
      itemToStringLabel={optionToStringLabel}
      itemToStringValue={optionToStringValue}
      items={items}
      defaultInputValue={defaultInputValue}
      defaultValue={defaultValue}
      inputValue={inputValue}
      onInputValueChange={(nextQuery, details) => {
        if (inputValue === undefined) setInternalQuery(nextQuery);
        onInputValueChange?.(nextQuery, details);
      }}
      onValueChange={(nextValue, details) => {
        if (isCreateOption(nextValue)) {
          details.cancel();
          onCreate?.(nextValue.query);
          return;
        }
        onValueChange?.(nextValue);
      }}
      value={value}
    >
      <div className={sx(styles.field)}>
        {label ? (
          <label className={sx(styles.label)} htmlFor={fieldId}>
            {label}
          </label>
        ) : null}
        <InputGroup
          aria-busy={loading || undefined}
          invalid={Boolean(error)}
          leadingActions={leadingActions}
          searchIcon={searchIcon}
          size={resolvedSize}
        >
          <Input
            aria-label={inputAriaLabel}
            aria-describedby={errorId}
            aria-invalid={error ? true : undefined}
            id={fieldId}
            placeholder={placeholder}
            size={resolvedSize}
          />
          <Actions>
            {loading ? (
              <Loading
                label={loadingLabelFor(loadingText)}
                size={resolvedSize}
              />
            ) : readOnly || disabled || !clearable ? null : (
              <Clear aria-label={i18n.t("ui:combobox.clearSelection")} size={resolvedSize} />
            )}
            <Trigger aria-label={i18n.t("ui:combobox.openOptions")} size={resolvedSize} />
          </Actions>
        </InputGroup>
        {error ? (
          <div className={sx(listbox.error)} id={errorId} role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <ComboboxArrayPopup
        createLabel={createLabel}
        emptyText={emptyText}
        grouped={grouped}
        hasMore={hasMore}
        hasOptions={entries.length > 0}
        loadError={loadError}
        loading={loading}
        loadingMore={loadingMore}
        loadingMoreText={loadingMoreText}
        loadingText={loadingText}
        loadMoreLabel={loadMoreLabel}
        onLoadMore={onLoadMore}
        onLoadRetry={onLoadRetry}
        placement={placement}
        retryLabel={retryLabel}
        size={resolvedSize}
        zIndex={zIndex}
      />
    </Root>
  );
}

function ComboboxArrayMultiple({
  clearable = false,
  createLabel = defaultCreateLabel,
  defaultInputValue,
  defaultValue: _defaultValue,
  defaultValues,
  emptyText = i18n.t("ui:combobox.noMatches"),
  error,
  hasMore,
  inputAriaLabel,
  inputId,
  label,
  leadingActions,
  loading = false,
  loadingMore,
  loadingMoreText,
  loadError,
  loadingText = i18n.t("ui:combobox.loadingOptions"),
  loadMoreLabel,
  multiple: _multiple,
  onCreate,
  onInputValueChange,
  onLoadMore,
  onLoadRetry,
  onValueChange: _onValueChange,
  onValuesChange,
  options,
  placeholder = i18n.t("ui:combobox.search"),
  placement,
  readOnly,
  retryLabel,
  searchIcon = false,
  // Defaulted once here, as in the single-select arm above.
  size: resolvedSize = "md",
  inputValue,
  value: _value,
  values,
  zIndex,
  ...props
}: ComboboxProps) {
  useTranslation();
  // A `Fieldset` disables what it contains; the caller's own prop still wins.
  const disabled = useFieldDisabled(props.disabled);
  const generatedId = useId();
  // An external label row supplies the id it points at; otherwise the field
  // owns one, which is what `label` binds to.
  const fieldId = inputId ?? generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const grouped = options.some((option) => option.group);
  const [internalQuery, setInternalQuery] = useState(() =>
    String(defaultInputValue ?? ""),
  );
  const query = inputValue === undefined ? internalQuery : String(inputValue);
  const createOption = getCreateOption(
    query,
    options.map(optionText),
    Boolean(onCreate),
  );
  const entries: CreatableOption<ComboboxOption>[] = createOption
    ? [...options, createOption]
    : options;
  const items = grouped
    ? groupOptions(options, createOption ? [createOption] : [])
    : entries;

  return (
    <Root
      {...props}
      disabled={disabled}
      // A read-only picker does not open — the same rule `Select` applies.
      // Base UI's own `readOnly` only refuses a *different* choice inside an
      // open popup, which still reads as an invitation to change the value.
      open={readOnly ? false : props.open}
      readOnly={readOnly}
      autoHighlight
      defaultValue={defaultValues}
      defaultInputValue={defaultInputValue}
      isItemEqualToValue={isOptionEqualToValue}
      itemToStringLabel={optionToStringLabel}
      itemToStringValue={optionToStringValue}
      items={items}
      inputValue={inputValue}
      multiple
      onInputValueChange={(nextQuery, details) => {
        if (inputValue === undefined) setInternalQuery(nextQuery);
        onInputValueChange?.(nextQuery, details);
      }}
      onValueChange={(next, details) => {
        const created = next.find(isCreateOption);
        if (created) {
          details.cancel();
          onCreate?.(created.query);
          return;
        }
        onValuesChange?.(next);
      }}
      value={values}
    >
      <div className={sx(styles.field)}>
        {label ? (
          <label className={sx(styles.label)} htmlFor={fieldId}>
            {label}
          </label>
        ) : null}
        <InputGroup
          aria-busy={loading || undefined}
          // The single arm has always passed this. Without it a `multiple`
          // combobox rendered its error text under a field that still drew the
          // resting border, so the message and the control disagreed.
          invalid={Boolean(error)}
          leadingActions={leadingActions}
          searchIcon={searchIcon}
          size={resolvedSize}
        >
          <Chips>
            <Value>
              {(selected: ComboboxOption[]) => (
                <>
                  {selected.map((item) => (
                    <Chip key={item.value}>
                      {item.label}
                      <ChipRemove aria-label={i18n.t("ui:combobox.removeOption", { label: optionText(item) })} />
                    </Chip>
                  ))}
                  <Input
                    aria-label={inputAriaLabel}
                    aria-describedby={errorId}
                    aria-invalid={error ? true : undefined}
                    id={fieldId}
                    placeholder={selected.length === 0 ? placeholder : ""}
                    size={resolvedSize}
                  />
                </>
              )}
            </Value>
          </Chips>
          <Actions>
            {loading ? (
              <Loading
                label={loadingLabelFor(loadingText)}
                size={resolvedSize}
              />
            ) : readOnly || disabled || !clearable ? null : (
              <Clear aria-label={i18n.t("ui:combobox.clearSelection")} size={resolvedSize} />
            )}
            <Trigger aria-label={i18n.t("ui:combobox.openOptions")} size={resolvedSize} />
          </Actions>
        </InputGroup>
        {error ? (
          <div className={sx(listbox.error)} id={errorId} role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <ComboboxArrayPopup
        createLabel={createLabel}
        emptyText={emptyText}
        grouped={grouped}
        hasMore={hasMore}
        hasOptions={entries.length > 0}
        loadError={loadError}
        loading={loading}
        loadingMore={loadingMore}
        loadingMoreText={loadingMoreText}
        loadingText={loadingText}
        loadMoreLabel={loadMoreLabel}
        onLoadMore={onLoadMore}
        onLoadRetry={onLoadRetry}
        placement={placement}
        retryLabel={retryLabel}
        size={resolvedSize}
        zIndex={zIndex}
      />
    </Root>
  );
}

export function ComboboxArray(props: ComboboxProps) {
  return props.multiple ? (
    <ComboboxArrayMultiple {...props} />
  ) : (
    <ComboboxArraySingle {...props} />
  );
}
