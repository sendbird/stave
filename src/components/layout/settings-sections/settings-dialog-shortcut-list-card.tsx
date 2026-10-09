import { Keyboard } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ads/components/Button";
import { requestOpenKeyboardShortcuts } from "@/components/layout/useAppKeybindings";
import { SettingsCard } from "../settings-dialog.shared";

/**
 * Settings entry point to the view-only shortcut list. Settings closes and
 * the list opens in its place.
 */
export function ShortcutListCard() {
  const { t } = useTranslation(["shell"]);
  return (
    <SettingsCard
      title={t("shell:keybindings.ui.settingsCardTitle")}
      description={t("shell:keybindings.ui.settingsCardDescription")}
    >
      <div>
        <Button
          variant="outline"
          data-testid="settings-open-keyboard-shortcuts"
          onClick={requestOpenKeyboardShortcuts}
        >
          <Keyboard aria-hidden="true" />
          {t("shell:keybindings.ui.viewAll")}
        </Button>
      </div>
    </SettingsCard>
  );
}
