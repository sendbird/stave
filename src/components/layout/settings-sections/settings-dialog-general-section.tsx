import { useRef, useState } from "react";
import { FileAudio, Upload, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Slider } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  CUSTOM_AUDIO_ACCEPTED_TYPES,
  CUSTOM_AUDIO_MAX_SIZE_BYTES,
  NOTIFICATION_SOUND_PRESETS,
  playCustomAttentionNotificationSound,
  playCustomNotificationSound,
  playAttentionNotificationSound,
  playNotificationSound,
  readFileAsDataUrl,
  validateCustomAudioFile,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import { useAppStore } from "@/store/app.store";
import { StandaloneCliSettingsCard } from "@/components/layout/settings-dialog-standalone-cli-card";
import {
  ChoiceButtons,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";

function formatNotificationSoundPresetLabel(preset: NotificationSoundPreset) {
  return `${preset.slice(0, 1).toUpperCase()}${preset.slice(1)}`;
}

const NOTIFICATION_SOUND_PRESET_OPTIONS: Array<{
  value: NotificationSoundPreset;
  label: string;
}> = NOTIFICATION_SOUND_PRESETS.map((preset) => ({
  value: preset,
  label: formatNotificationSoundPresetLabel(preset),
}));

interface NotificationSoundControlsValue {
  enabled: boolean;
  mode: "preset" | "custom";
  preset: NotificationSoundPreset;
  volume: number;
  customAudioData: string | null;
  customAudioName: string | null;
}

interface NotificationSoundControlsCopy {
  /** Label for the on/off toggle. */
  enableTitle: string;
  enableDescription: string;
  presetDescription: string;
  volumeDescription: string;
  /** aria-label for the volume slider — must be unique per card. */
  volumeAriaLabel: string;
  /**
   * Titles for the sub-fields. Because this editor is rendered once per sound
   * card, every field title becomes the accessible name of the control it
   * labels; they must be unique per card so screen readers (and role-based
   * queries) can tell the two "Source"/"Preset"/"Volume" groups apart.
   */
  sourceTitle: string;
  presetTitle: string;
  customAudioTitle: string;
  volumeTitle: string;
  previewTitle: string;
}

function NotificationSoundControls({
  value,
  copy,
  onPatch,
  previewPlayers,
}: {
  value: NotificationSoundControlsValue;
  copy: NotificationSoundControlsCopy;
  onPatch: (patch: Partial<NotificationSoundControlsValue>) => void;
  previewPlayers: {
    playPreset: (options: {
      preset: NotificationSoundPreset;
      volume: number;
    }) => void;
    playCustom: (options: { dataUrl: string; volume: number }) => void;
  };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const volumePercent = Math.round(value.volume * 100);

  const handleCustomAudioUpload = async (file: File) => {
    setUploadError(null);
    const error = validateCustomAudioFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onPatch({
        mode: "custom",
        customAudioData: dataUrl,
        customAudioName: file.name,
      });
    } catch {
      setUploadError("Failed to read the audio file.");
    }
  };

  const handleRemoveCustomAudio = () => {
    setUploadError(null);
    onPatch({
      mode: "preset",
      customAudioData: null,
      customAudioName: null,
    });
  };

  const handleTestSound = () => {
    if (value.mode === "custom" && value.customAudioData) {
      previewPlayers.playCustom({
        dataUrl: value.customAudioData,
        volume: value.volume,
      });
    } else {
      previewPlayers.playPreset({
        preset: value.preset,
        volume: value.volume,
      });
    }
  };

  return (
    <>
      <SwitchField
        title={copy.enableTitle}
        description={copy.enableDescription}
        checked={value.enabled}
        onCheckedChange={(checked) => onPatch({ enabled: checked })}
      />
      {value.enabled ? (
        <>
          <LabeledField
            title={copy.sourceTitle}
            description="Use a built-in preset or upload your own audio file."
          >
            <ChoiceButtons
              value={value.mode}
              onChange={(next) =>
                onPatch({ mode: next as "preset" | "custom" })
              }
              options={[
                { value: "preset", label: "Preset" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </LabeledField>
          {value.mode === "preset" ? (
            <LabeledField
              title={copy.presetTitle}
              description={copy.presetDescription}
            >
              <ChoiceButtons
                value={value.preset}
                onChange={(next) =>
                  onPatch({ preset: next as NotificationSoundPreset })
                }
                options={NOTIFICATION_SOUND_PRESET_OPTIONS}
              />
            </LabeledField>
          ) : (
            <LabeledField
              title={copy.customAudioTitle}
              description={`Upload an audio file (MP3, WAV, OGG, M4A, WebM). Max ${CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024} KB.`}
            >
              <div className={sx(styles.stackSm)}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CUSTOM_AUDIO_ACCEPTED_TYPES.join(",")}
                  className={sx(styles.hiddenInput)}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void handleCustomAudioUpload(file);
                    }
                    // Reset so the same file can be re-selected
                    e.target.value = "";
                  }}
                />
                {value.customAudioName ? (
                  <div className={sx(styles.audioNameRow)}>
                    <div className={sx(styles.audioNameChip)}>
                      <FileAudio className={sx(styles.audioIcon)} />
                      <span className={sx(styles.truncate)}>
                        {value.customAudioName}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className={sx(styles.buttonIconLeading)} />
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRemoveCustomAudio}
                    >
                      <X className={sx(styles.buttonIconLeading)} />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className={sx(styles.buttonIconLeading)} />
                    Upload Audio File
                  </Button>
                )}
                {uploadError ? (
                  <p className={sx(styles.errorText)}>{uploadError}</p>
                ) : null}
              </div>
            </LabeledField>
          )}
          <LabeledField
            title={copy.volumeTitle}
            description={copy.volumeDescription}
          >
            <div className={sx(styles.sliderRow)}>
              <Slider
                aria-label={copy.volumeAriaLabel}
                className={sx(styles.sliderFlex)}
                value={volumePercent}
                min={0}
                max={100}
                step={1}
                onValueChange={(nextValue) => {
                  onPatch({ volume: nextValue / 100 });
                }}
              />
              <Badge variant="outline" className={sx(styles.valueBadge)}>
                {volumePercent}%
              </Badge>
            </div>
          </LabeledField>
          <LabeledField
            title={copy.previewTitle}
            description={
              value.mode === "custom"
                ? "Play the uploaded audio once with the current volume."
                : "Play the current preset once with the current volume."
            }
          >
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestSound}
              disabled={value.mode === "custom" && !value.customAudioData}
            >
              Test Sound
            </Button>
          </LabeledField>
        </>
      ) : null}
    </>
  );
}

