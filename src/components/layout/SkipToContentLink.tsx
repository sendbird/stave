import { i18n, useTranslation } from "@/i18n";
import { shellStyles } from "@/components/aui/components/AppShell.shell.styles";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { focusRegionById } from "@/components/layout/focus-regions";

export const MAIN_CONTENT_ID = "stave-main-content";

/**
 * The first stop in the Tab order, off-screen until focused: it skips the
 * sidebar and the top bar (WCAG 2.4.1). It lands where F6 would in the main
 * column — the control last focused there, or its first one — and on the
 * column itself when it has nothing to focus yet.
 */
export function SkipToContentLink() {
  useTranslation();
  return (
    <a
      className={sx(shellStyles.skipLink, focusRing.ring)}
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        event.preventDefault();
        if (focusRegionById("main")) {
          return;
        }
        // Focusable only for this hop: a permanent tabIndex would let every
        // click on the column's empty space take focus from the body.
        const main = document.getElementById(MAIN_CONTENT_ID);
        if (!main) {
          return;
        }
        main.setAttribute("tabindex", "-1");
        main.addEventListener("blur", () => main.removeAttribute("tabindex"), {
          once: true,
        });
        main.focus();
      }}
    >
      {i18n.t("ui:appshellRoot.skipToContent")}
    </a>
  );
}
