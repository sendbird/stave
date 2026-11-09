import { Search, X } from "lucide-react";
import type { RefObject } from "react";
import { InputGroup, InputGroupAction } from "@/components/aui/components/InputGroup";

/**
 * The search field over an Information panel list (documents, memory). Escape
 * clears a typed query and stops there, so it does not also close the panel;
 * an Escape that ends an input method's composition is left to the method.
 * Clearing from the field's own action keeps the keyboard in the field.
 */
export function InformationListSearchField(
  props: {
    query: string;
    onQueryChange: (query: string) => void;
    /** Whether the field holds focus; a list keeps the field while it does. */
    onFocusChange: (focused: boolean) => void;
    inputRef: RefObject<HTMLInputElement | null>;
    label: string;
    placeholder: string;
    clearLabel: string;
  } & { [attribute: `data-${string}`]: string },
) {
  const {
    query,
    onQueryChange,
    onFocusChange,
    inputRef,
    label,
    placeholder,
    clearLabel,
    ...dataAttributes
  } = props;
  const clear = () => {
    onQueryChange("");
    inputRef.current?.focus();
  };
  return (
    <InputGroup
      {...dataAttributes}
      ref={inputRef}
      size="sm"
      leading={<Search aria-hidden />}
      value={query}
      onChange={(event) => onQueryChange(event.target.value)}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing || !query) return;
        event.preventDefault();
        event.stopPropagation();
        onQueryChange("");
      }}
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={false}
      trailingActions={
        query ? (
          <InputGroupAction type="button" aria-label={clearLabel} onClick={clear}>
            <X aria-hidden />
          </InputGroupAction>
        ) : null
      }
    />
  );
}
