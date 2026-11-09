import { i18n, useTranslation } from "@/i18n";
import { themeSlotProps } from "../theming/theme-props";
import { sx } from "../utils/stylex";
import { styles } from "./Command.styles";
import { Kbd } from "./Kbd";

/**
 * `CommandDialog`'s default hint footer (⌘↑↓/⏎/esc) — shown whenever the
 * caller does not pass its own `footer`. Self-contained (no props) so
 * `CommandDialog` only has to choose between this and the caller's override.
 */
export function CommandFooterHint() {
  useTranslation();
  return (
    <div
      aria-hidden
      {...themeSlotProps("command-dialog", "footer")}
      className={sx(styles.footer)}
    >
      <span
        {...themeSlotProps("command-dialog", "hint")}
        className={sx(styles.hint)}
      >
        <Kbd size="sm">↑</Kbd>
        <Kbd size="sm">↓</Kbd>
        {i18n.t("ui:commandParts.navigate")}</span>
      <span
        {...themeSlotProps("command-dialog", "hint")}
        className={sx(styles.hint)}
      >
        <Kbd size="sm">↵</Kbd>
        {i18n.t("ui:commandParts.select")}</span>
      <span
        {...themeSlotProps("command-dialog", "hint")}
        className={sx(styles.hint)}
      >
        <Kbd size="sm">{/* i18n-ignore: keyboard key name */}esc</Kbd>
        {i18n.t("ui:commandParts.backClose")}</span>
    </div>
  );
}
