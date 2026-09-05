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
import { isMacroInstantRun, type Macro } from "@/lib/macros/types";

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
        <Zap className="size-4" />
        <ComposerControlLabel>Macros</ComposerControlLabel>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Zap className="size-3.5" />
          Insert a macro
        </DropdownMenuLabel>
        {args.macros.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
            No macros yet. Add one in Settings → Macros, or type ! in the
            composer after you create the first.
          </p>
        ) : (
          args.macros.map((macro) => (
            <DropdownMenuItem
              key={macro.id}
              onClick={() => args.onSelect(macro)}
              className="items-start gap-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm">{macro.label}</span>
                  <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground">
                    !{macro.slug}
                  </code>
                  {isMacroInstantRun(macro) ? (
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                      Instant
                    </span>
                  ) : null}
                </span>
                {macro.description ? (
                  <span className="block truncate text-xs text-muted-foreground">
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
