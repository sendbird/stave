import { useEffect, useRef, useState } from "react";

import { i18n, useTranslation } from "@/i18n";

import { focusRing } from "../recipes/focus-ring";
import { transition } from "../recipes/transition";
import { styles } from "../recipes/tree-styles";
import { sx } from "../utils/stylex";

type RenameInputProps = {
  initialValue: string;
  onCancel: (viaKeyboard: boolean) => void;
  onCommit: (next: string, viaKeyboard: boolean) => void;
};

/**
 * The input rendered while a node renames. Holds the draft locally; commits
 * on Enter or blur, cancels on Escape. Focuses and selects its contents on
 * mount (mirrors PropertyList.TextRow's editor).
 */
export function RenameInput({
  initialValue,
  onCancel,
  onCommit,
}: RenameInputProps) {
  useTranslation();
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape must cancel without the following blur also committing; Enter must
  // commit exactly once. This flag short-circuits the trailing blur.
  const settledRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  return (
    <input
      aria-label={i18n.t("ui:tree.rename")}
      className={sx(
        styles.renameInput,
        transition.colors,
        focusRing.ring,
        focusRing.ringInset,
      )}
      onBlur={() => {
        if (settledRef.current) {
          settledRef.current = false;
          return;
        }
        onCommit(draft, false);
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          settledRef.current = true;
          onCommit(draft, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          settledRef.current = true;
          onCancel(true);
        }
      }}
      ref={inputRef}
      type="text"
      value={draft}
    />
  );
}
