import { sx } from "../utils/stylex";
import { styles } from "./Command.styles";

/**
 * `CommandDialog`'s default hint footer (⌘↑↓/⏎/esc) — shown whenever the
 * caller does not pass its own `footer`. Self-contained (no props) so
 * `CommandDialog` only has to choose between this and the caller's override.
 */
export function CommandFooterHint() {
  return (
    <div aria-hidden className={sx(styles.footer)}>
      <span className={sx(styles.hint)}>
        <kbd className={sx(styles.footerKbd)}>↑</kbd>
        <kbd className={sx(styles.footerKbd)}>↓</kbd>
        navigate
      </span>
      <span className={sx(styles.hint)}>
        <kbd className={sx(styles.footerKbd)}>↵</kbd>
        select
      </span>
      <span className={sx(styles.hint)}>
        <kbd className={sx(styles.footerKbd)}>esc</kbd>
        close
      </span>
    </div>
  );
}
