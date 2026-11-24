import { Button } from "@/components/aui/components/Button";
import { openResourceManager } from "../resource-manager-events";
import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useShallow } from "zustand/react/shallow";
import {
  playCustomNotificationSound,
  playNotificationSound,
} from "@/lib/notifications/notification-sound";
import { useAppStore } from "@/store/app.store";
import { StandaloneCliSettingsCard } from "@/components/layout/settings-dialog-standalone-cli-card";
import { DesktopNotificationsCard } from "./settings-dialog-desktop-notifications-card";
import { ExternalActivitySettingsCard } from "./settings-dialog-external-activity-card";
import { LanguageSettingsCard } from "./settings-dialog-language-card";
import { NotificationSoundControls } from "./settings-dialog-notification-sound-controls";
import { SectionStack, SettingsCard, SwitchField } from "../settings-dialog.shared";

export function GeneralSection() {
  const [
    confirmBeforeClose,
    notificationSoundEnabled,
    notificationSoundPreset,
    notificationSoundVolume,
    notificationSoundMode,
    notificationSoundCustomAudioData,
    notificationSoundCustomAudioName,
    developerModeEnabled,
    featureTipsEnabled,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.confirmBeforeClose,
          state.settings.notificationSoundEnabled,
          state.settings.notificationSoundPreset,
          state.settings.notificationSoundVolume,
          state.settings.notificationSoundMode,
          state.settings.notificationSoundCustomAudioData,
          state.settings.notificationSoundCustomAudioName,
          state.settings.developerModeEnabled,
          state.settings.featureTipsEnabled,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);

  return (
    <SectionStack>
      <LanguageSettingsCard />
      <SettingsCard title={t("shell:discoverability.resourceManager")} description={t("shell:discoverability.resourceManagerDescription")}>
        <Button onClick={openResourceManager}>{t("shell:discoverability.resourceManager")}</Button>
      </SettingsCard>
      <SettingsCard title={t("settings:general.featureTips.title")} description={t("settings:general.featureTips.description")}>
        <SwitchField
          title={t("settings:general.featureTips.show")}
          checked={featureTipsEnabled}
          onCheckedChange={(checked) => updateSettings({ patch: { featureTipsEnabled: checked } })}
        />
      </SettingsCard>
      <SettingsCard
        title={t("settings:general.windowBehavior.title")}
        description={t("settings:general.windowBehavior.description")}
      >
        <SwitchField
          title={t("settings:general.windowBehavior.confirmBeforeClose.title")}
          description={t("settings:general.windowBehavior.confirmBeforeClose.description")}
          checked={confirmBeforeClose}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { confirmBeforeClose: checked } })
          }
        />
      </SettingsCard>
      <StandaloneCliSettingsCard />
      <ExternalActivitySettingsCard />
      <SettingsCard
        title={t("settings:general.notificationSound.title")}
        description={t("settings:general.notificationSound.description")}
      >
        <NotificationSoundControls
          value={{
            enabled: notificationSoundEnabled,
            mode: notificationSoundMode,
            preset: notificationSoundPreset,
            volume: notificationSoundVolume,
            customAudioData: notificationSoundCustomAudioData,
            customAudioName: notificationSoundCustomAudioName,
          }}
          copy={{
            enableTitle: t("settings:general.notificationSound.enableTitle"),
            enableDescription: t("settings:general.notificationSound.enableDescription"),
            presetDescription: t("settings:general.notificationSound.presetDescription"),
            volumeDescription: t("settings:general.notificationSound.volumeDescription"),
            volumeAriaLabel: t("settings:general.notificationSound.volumeAriaLabel"),
            sourceTitle: t("settings:general.notificationSound.sourceTitle"),
            presetTitle: t("settings:general.notificationSound.presetTitle"),
            customAudioTitle: t("settings:general.notificationSound.customAudioTitle"),
            volumeTitle: t("settings:general.notificationSound.volumeTitle"),
            previewTitle: t("settings:general.notificationSound.previewTitle"),
          }}
          previewPlayers={{
            playPreset: playNotificationSound,
            playCustom: playCustomNotificationSound,
          }}
          onPatch={(patch) =>
            updateSettings({
              patch: {
                ...(patch.enabled === undefined
                  ? {}
                  : { notificationSoundEnabled: patch.enabled }),
                ...(patch.mode === undefined
                  ? {}
                  : { notificationSoundMode: patch.mode }),
                ...(patch.preset === undefined
                  ? {}
                  : { notificationSoundPreset: patch.preset }),
                ...(patch.volume === undefined
                  ? {}
                  : { notificationSoundVolume: patch.volume }),
                ...(patch.customAudioData === undefined
                  ? {}
                  : {
                      notificationSoundCustomAudioData: patch.customAudioData,
                    }),
                ...(patch.customAudioName === undefined
                  ? {}
                  : {
                      notificationSoundCustomAudioName: patch.customAudioName,
                    }),
              },
            })
          }
        />
      </SettingsCard>
      <DesktopNotificationsCard />
      <SettingsCard
        title={t("settings:general.developerMode.title")}
        description={t("settings:general.developerMode.description")}
      >
        <SwitchField
          title={t("settings:general.developerMode.enableTitle")}
          description={t("settings:general.developerMode.enableDescription")}
          checked={developerModeEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ patch: { developerModeEnabled: checked } })
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
