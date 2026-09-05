import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import { Button } from "@/components/ui";
import { isMacroInstantRun, type Macro } from "@/lib/macros/types";

/**
 * How many macros the left wing shows before the rest stay behind the Macros
 * control in the status bar. Three 2rem rows fit the wing at the card's
 * minimum height without turning a 3.5rem rail into a scrolling list.
 */
export const MACRO_QUICK_PICK_LIMIT = 3;

function describeMacro(macro: Macro): string {
  const runtime = macro.runtime
    ? ` · ${macro.runtime.model}${macro.runtime.effort ? ` · ${macro.runtime.effort}` : ""}`
    : "";
  const instant = isMacroInstantRun(macro) ? " · runs immediately" : "";
  return `${macro.label} · !${macro.slug}${runtime}${instant}`;
}

/**
 * Saved macros as one-click entries in the left wing.
 *
 * A macro already carries the pieces this wing is for: the prompt body and, if
 * it pins one, the provider/model/effort combination to run it with. So the
 * wing lists macros rather than inventing a second concept for "model + effort
 * preset" beside them.
 *
 * The rest state is a monogram, since a column of identical bolt glyphs would
 * name nothing; the label arrives with the wing reveal.
 */
export function MacroQuickPicks(props: {
  macros: readonly Macro[];
  disabled?: boolean;
  onSelect: (macro: Macro) => void;
}) {
  const picks = props.macros.slice(0, MACRO_QUICK_PICK_LIMIT);
  if (picks.length === 0) {
    return null;
  }

  return (
    <>
      {picks.map((macro) => (
        <Button
          key={macro.id}
          type="button"
          variant="ghost"
          size="sm"
          {...composerControlAttributes}
          data-macro-quick-pick={macro.slug}
          disabled={props.disabled}
          aria-label={
            isMacroInstantRun(macro)
              ? `Run macro ${macro.label}`
              : `Insert macro ${macro.label}`
          }
          title={describeMacro(macro)}
          className={COMPOSER_CONTROL_BUTTON}
          onClick={() => props.onSelect(macro)}
        >
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] bg-muted/70 text-[0.625rem] font-semibold uppercase leading-none"
          >
            {macro.label.slice(0, 1)}
          </span>
          <ComposerControlLabel>{macro.label}</ComposerControlLabel>
        </Button>
      ))}
    </>
  );
}
