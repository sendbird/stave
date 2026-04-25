import { Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";

interface WorkspaceShortcutChipProps {
  modifier: string;
  label: string;
  className?: string;
}

export function WorkspaceShortcutChip({
  modifier,
  label,
  className,
}: WorkspaceShortcutChipProps) {
  return (
    <Kbd
      aria-label={`Keyboard shortcut ${modifier}+${label}`}
      className={cn(
        "h-5 min-w-0 gap-0.5 rounded-sm px-1.5 text-[10px] tabular-nums",
        className,
      )}
    >
      <span>{modifier}</span>
      <span aria-hidden="true" className="text-muted-foreground/70">
        +
      </span>
      <span>{label}</span>
    </Kbd>
  );
}
