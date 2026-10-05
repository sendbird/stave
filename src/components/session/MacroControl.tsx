import { i18n, useTranslation } from "@/i18n";
import { Zap } from "lucide-react";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { isMacroInstantRun, type Macro } from "@/lib/macros/types";
import { macroControlStyles as styles } from "./macro-control.styles";

interface MacroControlProps {
  macros: readonly Macro[];
  disabled?: boolean;
  onSelect: (macro: Macro) => void;
}

export function MacroControl(args: MacroControlProps) {
  useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={COMPOSER_CONTROL_BUTTON}
            {...composerControlAttributes}
            data-macro-control="true"
            disabled={args.disabled}
            aria-label={i18n.t("session:macroControl.ariaLabel")}
            title={i18n.t("session:macroControl.title")}
          />
        }
      >
        <Zap />
        <ComposerControlLabel>{i18n.t("session:macroControl.macroControl")}</ComposerControlLabel>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        xstyle={styles.content}
      >
        <DropdownMenuLabel className={sx(styles.label)}>
          <Zap className={sx(styles.labelIcon)} />
          {i18n.t("session:macroControl.macroControl2")}</DropdownMenuLabel>
        {args.macros.length === 0 ? (
          <p className={sx(styles.empty)}>
            {i18n.t("session:macroControl.macroControl3")}</p>
        ) : (
          args.macros.map((macro) => (
            <DropdownMenuItem
              key={macro.id}
              onClick={() => args.onSelect(macro)}
              className={sx(styles.item)}
            >
              <span className={sx(styles.itemBody)}>
                <span className={sx(styles.itemTitleRow)}>
                  <span className={sx(styles.itemTitle)}>{macro.label}</span>
                  <code className={sx(styles.itemSlug)}>!{macro.slug}</code>
                  {isMacroInstantRun(macro) ? (
                    <span className={sx(styles.itemInstant)}>{i18n.t("session:macroControl.copy")}</span>
                  ) : null}
                </span>
                {macro.description ? (
                  <span className={sx(styles.itemDescription)}>
                    {macro.description}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
