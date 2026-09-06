import { Kbd } from "@/components/ui";
import { cx, sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";

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
      className={cx(sx(layoutShellStyles.shortcut), className)}
    >
      <span>{modifier}</span>
      <span aria-hidden="true" className={sx(layoutShellStyles.shortcutSeparator)}>
        +
      </span>
      <span>{label}</span>
    </Kbd>
  );
}
