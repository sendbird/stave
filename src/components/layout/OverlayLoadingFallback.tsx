import { i18n, useTranslation } from "@/i18n";
import { LoadingSurface } from "@/components/aui/components/LoadingSurface";
import { sx } from "@/components/aui/utils/stylex";
import { appShellStyles } from "@/components/layout/app-shell.styles";
import { layers } from "@/lib/ui-layers.stylex";

/**
 * What a lazily loaded dialog (Settings, Keyboard shortcuts, Kickoff) shows
 * while its code loads: the dialog's backdrop with a spinner, not a card that
 * looks like the dialog itself. The label is announced, not drawn.
 */
export function OverlayLoadingFallback(props: { title: string }) {
  useTranslation();
  return (
    <div className={sx(layers.dialog, appShellStyles.overlayFallback)}>
      <LoadingSurface
        size="fill"
        label={i18n.t("shell:appShell.loadingSurface", { title: props.title })}
      />
    </div>
  );
}
