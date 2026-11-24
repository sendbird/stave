import * as React from "react";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { sx } from "../utils/stylex";
import {
  type DataTableEditingCell,
  isSameEditingCell,
} from "./DataTable.helpers";
import { styles } from "./DataTable.styles";

/** Stable key for an editable cell's trigger button (row + column). */
export const editTriggerKey = (rowId: string, columnId: string) =>
  `${rowId}::${columnId}`;

type UseDataTableEditingOptions = {
  enabled: boolean;
  onCellEdit?: (rowId: string, columnId: string, nextValue: string) => void;
};

/** Owns the one-at-a-time inline editor and its focus-return contract. */
export function useDataTableEditing({
  enabled,
  onCellEdit,
}: UseDataTableEditingOptions) {
  const [editingCell, setEditingCell] =
    React.useState<DataTableEditingCell | null>(null);
  const editTriggerRefs = React.useRef<
    Record<string, HTMLButtonElement | null>
  >({});
  const restoreFocusKeyRef = React.useRef<string | null>(null);

  // Loading must never leave a cell stuck in edit mode (the inputs unmount).
  React.useEffect(() => {
    if (!enabled && editingCell) {
      setEditingCell(null);
    }
  }, [enabled, editingCell]);

  // Focus restore waits for the trigger to re-mount after the input closes.
  React.useLayoutEffect(() => {
    if (editingCell !== null) {
      return;
    }

    const key = restoreFocusKeyRef.current;

    if (!key) {
      return;
    }

    restoreFocusKeyRef.current = null;
    editTriggerRefs.current[key]?.focus();
  }, [editingCell]);

  /** Open a cell's editor; `draft` seeds it with typed text (type-to-edit). */
  const beginEditing = React.useCallback(
    (rowId: string, columnId: string, draft?: string) => {
      if (enabled) {
        setEditingCell(
          draft === undefined
            ? { columnId, rowId }
            : { columnId, draft, rowId },
        );
      }
    },
    [enabled],
  );

  const cancelEditing = React.useCallback((rowId: string, columnId: string) => {
    restoreFocusKeyRef.current = editTriggerKey(rowId, columnId);
    setEditingCell(null);
  }, []);

  const commitEditing = React.useCallback(
    (
      rowId: string,
      columnId: string,
      previousValue: string,
      nextValue: string,
      restoreFocus: boolean,
    ) => {
      if (nextValue !== previousValue) {
        onCellEdit?.(rowId, columnId, nextValue);
      }

      if (restoreFocus) {
        restoreFocusKeyRef.current = editTriggerKey(rowId, columnId);
      }

      setEditingCell((current) =>
        isSameEditingCell(current, { columnId, rowId }) ? null : current,
      );
    },
    [onCellEdit],
  );

  return {
    beginEditing,
    cancelEditing,
    commitEditing,
    editingCell,
    editTriggerRefs,
  };
}

type EditableCellInputProps = {
  ariaLabel: string;
  /**
   * Typed text that opened the editor (type-to-edit). It replaces the value
   * and leaves the caret after it; without it the value opens selected.
   */
  draft?: string;
  initialValue: string;
  onCancel: () => void;
  /** Whether closing the input left focus without another destination. */
  onCommit: (nextValue: string, restoreFocus: boolean) => void;
};

/**
 * Local draft editor that commits on Enter/blur and cancels on Escape. Cancel
 * commits nothing, so the cell goes back to the value it had — including when
 * the editor was opened by typing over it.
 */
export function EditableCellInput({
  ariaLabel,
  draft,
  initialValue,
  onCancel,
  onCommit,
}: EditableCellInputProps) {
  const [value, setValue] = React.useState(draft ?? initialValue);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cancelledRef = React.useRef(false);
  const typedRef = React.useRef(draft !== undefined);

  React.useEffect(() => {
    const input = inputRef.current;

    if (!input) return;
    input.focus();
    if (typedRef.current) {
      // Keep typing where the first character left off.
      const end = input.value.length;
      input.setSelectionRange(end, end);
    } else {
      input.select();
    }
  }, []);

  return (
    <input
      aria-label={ariaLabel}
      className={sx(styles.editInput, transition.colors, focusRing.ring)}
      onBlur={(event) => {
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }

        onCommit(value, event.relatedTarget === null);
      }}
      onChange={(event) => setValue(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(value, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelledRef.current = true;
          onCancel();
        }
      }}
      ref={inputRef}
      type="text"
      value={value}
    />
  );
}
