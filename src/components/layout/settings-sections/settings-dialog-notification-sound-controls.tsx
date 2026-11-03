import { useState } from "react";
import { FileAudio, X } from "lucide-react";
import { Badge, Slider } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { FileUpload, type FileUploadItem } from "@/components/ads/components/FileUpload";
import { acceptAttribute } from "@/lib/files/file-drop";
import { sx } from "@/components/ads/utils/stylex";
import { useTranslation, type I18nKey } from "@/i18n";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  CUSTOM_AUDIO_ACCEPT,
  CUSTOM_AUDIO_MAX_SIZE_BYTES,
  NOTIFICATION_SOUND_PRESETS,
  readFileAsDataUrl,
  validateCustomAudioFile,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import { ChoiceButtons, LabeledField, SwitchField } from "../settings-dialog.shared";

const NO_FILES: File[] = [];
const NO_UPLOADS: FileUploadItem[] = [];

const NOTIFICATION_SOUND_PRESET_LABEL_KEYS = {
  chime: "settings:general.soundControls.presets.chime",
  bell: "settings:general.soundControls.presets.bell",
  pulse: "settings:general.soundControls.presets.pulse",
  bright: "settings:general.soundControls.presets.bright",
  harvest: "settings:general.soundControls.presets.harvest",
} as const satisfies Record<NotificationSoundPreset, I18nKey>;

export interface NotificationSoundControlsValue {
  enabled: boolean;
  mode: "preset" | "custom";
  preset: NotificationSoundPreset;
  volume: number;
  customAudioData: string | null;
  customAudioName: string | null;
}

export interface NotificationSoundControlsCopy {
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

export function NotificationSoundControls({
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
  const { t } = useTranslation(["settings", "common"]);
  // A refused or unreadable file stays as a row that says why, until dismissed or replaced.
  const [rejected, setRejected] = useState<{ file: File; reason: string } | null>(null);
  const volumePercent = Math.round(value.volume * 100);
  const maxKb = CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024;

  const handleCustomAudioUpload = async (file: File | undefined) => {
    setRejected(null);
    if (!file) return;
    const refusal = validateCustomAudioFile(file);
    if (refusal) {
      setRejected({ file, reason: refusal === "type" ? t("general.soundControls.wrongType") : t("general.soundControls.tooLarge", { maxKb }) });
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
      setRejected({ file, reason: t("general.soundControls.readFailed") });
    }
  };

  const handleRemoveCustomAudio = () => {
    setRejected(null);
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
            description={t("general.soundControls.sourceDescription")}
          >
            <ChoiceButtons
              value={value.mode}
              onChange={(next) =>
                onPatch({ mode: next as "preset" | "custom" })
              }
              options={[
                { value: "preset", label: t("general.soundControls.sourcePreset") },
                { value: "custom", label: t("common:labels.custom") },
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
                options={NOTIFICATION_SOUND_PRESETS.map((preset) => ({
                  value: preset,
                  label: t(NOTIFICATION_SOUND_PRESET_LABEL_KEYS[preset]),
                }))}
              />
            </LabeledField>
          ) : (
            <LabeledField
              title={copy.customAudioTitle}
              description={t("general.soundControls.customAudioDescription", {
                maxKb: CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024,
              })}
            >
              <div className={sx(styles.stackSm)}>
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
                      onClick={handleRemoveCustomAudio}
                    >
                      <X className={sx(styles.buttonIconLeading)} />
                      {t("common:actions.remove")}
                    </Button>
                  </div>
                ) : null}
                <FileUpload
                  variant="compact"
                  accept={acceptAttribute(CUSTOM_AUDIO_ACCEPT)}
                  files={NO_FILES}
                  label={t("general.soundControls.dropLabel")}
                  description={t("general.soundControls.dropHint", { maxKb })}
                  actionLabel={value.customAudioName ? t("general.soundControls.replace") : t("general.soundControls.choose")}
                  uploads={rejected ? [{ id: "rejected", file: rejected.file, status: "failed", error: rejected.reason }] : NO_UPLOADS}
                  removeLabel={(name) => t("general.soundControls.dismiss", { name })}
                  onRemove={() => setRejected(null)}
                  onChange={(files) => void handleCustomAudioUpload(files[0])}
                  data-notification-sound-import=""
                />
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
                ? t("general.soundControls.previewCustomDescription")
                : t("general.soundControls.previewPresetDescription")
            }
          >
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestSound}
              disabled={value.mode === "custom" && !value.customAudioData}
            >
              {t("general.soundControls.testSound")}
            </Button>
          </LabeledField>
        </>
      ) : null}
    </>
  );
}
