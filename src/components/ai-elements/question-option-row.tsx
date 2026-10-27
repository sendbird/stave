import { useTranslation } from "@/i18n";
import type { ReactNode } from "react";
import { Check, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui";
import { Kbd } from "@/components/ads/components/Kbd";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import { questionOptionRowStyles as styles } from "./question-option-row.styles";
import type { QuestionOptionRowModel } from "./question-option-rows";

export { questionOptionRowStyles } from "./question-option-row.styles";

/** The radio or checkbox mark a row leads with; the real input stays hidden. */
function QuestionOptionMark(args: {
  kind: "radio" | "checkbox";
  checked: boolean;
}) {
  if (args.kind === "checkbox") {
    return (
      <span
        className={sx(styles.checkbox, args.checked && styles.checkboxChecked)}
      >
        {args.checked ? <Check className={sx(styles.checkIcon)} /> : null}
      </span>
    );
  }
  return (
    <span className={sx(styles.radio, args.checked && styles.radioChecked)}>
      {args.checked ? <span className={sx(styles.radioDot)} /> : null}
    </span>
  );
}

function QuestionOptionShortcut(args: { shortcut: number | null; centered?: boolean }) {
  if (args.shortcut === null) {
    return null;
  }
  return (
    <Kbd
      aria-hidden
      size="sm"
      xstyle={args.centered ? styles.shortcutCentered : styles.shortcut}
    >
      {args.shortcut}
    </Kbd>
  );
}

/**
 * One answer to a question: a radio (single choice) or checkbox (several),
 * the label and description, and the number key that picks it.
 */
export function QuestionOptionRow(args: {
  row: QuestionOptionRowModel;
  kind: "radio" | "checkbox";
  name: string;
  divided: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onChange?: () => void;
}) {
  const { t } = useTranslation(["composer"]);
  const { row, kind, readOnly = false, disabled = false } = args;
  return (
    <label
      className={sx(
        styles.row,
        args.divided && styles.rowDivided,
        focusRing.ringWithin,
        styles.rowFocusInset,
        row.selected && styles.rowSelected,
        readOnly && styles.rowReadOnly,
        !readOnly && disabled && styles.rowDisabled,
      )}
    >
      <input
        className={sx(styles.srOnly)}
        type={kind}
        name={args.name}
        value={row.value}
        checked={row.selected}
        disabled={readOnly || disabled}
        aria-keyshortcuts={row.shortcut === null ? undefined : String(row.shortcut)}
        onChange={args.onChange}
      />
      <span className={sx(styles.markSlot)} aria-hidden>
        <QuestionOptionMark kind={kind} checked={row.selected} />
      </span>
      <span className={sx(styles.body)}>
        <span className={sx(styles.labelRow)}>
          <span className={sx(styles.label)}>{row.label}</span>
          {row.recommended ? (
            <Badge variant="secondary" className={sx(styles.recommendedBadge)}>
              {t("userInputCard.copy")}
            </Badge>
          ) : null}
        </span>
        {row.description ? (
          <span className={sx(styles.description)}>{row.description}</span>
        ) : null}
      </span>
      <QuestionOptionShortcut shortcut={row.shortcut} />
    </label>
  );
}

/**
 * The free-text row that follows the options. `children` is the field; the
 * row is marked as picked while it holds text.
 */
export function QuestionOptionTextRow(args: {
  filled: boolean;
  disabled?: boolean;
  shortcut: number | null;
  children: ReactNode;
}) {
  return (
    <label
      className={sx(
        styles.row,
        styles.rowDivided,
        styles.rowText,
        focusRing.ringWithin,
        styles.rowFocusInset,
        args.filled && styles.rowSelected,
        args.disabled && styles.rowDisabled,
      )}
    >
      <span className={sx(styles.markSlot)} aria-hidden>
        <PencilLine className={sx(styles.textIcon)} />
      </span>
      {args.children}
      <QuestionOptionShortcut shortcut={args.shortcut} centered />
    </label>
  );
}
