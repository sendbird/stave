import { Kbd } from "@/components/ui";
import { cx, sx } from "@/components/ads/utils/stylex";
import { layoutShellStyles } from "./layout-shell.styles";
import { useTranslation } from "@/i18n";

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
  const { t } = useTranslation("workspace");
  return (
    <Kbd
      aria-label={t("sidebarRows.shortcutChip.ariaLabel", { modifier, key: label })}
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
