import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import { Zap } from "lucide-react";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { Button } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import {
  SearchablePicker,
  type SearchablePickerOption,
} from "@/components/layout/settings-searchable-picker";
import { isMacroInstantRun, type Macro } from "@/lib/macros/types";
import { macroControlStyles as styles } from "./macro-control.styles";

interface MacroControlProps {
  macros: readonly Macro[];
  disabled?: boolean;
  onSelect: (macro: Macro) => void;
}

/**
 * The composer's Macros control. Up to a hundred macros can be saved, so the
 * list opens with a search over label, `!slug` and description; the trigger
 * keeps its place and size in the composer's control lane.
 */
export function MacroControl(args: MacroControlProps) {
  useTranslation();
  const instantLabel = i18n.t("session:macroControl.copy");
  const options = useMemo<SearchablePickerOption[]>(
    () =>
      args.macros.map((macro) => ({
        value: macro.id,
        label: macro.label,
        detail: macro.description || undefined,
        keywords: [macro.slug, `!${macro.slug}`],
        meta: `!${macro.slug}`,
        badge: isMacroInstantRun(macro) ? instantLabel : undefined,
      })),
    [args.macros, instantLabel],
  );
  return (
    <SearchablePicker
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={COMPOSER_CONTROL_BUTTON}
          {...composerControlAttributes}
          data-macro-control="true"
          title={i18n.t("session:macroControl.title")}
        />
      }
      triggerContent={
        <>
          <Zap />
          <ComposerControlLabel>{i18n.t("session:macroControl.macroControl")}</ComposerControlLabel>
        </>
      }
      aria-label={i18n.t("session:macroControl.ariaLabel")}
      disabled={args.disabled}
      popupXstyle={styles.content}
      header={
        <p className={sx(styles.label)}>
          <Zap aria-hidden className={sx(styles.labelIcon)} />
          {i18n.t("session:macroControl.macroControl2")}
        </p>
      }
      placeholder={i18n.t("session:macroControl.macroControl")}
      options={options}
      onSelect={(id) => {
        const macro = args.macros.find((candidate) => candidate.id === id);
        if (macro) args.onSelect(macro);
      }}
      searchPlaceholder={i18n.t("session:macroControl.search")}
      emptyText={
        args.macros.length === 0
          ? i18n.t("session:macroControl.macroControl3")
          : i18n.t("session:macroControl.noMatch")
      }
    />
  );
}
