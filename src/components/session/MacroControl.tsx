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
            aria-label="Insert a saved macro"
            title="Insert a saved macro"
          />
        }
      >
        <Zap />
        <ComposerControlLabel>Macros</ComposerControlLabel>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={sx(styles.content)}
      >
        <DropdownMenuLabel className={sx(styles.label)}>
          <Zap className={sx(styles.labelIcon)} />
          Insert a macro
        </DropdownMenuLabel>
        {args.macros.length === 0 ? (
          <p className={sx(styles.empty)}>
            No macros yet. Add one in Settings → Macros, or type ! in the
            composer after you create the first.
          </p>
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
                    <span className={sx(styles.itemInstant)}>Instant</span>
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