export function GeneralSection() {
  const [
    confirmBeforeClose,
    nativeNotificationsEnabled,
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
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.confirmBeforeClose,
          state.settings.nativeNotificationsEnabled,
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
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Window Behavior"
          description="Control how the app handles the close shortcut."
        >
          <SwitchField
            title="Confirm Before Close"
            description="Show a confirmation dialog before closing the app with ⌘W / Ctrl+W when no tabs or tasks are open."
            checked={confirmBeforeClose}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { confirmBeforeClose: checked } })
            }
          />
        </SettingsCard>
        <StandaloneCliSettingsCard />
        <SettingsCard
          title="Notification Sound"
          description="Customize the success sound played when a task turn finishes."
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
              enableTitle: "Sound",
              enableDescription: "Enable or mute the task completion sound.",
              presetDescription:
                "Choose the synthesized tone used for task completion.",
              volumeDescription:
                "Adjust playback level for the task completion sound.",
              volumeAriaLabel: "Notification sound volume",
              sourceTitle: "Source",
              presetTitle: "Preset",
              customAudioTitle: "Custom Audio",
              volumeTitle: "Volume",
              previewTitle: "Preview",
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
          title="Attention Sound"
          description="Customize the sound played when the AI asks you a question or requests permission and is waiting on you."
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
              enableTitle: "Attention chime",
              enableDescription:
                "Play a sound when the AI needs your input or approval.",
              presetDescription:
                "Choose the synthesized tone used when the AI needs you.",
              volumeDescription:
                "Adjust playback level for the attention sound.",
              volumeAriaLabel: "Attention sound volume",
              sourceTitle: "Attention chime origin",
              presetTitle: "Attention chime tone",
              customAudioTitle: "Attention chime upload",
              volumeTitle: "Attention chime level",
              previewTitle: "Attention chime test",
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
        <SettingsCard
          title="Desktop Notifications"
          description="Show task completion, approval, and input requests through the operating system."
        >
          <SwitchField
            title="Native Notifications"
            description="Notify you when a task needs attention outside the active workspace."
            checked={nativeNotificationsEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { nativeNotificationsEnabled: checked } })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
