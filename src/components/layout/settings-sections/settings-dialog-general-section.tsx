import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useShallow } from "zustand/react/shallow";
import {
  playCustomAttentionNotificationSound,
  playCustomNotificationSound,
  playAttentionNotificationSound,
  playNotificationSound,
} from "@/lib/notifications/notification-sound";
import { useAppStore } from "@/store/app.store";
import { StandaloneCliSettingsCard } from "@/components/layout/settings-dialog-standalone-cli-card";
import { DesktopNotificationsCard } from "./settings-dialog-desktop-notifications-card";
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
    attentionNotificationSoundEnabled,
    attentionNotificationSoundPreset,
    attentionNotificationSoundVolume,
    attentionNotificationSoundMode,
    attentionNotificationSoundCustomAudioData,
    attentionNotificationSoundCustomAudioName,
    developerModeEnabled,
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
          state.settings.attentionNotificationSoundEnabled,
          state.settings.attentionNotificationSoundPreset,
          state.settings.attentionNotificationSoundVolume,
          state.settings.attentionNotificationSoundMode,
          state.settings.attentionNotificationSoundCustomAudioData,
          state.settings.attentionNotificationSoundCustomAudioName,
          state.settings.developerModeEnabled,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { t } = useTranslation(I18N_NAMESPACES);

  return (
    <SectionStack>
      <LanguageSettingsCard />
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
      <SettingsCard
        title={t("settings:general.attentionSound.title")}
        description={t("settings:general.attentionSound.description")}
      >
        <NotificationSoundControls
          value={{
            enabled: attentionNotificationSoundEnabled,
            mode: attentionNotificationSoundMode,
            preset: attentionNotificationSoundPreset,
            volume: attentionNotificationSoundVolume,
            customAudioData: attentionNotificationSoundCustomAudioData,
            customAudioName: attentionNotificationSoundCustomAudioName,
          }}
          copy={{
            enableTitle: t("settings:general.attentionSound.enableTitle"),
            enableDescription: t("settings:general.attentionSound.enableDescription"),
            presetDescription: t("settings:general.attentionSound.presetDescription"),
            volumeDescription: t("settings:general.attentionSound.volumeDescription"),
            volumeAriaLabel: t("settings:general.attentionSound.volumeAriaLabel"),
            sourceTitle: t("settings:general.attentionSound.sourceTitle"),
            presetTitle: t("settings:general.attentionSound.presetTitle"),
            customAudioTitle: t("settings:general.attentionSound.customAudioTitle"),
            volumeTitle: t("settings:general.attentionSound.volumeTitle"),
            previewTitle: t("settings:general.attentionSound.previewTitle"),
          }}
          previewPlayers={{
            playPreset: playAttentionNotificationSound,
            playCustom: playCustomAttentionNotificationSound,
          }}
          onPatch={(patch) =>
            updateSettings({
              patch: {
                ...(patch.enabled === undefined
                  ? {}
                  : { attentionNotificationSoundEnabled: patch.enabled }),
                ...(patch.mode === undefined
                  ? {}
                  : { attentionNotificationSoundMode: patch.mode }),
                ...(patch.preset === undefined
                  ? {}
                  : { attentionNotificationSoundPreset: patch.preset }),
                ...(patch.volume === undefined
                  ? {}
                  : { attentionNotificationSoundVolume: patch.volume }),
                ...(patch.customAudioData === undefined
                  ? {}
                  : {
                      attentionNotificationSoundCustomAudioData:
                        patch.customAudioData,
                    }),
                ...(patch.customAudioName === undefined
                  ? {}
                  : {
                      attentionNotificationSoundCustomAudioName:
                        patch.customAudioName,
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
