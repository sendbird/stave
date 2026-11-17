import { i18n, useTranslation } from "@/i18n";
import { CappedViewport } from "@/components/aui/components/CappedViewport";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import type { QuestionOptionRowModel } from "./question-option-rows";
import { userInputCardStyles as styles } from "./user-input-card.styles";

/** Reserve the tallest capped preview before browsing starts. Hidden panels
 * share one grid cell, so pointer/focus changes never move the option rows in
 * a bottom-anchored composer. Questions without previews reserve no space.
 */
export function UserInputOptionPreview(args: {
  rows: QuestionOptionRowModel[];
  activeValue?: string;
  idPrefix: string;
}) {
  useTranslation();
  return (
    <div className={sx(styles.optionPreviewSlot)} data-option-preview-slot="">
      {args.rows.map((row, index) => {
        if (!row.preview) return null;
        const active = row.value === args.activeValue;
        const labelId = `${args.idPrefix}-${index}`;
        return (
          <div
            key={row.value}
            className={sx(styles.optionPreview, !active && styles.optionPreviewHidden)}
            data-option-preview={active ? row.value : undefined}
            aria-hidden={active ? undefined : true}
            inert={!active}
          >
            <span className={sx(styles.optionPreviewLabel)} id={labelId}>
              {i18n.t("composer:userInputCard.optionPreview", { label: row.label })}
            </span>
            {/* Inactive panels size the slot but cannot be read or focused.
                A region, not a live log: browsing must not announce snippets. */}
            <CappedViewport
              aria-labelledby={labelId}
              maxBlockSize={200}
              role="region"
              tabIndex={active ? 0 : undefined}
              xstyle={[styles.optionPreviewViewport, focusRing.ring]}
            >
              <pre className={sx(styles.optionPreviewText)}>{row.preview}</pre>
            </CappedViewport>
          </div>
        );
      })}
    </div>
  );
}
